import type { ChatAuthor, ClientToServerEvents, ServerToClientEvents } from '@app/shared';
import type { Server, Socket } from 'socket.io';

// Identité attachée au socket lors de l'authentification (poignée de main).
export type SocketUser = ChatAuthor & { restaurantId: string };

export type SocketData = {
  user: SocketUser;
  // Horodatages des derniers messages de chat, pour limiter leur fréquence.
  recentMessages: number[];
};

export type RealtimeServer = Server<ClientToServerEvents, ServerToClientEvents, object, SocketData>;
export type RealtimeSocket = Socket<ClientToServerEvents, ServerToClientEvents, object, SocketData>;

// Options communes : toutes les passerelles partagent le même serveur Socket.IO.
export const GATEWAY_OPTIONS = {
  cors: {
    origin: process.env.WEB_ORIGIN ?? 'http://localhost:5173',
    credentials: true,
  },
};
