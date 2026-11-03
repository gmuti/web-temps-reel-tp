import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  OrderSocketEvent,
  OrderStatus,
  SOCKET_UNAUTHORIZED,
  UserRole,
  type OrderCreatedEvent,
  type OrderStatusUpdatedEvent,
} from '@app/shared';
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

describe('OrdersGateway (e2e, Socket.IO)', () => {
  let app: INestApplication<App>;
  let url: string;
  let restaurantA: string;
  let restaurantB: string;
  const sockets: ClientSocket[] = [];

  let waiterA: ClientSocket;
  let cookA: ClientSocket;
  let responsableB: ClientSocket;
  let ramenId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.listen(0);
    url = `http://localhost:${(app.getHttpServer().address() as AddressInfo).port}`;

    const prisma = app.get(PrismaService);
    restaurantA = (
      await prisma.restaurant.create({
        data: { name: 'A', slug: `test-${randomUUID()}` },
      })
    ).id;
    restaurantB = (
      await prisma.restaurant.create({
        data: { name: 'B', slug: `test-${randomUUID()}` },
      })
    ).id;

    ramenId = await createDish(prisma, restaurantA, 'Ramen', 14);
    waiterA = await connect(await registerToken(UserRole.WAITER, restaurantA));
    cookA = await connect(await registerToken(UserRole.COOK, restaurantA));
    responsableB = await connect(await registerToken(UserRole.RESPONSABLE, restaurantB));
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
  });

  const registerToken = (role: UserRole, restaurantId: string) => register(app, role, restaurantId);
  const connect = (token?: string) => connectSocket(url, sockets, token);

  function createOrder(socket: ClientSocket, clientOrderId = `client-order-${randomUUID()}`) {
    return socket.emitWithAck(OrderSocketEvent.CREATE, {
      tableNumber: 9,
      items: [{ dishId: ramenId, quantity: 1, note: 'Bien épicé' }],
      clientOrderId,
    });
  }

  it('refuse une connexion sans jeton valide', async () => {
    await expect(connect()).rejects.toThrow(SOCKET_UNAUTHORIZED);
    await expect(connect('jeton-invalide')).rejects.toThrow(SOCKET_UNAUTHORIZED);
  });

  it('diffuse order:created au restaurant, et uniquement à lui', async () => {
    const cookEvents = collect(cookA, OrderSocketEvent.CREATED);
    const waiterEvents = collect(waiterA, OrderSocketEvent.CREATED);
    const otherRestaurantEvents = collect(responsableB, OrderSocketEvent.CREATED);

    const ack = await createOrder(waiterA);
    if (!ack.accepted) throw new Error('création refusée');
    const isThisOrder = (event: OrderCreatedEvent) => event.orderId === ack.orderId;

    const received = (await cookEvents).filter(isThisOrder);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      restaurantId: restaurantA,
      status: OrderStatus.A_VALIDER,
    });
    expect((await waiterEvents).filter(isThisOrder)).toHaveLength(1);
    expect(await otherRestaurantEvents).toHaveLength(0);
  });

  it('ne republie pas order:created lors du rejeu du même clientOrderId', async () => {
    const clientOrderId = `client-order-${randomUUID()}`;
    // L'événement peut arriver après l'accusé : on compte sur l'ensemble des deux envois.
    const events = collect(cookA, OrderSocketEvent.CREATED);
    const first = await createOrder(waiterA, clientOrderId);
    const replay = await createOrder(waiterA, clientOrderId);
    if (!first.accepted) throw new Error('création refusée');

    expect(replay).toEqual(first);
    expect((await events).filter((event) => event.orderId === first.orderId)).toHaveLength(1);
  });

  it('renvoie un accusé négatif pour une commande invalide', async () => {
    const ack = await waiterA.emitWithAck(OrderSocketEvent.CREATE, {
      tableNumber: 1,
    } as never);
    expect(ack).toMatchObject({
      accepted: false,
      errorCode: 'VALIDATION_ERROR',
    });
  });

  it('valide les transitions et publie order:status-updated', async () => {
    const created = await createOrder(waiterA);
    if (!created.accepted) throw new Error('création refusée');
    const orderId = created.orderId;

    const forbidden = await cookA.emitWithAck(OrderSocketEvent.STATUS_UPDATE, {
      orderId,
      expectedStatus: OrderStatus.A_VALIDER,
      requestedStatus: OrderStatus.VALIDEE,
    });
    expect(forbidden).toMatchObject({
      accepted: false,
      errorCode: 'FORBIDDEN_TRANSITION',
    });

    const cookEvents = collect(cookA, OrderSocketEvent.STATUS_UPDATED);
    const otherRestaurantEvents = collect(responsableB, OrderSocketEvent.STATUS_UPDATED);
    const ack = await waiterA.emitWithAck(OrderSocketEvent.STATUS_UPDATE, {
      orderId,
      expectedStatus: OrderStatus.A_VALIDER,
      requestedStatus: OrderStatus.VALIDEE,
    });
    expect(ack).toEqual({ accepted: true, orderId });

    const events = (await cookEvents).filter(
      (event: OrderStatusUpdatedEvent) => event.orderId === orderId,
    );
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      previousStatus: OrderStatus.A_VALIDER,
      status: OrderStatus.VALIDEE,
    });
    expect(await otherRestaurantEvents).toHaveLength(0);

    const stale = await waiterA.emitWithAck(OrderSocketEvent.STATUS_UPDATE, {
      orderId,
      expectedStatus: OrderStatus.A_VALIDER,
      requestedStatus: OrderStatus.VALIDEE,
    });
    expect(stale).toMatchObject({
      accepted: false,
      errorCode: 'STATUS_CONFLICT',
      currentStatus: OrderStatus.VALIDEE,
    });
  });

  it("n'autorise pas un autre restaurant à modifier la commande", async () => {
    const created = await createOrder(waiterA);
    if (!created.accepted) throw new Error('création refusée');

    const ack = await responsableB.emitWithAck(OrderSocketEvent.STATUS_UPDATE, {
      orderId: created.orderId,
      expectedStatus: OrderStatus.A_VALIDER,
      requestedStatus: OrderStatus.ANNULEE,
    });
    expect(ack).toMatchObject({
      accepted: false,
      errorCode: 'ORDER_NOT_FOUND',
    });
  });

  it('ne diffuse à un serveur que les événements de ses propres commandes', async () => {
    const otherWaiter = await connect(await registerToken(UserRole.WAITER, restaurantA));
    const otherWaiterEvents = collect(otherWaiter, OrderSocketEvent.CREATED);
    const cookEvents = collect(cookA, OrderSocketEvent.CREATED);

    const ack = await createOrder(waiterA);
    if (!ack.accepted) throw new Error('création refusée');

    expect((await cookEvents).some((event) => event.orderId === ack.orderId)).toBe(true);
    expect(await otherWaiterEvents).toHaveLength(0);
  });

  it('journalise les événements et permet de rattraper ceux manqués', async () => {
    const sync = await cookA.emitWithAck(OrderSocketEvent.SYNC, {});
    if (!sync.accepted) throw new Error(sync.message);
    const otherWaiter = await connect(await registerToken(UserRole.WAITER, restaurantA));

    // Événements produits "pendant la coupure" de cookA.
    const created = await createOrder(waiterA);
    if (!created.accepted) throw new Error('création refusée');
    await waiterA.emitWithAck(OrderSocketEvent.STATUS_UPDATE, {
      orderId: created.orderId,
      expectedStatus: OrderStatus.A_VALIDER,
      requestedStatus: OrderStatus.VALIDEE,
    });

    const missed = await cookA.emitWithAck(OrderSocketEvent.EVENTS_SINCE, {
      after: sync.lastEventId,
    });
    if (!missed.accepted) throw new Error(missed.message);
    const forOrder = missed.events.filter((entry) => entry.event.orderId === created.orderId);
    expect(forOrder.map((entry) => entry.type)).toEqual([
      OrderSocketEvent.CREATED,
      OrderSocketEvent.STATUS_UPDATED,
    ]);
    expect(forOrder[0].event.eventId).toBeLessThan(forOrder[1].event.eventId);
    expect(missed.complete).toBe(true);

    // Le journal respecte la même visibilité que le tableau.
    const notMine = await otherWaiter.emitWithAck(OrderSocketEvent.EVENTS_SINCE, {
      after: sync.lastEventId,
    });
    if (!notMine.accepted) throw new Error(notMine.message);
    expect(notMine.events.some((entry) => entry.event.orderId === created.orderId)).toBe(false);
  });
});
