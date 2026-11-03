import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FloorSocketEvent, UserRole, type FloorTable } from '@app/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  collect,
  connectSocket,
  createDish,
  registerToken as register,
  type ClientSocket,
} from './realtime-test-utils.js';

describe('Éditeur de plan de salle (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  let prisma: PrismaService;
  let restaurantId: string;
  let managerToken: string;
  let waiterToken: string;
  const sockets: ClientSocket[] = [];

  const INITIAL: FloorTable[] = [
    { number: 1, x: -5, z: 0, shape: 'small', seats: 2 },
    { number: 2, x: 0, z: 0, shape: 'long', seats: 4 },
    { number: 3, x: 5, z: 0, shape: 'long', seats: 4 },
  ];

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);
    url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;
    prisma = app.get(PrismaService);

    restaurantId = (
      await prisma.restaurant.create({ data: { name: 'Éditeur', slug: `test-${randomUUID()}` } })
    ).id;
    await prisma.diningTable.createMany({
      data: INITIAL.map((table) => ({ ...table, restaurantId })),
    });
    managerToken = await register(app, UserRole.MANAGER, restaurantId);
    waiterToken = await register(app, UserRole.WAITER, restaurantId);
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
  });

  function putPlan(token: string, expectedVersion: number, tables: FloorTable[]) {
    return request(app.getHttpServer())
      .put('/floor-plan')
      .set('Authorization', `Bearer ${token}`)
      .send({ expectedVersion, tables });
  }

  async function currentVersion(): Promise<number> {
    const response = await request(app.getHttpServer())
      .get('/floor-plan')
      .set('Authorization', `Bearer ${managerToken}`)
      .expect(200);
    return response.body.version;
  }

  it('déplace, ajoute et retire des tables, et le diffuse à tout le restaurant', async () => {
    const waiter = await connectSocket(url, sockets, waiterToken);
    const updates = collect(waiter, FloorSocketEvent.UPDATED);

    const next: FloorTable[] = [
      { number: 1, x: -5, z: 3, shape: 'small', seats: 2 },
      { number: 2, x: 0, z: 0, shape: 'long', seats: 4 },
      { number: 4, x: 5, z: 3, shape: 'small', seats: 2 },
    ];
    const response = await putPlan(managerToken, 0, next).expect(200);
    expect(response.body).toEqual({ tables: next, version: 1 });

    const received = await updates;
    expect(received).toHaveLength(1);
    expect(received[0]).toEqual({ tables: next, version: 1 });
    // La nouvelle table est libre.
    const added = await prisma.diningTable.findUniqueOrThrow({
      where: { restaurantId_number: { restaurantId, number: 4 } },
    });
    expect(added.status).toBe('LIBRE');
  });

  it('refuse un plan modifié entre-temps (FLOOR_PLAN_CONFLICT)', async () => {
    const response = await putPlan(managerToken, 0, INITIAL).expect(409);
    expect(response.body.errorCode).toBe('FLOOR_PLAN_CONFLICT');
  });

  it('réserve la modification du plan au manager', async () => {
    const version = await currentVersion();
    const response = await putPlan(waiterToken, version, INITIAL).expect(403);
    expect(response.body.errorCode).toBe('FORBIDDEN_TRANSITION');
  });

  it('refuse des tables qui se chevauchent ou sortent de la salle', async () => {
    const version = await currentVersion();
    const overlapping = await putPlan(managerToken, version, [
      { number: 1, x: 0, z: 0, shape: 'long', seats: 4 },
      { number: 2, x: 1, z: 0, shape: 'long', seats: 4 },
    ]).expect(400);
    expect(JSON.stringify(overlapping.body)).toContain('se chevauchent');

    await putPlan(managerToken, version, [
      { number: 1, x: 7.5, z: 0, shape: 'long', seats: 4 },
    ]).expect(400);
    await putPlan(managerToken, version, [
      { number: 1, x: 0, z: 0, shape: 'small', seats: 3 },
    ]).expect(400);
    // Un plan refusé ne change pas la version.
    expect(await currentVersion()).toBe(version);
  });

  it('refuse de retirer une table occupée ou qui a des commandes en cours (TABLE_IN_USE)', async () => {
    const dishId = await createDish(prisma, restaurantId);
    // Une commande à la table 2 l'occupe.
    await request(app.getHttpServer())
      .post('/orders')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({
        tableNumber: 2,
        items: [{ dishId, quantity: 1 }],
        clientOrderId: `client-order-${randomUUID()}`,
      })
      .expect(201);

    const version = await currentVersion();
    const response = await putPlan(managerToken, version, [
      { number: 1, x: -5, z: 3, shape: 'small', seats: 2 },
      { number: 4, x: 5, z: 3, shape: 'small', seats: 2 },
    ]).expect(409);
    expect(response.body.errorCode).toBe('TABLE_IN_USE');
    expect(response.body.message).toContain('2');
    // Rien n'a changé : la transaction est annulée, version comprise.
    expect(await currentVersion()).toBe(version);

    // Déplacer une table en service reste possible.
    await putPlan(managerToken, version, [
      { number: 1, x: -5, z: 3, shape: 'small', seats: 2 },
      { number: 2, x: 0, z: 1, shape: 'long', seats: 4 },
      { number: 4, x: 5, z: 3, shape: 'small', seats: 2 },
    ]).expect(200);
  });
});
