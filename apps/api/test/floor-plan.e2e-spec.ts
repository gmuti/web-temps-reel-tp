import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { OrderSocketEvent, UserRole } from '@app/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  connectSocket,
  createDish,
  registerToken as register,
  type ClientSocket,
} from './realtime-test-utils.js';

describe('Plan de salle (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  let prisma: PrismaService;
  let withPlan: string;
  let withoutPlan: string;
  let dishWithPlan: string;
  let dishWithoutPlan: string;
  let waiterToken: string;
  const sockets: ClientSocket[] = [];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);
    url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);

    withPlan = (
      await prisma.restaurant.create({ data: { name: 'Avec plan', slug: `test-${randomUUID()}` } })
    ).id;
    withoutPlan = (
      await prisma.restaurant.create({ data: { name: 'Sans plan', slug: `test-${randomUUID()}` } })
    ).id;
    // Créées dans le désordre : le plan est renvoyé trié par numéro.
    await prisma.diningTable.createMany({
      data: [
        { restaurantId: withPlan, number: 7, x: 0, z: 2, shape: 'long', seats: 4 },
        { restaurantId: withPlan, number: 1, x: -6, z: -1, shape: 'small', seats: 2 },
      ],
    });
    dishWithPlan = await createDish(prisma, withPlan);
    dishWithoutPlan = await createDish(prisma, withoutPlan);
    waiterToken = await register(app, UserRole.WAITER, withPlan);
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
  });

  function postOrder(token: string, tableNumber: number, dishId: string) {
    return request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${token}`)
      .send({
        tableNumber,
        items: [{ dishId, quantity: 1 }],
        clientOrderId: `client-order-${randomUUID()}`,
      });
  }

  it('GET /floor-plan renvoie les tables du restaurant, triées par numéro', async () => {
    const response = await request(app.getHttpServer())
      .get('/floor-plan')
      .set('Authorization', `Bearer ${waiterToken}`)
      .expect(200);

    expect(response.body).toEqual({
      tables: [
        { number: 1, x: -6, z: -1, shape: 'small', seats: 2 },
        { number: 7, x: 0, z: 2, shape: 'long', seats: 4 },
      ],
      version: 0,
    });
  });

  it("GET /floor-plan renvoie un plan vide pour un restaurant qui n'a pas décrit sa salle", async () => {
    const token = await register(app, UserRole.RESPONSABLE, withoutPlan);
    const response = await request(app.getHttpServer())
      .get('/floor-plan')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(response.body).toEqual({ tables: [], version: 0 });
  });

  it('GET /floor-plan exige une authentification', async () => {
    await request(app.getHttpServer()).get('/floor-plan').expect(401);
  });

  it('POST /orders accepte une table du plan et refuse les autres (UNKNOWN_TABLE)', async () => {
    await postOrder(waiterToken, 7, dishWithPlan).expect(201);

    const refused = await postOrder(waiterToken, 42, dishWithPlan).expect(400);
    expect(refused.body.errorCode).toBe('UNKNOWN_TABLE');
    const ordersOnUnknownTable = await prisma.order.count({
      where: { restaurantId: withPlan, tableNumber: 42 },
    });
    expect(ordersOnUnknownTable).toBe(0);
  });

  it('order:create refuse aussi une table absente du plan, par accusé de réception', async () => {
    const socket = await connectSocket(url, sockets, waiterToken);
    const ack = await socket.emitWithAck(OrderSocketEvent.CREATE, {
      tableNumber: 42,
      items: [{ dishId: dishWithPlan, quantity: 1 }],
      clientOrderId: `client-order-${randomUUID()}`,
    });
    expect(ack).toMatchObject({ accepted: false, errorCode: 'UNKNOWN_TABLE' });
  });

  it('un restaurant sans plan accepte tout numéro de table', async () => {
    const token = await register(app, UserRole.WAITER, withoutPlan);
    await postOrder(token, 42, dishWithoutPlan).expect(201);
  });
});
