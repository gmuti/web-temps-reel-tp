import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrderSocketEvent,
  TableSocketEvent,
  UserRole,
  type TableStatusUpdatedEvent,
} from '@app/shared';
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

describe('Occupation des tables (e2e)', () => {
  let app: INestApplication<App>;
  let url: string;
  let restaurantId: string;
  let otherRestaurantId: string;
  let dishId: string;
  let waiterToken: string;
  let responsableToken: string;
  const sockets: ClientSocket[] = [];

  let waiter: ClientSocket;
  let cook: ClientSocket;
  let otherRestaurant: ClientSocket;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);
    url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;

    const prisma = app.get(PrismaService);
    restaurantId = (
      await prisma.restaurant.create({ data: { name: 'Tables', slug: `test-${randomUUID()}` } })
    ).id;
    otherRestaurantId = (
      await prisma.restaurant.create({ data: { name: 'Ailleurs', slug: `test-${randomUUID()}` } })
    ).id;
    await prisma.diningTable.createMany({
      data: [
        { restaurantId, number: 1, x: 0, z: 0, shape: 'small', seats: 2 },
        { restaurantId, number: 2, x: 3, z: 0, shape: 'long', seats: 4 },
        { restaurantId, number: 3, x: 6, z: 0, shape: 'long', seats: 4 },
        { restaurantId: otherRestaurantId, number: 1, x: 0, z: 0, shape: 'small', seats: 2 },
      ],
    });
    dishId = await createDish(prisma, restaurantId);

    waiterToken = await register(app, UserRole.WAITER, restaurantId);
    responsableToken = await register(app, UserRole.RESPONSABLE, restaurantId);
    waiter = await connectSocket(url, sockets, waiterToken);
    cook = await connectSocket(url, sockets, await register(app, UserRole.COOK, restaurantId));
    otherRestaurant = await connectSocket(
      url,
      sockets,
      await register(app, UserRole.RESPONSABLE, otherRestaurantId),
    );
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
  });

  function setStatus(
    socket: ClientSocket,
    tableNumber: number,
    expectedStatus: 'LIBRE' | 'OCCUPEE' | 'A_DEBARRASSER',
    requestedStatus: 'LIBRE' | 'OCCUPEE' | 'A_DEBARRASSER',
    guests?: number,
  ) {
    return socket.emitWithAck(TableSocketEvent.STATUS_UPDATE, {
      tableNumber,
      expectedStatus,
      requestedStatus,
      guests,
    });
  }

  const ofTable = (tableNumber: number) => (event: TableStatusUpdatedEvent) =>
    event.number === tableNumber;

  it("table:sync renvoie l'occupation des tables du restaurant", async () => {
    const ack = await cook.emitWithAck(TableSocketEvent.SYNC, {});
    if (!ack.accepted) throw new Error('synchronisation refusée');
    expect(
      ack.tables.map(({ number, status, guests, version }) => ({
        number,
        status,
        guests,
        version,
      })),
    ).toEqual([
      { number: 1, status: 'LIBRE', guests: null, version: 0 },
      { number: 2, status: 'LIBRE', guests: null, version: 0 },
      { number: 3, status: 'LIBRE', guests: null, version: 0 },
    ]);
  });

  it('installer des clients est diffusé à tout le restaurant, et uniquement à lui', async () => {
    const cookEvents = collect(cook, TableSocketEvent.STATUS_UPDATED);
    const otherEvents = collect(otherRestaurant, TableSocketEvent.STATUS_UPDATED);

    const ack = await setStatus(waiter, 1, 'LIBRE', 'OCCUPEE', 2);
    expect(ack).toEqual({ accepted: true, tableNumber: 1 });

    const received = (await cookEvents).filter(ofTable(1));
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      number: 1,
      status: 'OCCUPEE',
      previousStatus: 'LIBRE',
      guests: 2,
      version: 1,
    });
    expect(await otherEvents).toHaveLength(0);
  });

  it('refuse un état attendu dépassé (STATUS_CONFLICT)', async () => {
    const ack = await setStatus(waiter, 1, 'LIBRE', 'OCCUPEE', 2);
    expect(ack).toMatchObject({
      accepted: false,
      errorCode: 'STATUS_CONFLICT',
      currentStatus: 'OCCUPEE',
    });
  });

  it('refuse un rôle sans droit, une transition invalide et une table inconnue', async () => {
    expect(await setStatus(cook, 2, 'LIBRE', 'OCCUPEE')).toMatchObject({
      accepted: false,
      errorCode: 'FORBIDDEN_TRANSITION',
    });
    expect(await setStatus(waiter, 2, 'LIBRE', 'A_DEBARRASSER')).toMatchObject({
      accepted: false,
      errorCode: 'INVALID_TRANSITION',
    });
    expect(await setStatus(waiter, 42, 'LIBRE', 'OCCUPEE')).toMatchObject({
      accepted: false,
      errorCode: 'TABLE_NOT_FOUND',
    });
  });

  it("une commande prise à une table libre l'occupe, qui ne se libère qu'une fois servie", async () => {
    const tableEvents = collect(cook, TableSocketEvent.STATUS_UPDATED);
    const created = await waiter.emitWithAck(OrderSocketEvent.CREATE, {
      tableNumber: 2,
      items: [{ dishId, quantity: 1 }],
      clientOrderId: `client-order-${randomUUID()}`,
    });
    if (!created.accepted) throw new Error('création refusée');

    expect((await tableEvents).filter(ofTable(2))).toEqual([
      expect.objectContaining({ status: 'OCCUPEE', previousStatus: 'LIBRE', guests: null }),
    ]);

    // Commande en cours : les clients ne peuvent pas être partis.
    expect(await setStatus(waiter, 2, 'OCCUPEE', 'A_DEBARRASSER')).toMatchObject({
      accepted: false,
      errorCode: 'TABLE_HAS_ACTIVE_ORDERS',
    });

    // Une fois la commande annulée (le responsable seul le peut), la table se libère.
    await request(app.getHttpServer())
      .patch(`/orders/${created.orderId}/status`)
      .set('Authorization', `Bearer ${responsableToken}`)
      .send({ expectedStatus: 'A_VALIDER', requestedStatus: 'ANNULEE' })
      .expect(200);
    expect(await setStatus(waiter, 2, 'OCCUPEE', 'A_DEBARRASSER')).toEqual({
      accepted: true,
      tableNumber: 2,
    });
  });

  it('une commande à une table déjà occupée ne change pas son occupation', async () => {
    const tableEvents = collect(cook, TableSocketEvent.STATUS_UPDATED);
    const created = await waiter.emitWithAck(OrderSocketEvent.CREATE, {
      tableNumber: 1,
      items: [{ dishId, quantity: 1 }],
      clientOrderId: `client-order-${randomUUID()}`,
    });
    expect(created.accepted).toBe(true);
    expect((await tableEvents).filter(ofTable(1))).toHaveLength(0);
  });

  it('PATCH /floor-plan/tables/:number/status applique les mêmes règles et diffuse', async () => {
    const cookEvents = collect(cook, TableSocketEvent.STATUS_UPDATED);
    const response = await request(app.getHttpServer())
      .patch('/floor-plan/tables/3/status')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ expectedStatus: 'LIBRE', requestedStatus: 'OCCUPEE', guests: 4 })
      .expect(200);
    expect(response.body).toMatchObject({ number: 3, status: 'OCCUPEE', guests: 4, version: 1 });
    expect((await cookEvents).filter(ofTable(3))).toHaveLength(1);

    const conflict = await request(app.getHttpServer())
      .patch('/floor-plan/tables/3/status')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ expectedStatus: 'LIBRE', requestedStatus: 'OCCUPEE' })
      .expect(409);
    expect(conflict.body.errorCode).toBe('STATUS_CONFLICT');

    await request(app.getHttpServer())
      .patch('/floor-plan/tables/3/status')
      .set('Authorization', `Bearer ${waiterToken}`)
      .send({ expectedStatus: 'OCCUPEE', requestedStatus: 'OCCUPEE', guests: 0 })
      .expect(400);
  });
});
