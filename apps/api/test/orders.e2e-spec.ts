import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createOrderInputSchema, OrderStatus, UserRole } from '@app/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createDish } from './realtime-test-utils.js';

describe('OrdersService (e2e)', () => {
  let app: INestApplication<App>;
  let ordersService: OrdersService;
  let prisma: PrismaService;
  let restaurantId: string;
  let waiterId: string;
  let accessToken: string;
  let burgerId: string;
  let waterId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    ordersService = app.get(OrdersService);
    prisma = app.get(PrismaService);

    const restaurant = await prisma.restaurant.create({
      data: { name: 'Le Bon Test', slug: `test-${randomUUID()}` },
    });
    restaurantId = restaurant.id;
    burgerId = await createDish(prisma, restaurantId, 'Burger végétarien', 12.5);
    waterId = await createDish(prisma, restaurantId, 'Eau gazeuse', 3);

    // Le compte est créé via /auth/register pour obtenir un vrai jeton, exploitable
    // par les tests HTTP ci-dessous (POST/GET /orders exigent une authentification).
    const registerResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: `waiter-${randomUUID()}@restaurant.test`,
      password: 'un-mot-de-passe-solide',
      name: 'Alex Serveur',
      role: UserRole.WAITER,
      restaurantId,
    });
    waiterId = registerResponse.body.user.id;
    accessToken = registerResponse.body.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  async function registerToken(
    role: UserRole,
    targetRestaurantId = restaurantId,
  ): Promise<string> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({
        email: `${role.toLowerCase()}-${randomUUID()}@restaurant.test`,
        password: 'un-mot-de-passe-solide',
        name: `Test ${role}`,
        role,
        restaurantId: targetRestaurantId,
      })
      .expect(201);
    return response.body.accessToken;
  }

  async function createPendingOrder(): Promise<string> {
    const order = await ordersService.create(
      createOrderInputSchema.parse({
        restaurantId,
        tableNumber: 4,
        items: [{ dishId: burgerId, quantity: 1 }],
        clientOrderId: `client-order-${randomUUID()}`,
      }),
      waiterId,
    );
    return order.id;
  }

  function patchStatus(
    orderId: string,
    token: string,
    expectedStatus: OrderStatus,
    requestedStatus: OrderStatus,
  ) {
    return request(app.getHttpServer())
      .patch(`/orders/${orderId}/status`)
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedStatus, requestedStatus });
  }

  describe('PATCH /orders/:orderId/status', () => {
    let cookToken: string;
    let responsableToken: string;

    beforeAll(async () => {
      cookToken = await registerToken(UserRole.COOK);
      responsableToken = await registerToken(UserRole.RESPONSABLE);
    });

    it('fait suivre le cycle complet selon les rôles (serveur → cuisine → serveur)', async () => {
      const orderId = await createPendingOrder();

      const validated = await patchStatus(
        orderId,
        accessToken,
        OrderStatus.A_VALIDER,
        OrderStatus.VALIDEE,
      ).expect(200);
      expect(validated.body.status).toBe(OrderStatus.VALIDEE);

      await patchStatus(
        orderId,
        cookToken,
        OrderStatus.VALIDEE,
        OrderStatus.EN_PREPARATION,
      ).expect(200);
      await patchStatus(
        orderId,
        cookToken,
        OrderStatus.EN_PREPARATION,
        OrderStatus.PRETE,
      ).expect(200);
      const served = await patchStatus(
        orderId,
        accessToken,
        OrderStatus.PRETE,
        OrderStatus.SERVIE,
      ).expect(200);
      expect(served.body.status).toBe(OrderStatus.SERVIE);
    });

    it('refuse une transition interdite au rôle (403)', async () => {
      const orderId = await createPendingOrder();

      const asCook = await patchStatus(
        orderId,
        cookToken,
        OrderStatus.A_VALIDER,
        OrderStatus.VALIDEE,
      ).expect(403);
      expect(asCook.body.errorCode).toBe('FORBIDDEN_TRANSITION');
      await patchStatus(
        orderId,
        accessToken,
        OrderStatus.A_VALIDER,
        OrderStatus.ANNULEE,
      ).expect(403);

      const stored = await prisma.order.findUniqueOrThrow({
        where: { id: orderId },
      });
      expect(stored.status).toBe(OrderStatus.A_VALIDER);
    });

    it('laisse le responsable annuler une commande', async () => {
      const orderId = await createPendingOrder();

      const response = await patchStatus(
        orderId,
        responsableToken,
        OrderStatus.A_VALIDER,
        OrderStatus.ANNULEE,
      ).expect(200);
      expect(response.body.status).toBe(OrderStatus.ANNULEE);
    });

    it('refuse une transition absente du cycle de vie (422)', async () => {
      const orderId = await createPendingOrder();

      const response = await patchStatus(
        orderId,
        responsableToken,
        OrderStatus.A_VALIDER,
        OrderStatus.PRETE,
      ).expect(422);
      expect(response.body.errorCode).toBe('INVALID_TRANSITION');
    });

    it('détecte une modification concurrente via expectedStatus (409)', async () => {
      const orderId = await createPendingOrder();
      await patchStatus(
        orderId,
        accessToken,
        OrderStatus.A_VALIDER,
        OrderStatus.VALIDEE,
      ).expect(200);

      // Un second client, resté sur l'ancien état, demande la même transition.
      const response = await patchStatus(
        orderId,
        responsableToken,
        OrderStatus.A_VALIDER,
        OrderStatus.ANNULEE,
      ).expect(409);
      expect(response.body).toMatchObject({
        errorCode: 'STATUS_CONFLICT',
        currentStatus: OrderStatus.VALIDEE,
      });
    });

    it("n'accepte que les commandes du restaurant de l'utilisateur (404)", async () => {
      const orderId = await createPendingOrder();
      const otherRestaurant = await prisma.restaurant.create({
        data: { name: 'Ailleurs', slug: `test-${randomUUID()}` },
      });
      const outsiderToken = await registerToken(
        UserRole.RESPONSABLE,
        otherRestaurant.id,
      );

      const response = await patchStatus(
        orderId,
        outsiderToken,
        OrderStatus.A_VALIDER,
        OrderStatus.VALIDEE,
      ).expect(404);
      expect(response.body.errorCode).toBe('ORDER_NOT_FOUND');
    });
  });

  it('enregistre une commande avec ses articles, statut initial À valider', async () => {
    const input = createOrderInputSchema.parse({
      restaurantId,
      tableNumber: 12,
      items: [
        { dishId: burgerId, quantity: 2, note: 'Sans oignons' },
        { dishId: waterId, quantity: 1 },
      ],
      comment: 'Allergie aux noix',
      clientOrderId: `client-order-${randomUUID()}`,
    });

    const order = await ordersService.create(input, waiterId);

    expect(order.status).toBe(OrderStatus.A_VALIDER);
    expect(order.tableNumber).toBe(12);
    expect(order.items).toHaveLength(2);
    expect(order.items.map((item) => item.meal)).toEqual(['Burger végétarien', 'Eau gazeuse']);
    // Nom et prix viennent de la carte, la contrainte est propre à chaque plat.
    expect(order.items.map((item) => item.price)).toEqual([12.5, 3]);
    expect(order.items.map((item) => item.note)).toEqual(['Sans oignons', null]);
    expect(order.items[0].imageUrl).toBe('/dishes/test.svg');

    const stored = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
      include: { items: true },
    });
    expect(stored.items).toHaveLength(2);
  });

  it('est idempotente vis-à-vis de clientOrderId (pas de doublon en cas de rejeu)', async () => {
    const input = createOrderInputSchema.parse({
      restaurantId,
      tableNumber: 5,
      items: [{ dishId: burgerId, quantity: 1 }],
      clientOrderId: `client-order-${randomUUID()}`,
    });

    const first = await ordersService.create(input, waiterId);
    const replay = await ordersService.create(input, waiterId);

    expect(replay.id).toBe(first.id);

    const count = await prisma.order.count({ where: { clientOrderId: input.clientOrderId } });
    expect(count).toBe(1);
  });

  it('POST /orders crée une commande via HTTP (authentifié)', async () => {
    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        tableNumber: 8,
        items: [{ dishId: waterId, quantity: 1 }],
        clientOrderId: `client-order-${randomUUID()}`,
      })
      .expect(201);

    expect(response.body).toMatchObject({
      restaurantId,
      tableNumber: 8,
      status: OrderStatus.A_VALIDER,
      waiterId,
    });
    expect(response.body.items).toHaveLength(1);
  });

  it('POST /orders rejette une charge invalide (400)', async () => {
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ tableNumber: 8 })
      .expect(400);
  });

  it('GET /orders renvoie les commandes en cours du restaurant authentifié', async () => {
    const input = createOrderInputSchema.parse({
      restaurantId,
      tableNumber: 3,
      items: [{ dishId: waterId, quantity: 1 }],
      clientOrderId: `client-order-${randomUUID()}`,
    });
    const created = await ordersService.create(input, waiterId);

    const response = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(Array.isArray(response.body)).toBe(true);
    expect(response.body.some((order: { id: string }) => order.id === created.id)).toBe(true);
    expect(
      response.body.every(
        (order: { status: string }) => ['SERVIE', 'ANNULEE'].includes(order.status) === false,
      ),
    ).toBe(true);
  });

  it("POST /orders refuse un plat absent de la carte du restaurant (400)", async () => {
    const other = await prisma.restaurant.create({
      data: { name: 'Ailleurs', slug: `test-${randomUUID()}` },
    });
    const foreignDishId = await createDish(prisma, other.id);

    const response = await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        tableNumber: 8,
        items: [{ dishId: foreignDishId, quantity: 1 }],
        clientOrderId: `client-order-${randomUUID()}`,
      })
      .expect(400);
    expect(response.body.errorCode).toBe('UNKNOWN_DISH');
  });

  it('un serveur ne voit et ne modifie que ses propres commandes', async () => {
    const otherWaiterToken = await registerToken(UserRole.WAITER);
    const responsableToken = await registerToken(UserRole.RESPONSABLE);
    const mine = await createPendingOrder();

    const asOtherWaiter = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${otherWaiterToken}`)
      .expect(200);
    expect(asOtherWaiter.body.some((order: { id: string }) => order.id === mine)).toBe(false);

    const asResponsable = await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${responsableToken}`)
      .expect(200);
    expect(asResponsable.body.some((order: { id: string }) => order.id === mine)).toBe(true);

    await patchStatus(mine, otherWaiterToken, OrderStatus.A_VALIDER, OrderStatus.VALIDEE).expect(
      404,
    );
  });

  it('GET /dishes renvoie la carte du restaurant authentifié', async () => {
    const response = await request(app.getHttpServer())
      .get('/dishes')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(response.body.map((dish: { name: string }) => dish.name)).toEqual([
      'Burger végétarien',
      'Eau gazeuse',
    ]);
    expect(response.body[0]).toMatchObject({ price: 12.5, imageUrl: '/dishes/test.svg' });
  });
});
