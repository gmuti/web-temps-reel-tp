import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createOrderInputSchema, OrderStatus, UserRole } from '@app/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { OrdersService } from '../src/orders/orders.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';

describe('OrdersService (e2e)', () => {
  let app: INestApplication<App>;
  let ordersService: OrdersService;
  let prisma: PrismaService;
  let restaurantId: string;
  let waiterId: string;
  let accessToken: string;

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

  it('enregistre une commande avec ses articles, statut initial À valider', async () => {
    const input = createOrderInputSchema.parse({
      restaurantId,
      tableNumber: 12,
      items: [
        { meal: 'Burger végétarien', quantity: 2, price: 12.5 },
        { meal: 'Eau gazeuse', quantity: 1, price: 3 },
      ],
      comment: 'Sans oignons',
      clientOrderId: `client-order-${randomUUID()}`,
    });

    const order = await ordersService.create(input, waiterId);

    expect(order.status).toBe(OrderStatus.A_VALIDER);
    expect(order.tableNumber).toBe(12);
    expect(order.items).toHaveLength(2);
    expect(order.items.map((item) => item.meal)).toEqual(['Burger végétarien', 'Eau gazeuse']);
    expect(order.items.map((item) => item.price)).toEqual([12.5, 3]);

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
      items: [{ meal: 'Pizza Margherita', quantity: 1, price: 11 }],
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
        items: [{ meal: 'Salade César', quantity: 1, price: 9.9 }],
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
      items: [{ meal: 'Tarte du jour', quantity: 1, price: 6 }],
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
});
