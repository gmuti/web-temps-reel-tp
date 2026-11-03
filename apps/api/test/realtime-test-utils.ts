import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import type { ClientToServerEvents, ServerToClientEvents, UserRole } from '@app/shared';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { App } from 'supertest/types';
import type { PrismaService } from '../src/prisma/prisma.service.js';

export type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
type EventPayload<E extends keyof ServerToClientEvents> = Parameters<ServerToClientEvents[E]>[0];

// Crée un compte via /auth/register et renvoie son jeton d'accès.
export async function registerToken(
  app: INestApplication<App>,
  role: UserRole,
  restaurantId: string,
  name = `Test ${role}`,
): Promise<string> {
  const response = await request(app.getHttpServer())
    .post('/auth/register')
    .send({
      email: `${role.toLowerCase()}-${randomUUID()}@restaurant.test`,
      password: 'un-mot-de-passe-solide',
      name,
      role,
      restaurantId,
    })
    .expect(201);
  return response.body.accessToken;
}

// Ouvre une connexion Socket.IO ; les sockets sont ajoutés à `opened` pour être
// fermés en fin de suite.
export function connectSocket(
  url: string,
  opened: ClientSocket[],
  token?: string,
): Promise<ClientSocket> {
  const socket: ClientSocket = io(url, {
    auth: token ? { token } : {},
    transports: ['websocket'],
    reconnection: false,
  });
  opened.push(socket);
  return new Promise((resolve, reject) => {
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

// Collecte les événements reçus pendant `ms` millisecondes. La fenêtre est
// large car l'événement peut arriver après l'accusé de réception, et plus
// tard encore sur une machine chargée (conteneur, CI).
export function collect<E extends keyof ServerToClientEvents>(
  socket: ClientSocket,
  event: E,
  ms = 1500,
): Promise<EventPayload<E>[]> {
  const received: EventPayload<E>[] = [];
  const listener = ((payload: EventPayload<E>) => received.push(payload)) as never;
  socket.on(event, listener);
  return new Promise((resolve) =>
    setTimeout(() => {
      socket.off(event, listener);
      resolve(received);
    }, ms),
  );
}

// Ajoute un plat à la carte d'un restaurant et renvoie son identifiant.
export async function createDish(
  prisma: PrismaService,
  restaurantId: string,
  name = `Plat ${randomUUID().slice(0, 8)}`,
  price = 10,
): Promise<string> {
  const dish = await prisma.dish.create({
    data: { restaurantId, name, price, imageUrl: '/dishes/test.svg' },
  });
  return dish.id;
}
