import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import {
  ChatSocketEvent,
  orderChatChannel,
  OrderSocketEvent,
  UserRole,
  type ChatChannelId,
} from '@app/shared';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import {
  collect,
  connectSocket,
  createDish,
  registerToken,
  type ClientSocket,
} from './realtime-test-utils.js';

describe('ChatGateway (e2e, Socket.IO)', () => {
  let app: INestApplication<App>;
  let url: string;
  let restaurantA: string;
  let restaurantB: string;
  const sockets: ClientSocket[] = [];

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
  });

  afterAll(async () => {
    sockets.forEach((socket) => socket.disconnect());
    await app.close();
  });

  // Chaque test ouvre ses propres connexions : la limite de fréquence est par
  // connexion, et la présence dépend des connexions ouvertes.
  async function connectAs(role: UserRole, restaurantId = restaurantA, name?: string) {
    return connectSocket(url, sockets, await registerToken(app, role, restaurantId, name));
  }

  function send(socket: ClientSocket, channelId: ChatChannelId, content: string) {
    return socket.emitWithAck(ChatSocketEvent.MESSAGE_CREATE, {
      channelId,
      clientMessageId: `client-message-${randomUUID()}`,
      content,
    });
  }

  it('diffuse un message du canal général au restaurant, avec son auteur', async () => {
    const waiter = await connectAs(UserRole.WAITER, restaurantA, 'Alex Salle');
    const cook = await connectAs(UserRole.COOK);
    const outsider = await connectAs(UserRole.RESPONSABLE, restaurantB);

    const cookEvents = collect(cook, ChatSocketEvent.MESSAGE_CREATED);
    const outsiderEvents = collect(outsider, ChatSocketEvent.MESSAGE_CREATED);
    const ack = await send(waiter, 'general', '  La table 12 signale une allergie.  ');
    if (!ack.accepted) throw new Error(ack.message);

    const received = (await cookEvents).filter((event) => event.messageId === ack.messageId);
    expect(received).toHaveLength(1);
    expect(received[0]).toMatchObject({
      channelId: 'general',
      content: 'La table 12 signale une allergie.',
      author: { name: 'Alex Salle', role: UserRole.WAITER },
    });
    expect(await outsiderEvents).toHaveLength(0);
  });

  it('réserve le canal cuisine à la cuisine et au responsable', async () => {
    const waiter = await connectAs(UserRole.WAITER);
    const cook = await connectAs(UserRole.COOK);
    const responsable = await connectAs(UserRole.RESPONSABLE);

    const refused = await send(waiter, 'kitchen', 'Je peux entrer ?');
    expect(refused).toMatchObject({
      accepted: false,
      errorCode: 'CHANNEL_FORBIDDEN',
    });

    const responsableEvents = collect(responsable, ChatSocketEvent.MESSAGE_CREATED);
    const waiterEvents = collect(waiter, ChatSocketEvent.MESSAGE_CREATED);
    const ack = await send(cook, 'kitchen', 'Plus de frites.');
    if (!ack.accepted) throw new Error(ack.message);

    expect((await responsableEvents).some((e) => e.messageId === ack.messageId)).toBe(true);
    expect((await waiterEvents).some((e) => e.messageId === ack.messageId)).toBe(false);
  });

  it('ouvre une discussion par commande, réservée au restaurant', async () => {
    const waiter = await connectAs(UserRole.WAITER);
    const cook = await connectAs(UserRole.COOK);
    const outsider = await connectAs(UserRole.RESPONSABLE, restaurantB);

    const created = await waiter.emitWithAck(OrderSocketEvent.CREATE, {
      tableNumber: 4,
      items: [{ dishId: await createDish(app.get(PrismaService), restaurantA), quantity: 1 }],
      clientOrderId: `client-order-${randomUUID()}`,
    });
    if (!created.accepted) throw new Error(created.message);
    const channelId = orderChatChannel(created.orderId);

    const joined = await waiter.emitWithAck(ChatSocketEvent.CHANNEL_JOIN, {
      channelId,
    });
    expect(joined).toEqual({ accepted: true, messages: [] });
    await cook.emitWithAck(ChatSocketEvent.CHANNEL_JOIN, { channelId });

    const forbidden = await outsider.emitWithAck(ChatSocketEvent.CHANNEL_JOIN, {
      channelId,
    });
    expect(forbidden).toMatchObject({
      accepted: false,
      errorCode: 'CHANNEL_FORBIDDEN',
    });

    const waiterEvents = collect(waiter, ChatSocketEvent.MESSAGE_CREATED);
    const ack = await send(cook, channelId, 'Sans parmesan, c’est noté.');
    if (!ack.accepted) throw new Error(ack.message);
    expect((await waiterEvents).filter((e) => e.messageId === ack.messageId)).toHaveLength(1);

    // L'historique est renvoyé à l'ouverture du canal.
    const reopened = await waiter.emitWithAck(ChatSocketEvent.CHANNEL_JOIN, {
      channelId,
    });
    if (!reopened.accepted) throw new Error(reopened.message);
    expect(reopened.messages.map((m) => m.content)).toEqual(['Sans parmesan, c’est noté.']);
  });

  it('ne duplique pas un message renvoyé avec le même clientMessageId', async () => {
    const waiter = await connectAs(UserRole.WAITER);
    const cook = await connectAs(UserRole.COOK);
    const payload = {
      channelId: 'general' as const,
      clientMessageId: `client-message-${randomUUID()}`,
      content: 'Message renvoyé après une coupure',
    };

    const events = collect(cook, ChatSocketEvent.MESSAGE_CREATED);
    const first = await waiter.emitWithAck(ChatSocketEvent.MESSAGE_CREATE, payload);
    const replay = await waiter.emitWithAck(ChatSocketEvent.MESSAGE_CREATE, payload);
    if (!first.accepted) throw new Error(first.message);

    expect(replay).toEqual(first);
    expect((await events).filter((e) => e.messageId === first.messageId)).toHaveLength(1);
  });

  it('valide les messages et limite leur fréquence', async () => {
    const waiter = await connectAs(UserRole.WAITER);

    expect(await send(waiter, 'general', '   ')).toMatchObject({
      accepted: false,
      errorCode: 'VALIDATION_ERROR',
    });
    expect(await send(waiter, 'general', 'x'.repeat(501))).toMatchObject({
      accepted: false,
      errorCode: 'VALIDATION_ERROR',
    });

    const acks = [];
    for (let i = 0; i < 6; i++) acks.push(await send(waiter, 'general', `Message ${i}`));
    expect(acks.slice(0, 5).every((ack) => ack.accepted)).toBe(true);
    expect(acks[5]).toMatchObject({
      accepted: false,
      errorCode: 'RATE_LIMITED',
    });
  });

  it('publie la présence des membres du restaurant', async () => {
    const responsable = await connectAs(UserRole.RESPONSABLE);

    const cookToken = await registerToken(app, UserRole.COOK, restaurantA, 'Sacha Présence');
    const joinEvents = collect(responsable, ChatSocketEvent.PRESENCE_UPDATED);
    const cook = await connectSocket(url, sockets, cookToken);
    const afterJoin = (await joinEvents).at(-1);
    expect(afterJoin?.users.map((u) => u.name)).toContain('Sacha Présence');

    const leaveEvents = collect(responsable, ChatSocketEvent.PRESENCE_UPDATED);
    cook.disconnect();
    const afterLeave = (await leaveEvents).at(-1);
    expect(afterLeave?.users.map((u) => u.name)).not.toContain('Sacha Présence');
  });
});
