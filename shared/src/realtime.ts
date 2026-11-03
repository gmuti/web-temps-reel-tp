import { z } from 'zod';
import { orderIdOfChannel } from './chat.js';
import type {
  ChatChannelId,
  ChatChannelRequest,
  ChatMessageCreatedEvent,
  CreateChatMessageInput,
  PresenceUpdatedEvent,
} from './chat.js';
import {
  orderItemSchema,
  orderStatusSchema,
  OrderStatusErrorCode,
  type CreateOrderRequest,
  type Order,
  type UpdateOrderStatusInput,
} from './order.js';

// Noms des événements Socket.IO (cf. sujet, "Contrats d'événements").
// Les commandes (`order:create`...) sont envoyées par le client ; les événements
// (`order:created`...) sont publiés par le serveur après validation.
export const OrderSocketEvent = {
  CREATE: 'order:create',
  CREATED: 'order:created',
  STATUS_UPDATE: 'order:status:update',
  STATUS_UPDATED: 'order:status-updated',
  // Resynchronisation (cf. sujet : "une reconnexion peut nécessiter une
  // resynchronisation complète") et rattrapage via le journal d'événements.
  SYNC: 'order:sync',
  EVENTS_SINCE: 'order:events:since',
} as const;

// Chat et présence (cf. sujet, contrats `chat:message:create` / `chat:message:created`).
// Les canaux fixes sont rejoints à la connexion selon le rôle ; une discussion de
// commande se rejoint explicitement (`chat:channel:join`), qui renvoie l'historique.
export const ChatSocketEvent = {
  CHANNEL_JOIN: 'chat:channel:join',
  CHANNEL_LEAVE: 'chat:channel:leave',
  MESSAGE_CREATE: 'chat:message:create',
  MESSAGE_CREATED: 'chat:message:created',
  PRESENCE_UPDATED: 'presence:updated',
} as const;

// Salles (cf. sujet, "Organisation proposée des salles"). Une salle ne fait que
// router la diffusion : les droits sont vérifiés côté serveur à chaque action.
export const restaurantRoom = (restaurantId: string) => `restaurant:${restaurantId}`;
export const kitchenRoom = (restaurantId: string) => `restaurant:${restaurantId}:kitchen`;
export const serviceRoom = (restaurantId: string) => `restaurant:${restaurantId}:service`;
export const orderRoom = (orderId: string) => `order:${orderId}`;
// Diffusion des événements de commandes : la salle des rôles qui voient tout le
// tableau, et la salle personnelle du serveur de la commande.
export const ordersBoardRoom = (restaurantId: string) => `restaurant:${restaurantId}:orders`;
export const userRoom = (userId: string) => `user:${userId}`;

// Salle Socket.IO correspondant à un canal de chat du restaurant.
export function chatChannelRoom(restaurantId: string, channelId: ChatChannelId): string {
  const orderId = orderIdOfChannel(channelId);
  if (orderId) return orderRoom(orderId);
  if (channelId === 'kitchen') return kitchenRoom(restaurantId);
  if (channelId === 'service') return serviceRoom(restaurantId);
  return restaurantRoom(restaurantId);
}

// Identifiant d'événement : position dans le journal (OrderEvent), croissante,
// qui sert de curseur pour le rattrapage après une coupure.
export const orderEventIdSchema = z.number().int().positive();

export const orderCreatedEventSchema = z.object({
  eventId: orderEventIdSchema,
  orderId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  tableNumber: z.number().int().positive(),
  items: z.array(orderItemSchema),
  comment: z.string().nullable(),
  status: orderStatusSchema,
  createdBy: z.string().uuid(),
  createdAt: z.coerce.date(),
});
export type OrderCreatedEvent = z.infer<typeof orderCreatedEventSchema>;

export const orderStatusUpdatedEventSchema = z.object({
  eventId: orderEventIdSchema,
  orderId: z.string().uuid(),
  previousStatus: orderStatusSchema,
  status: orderStatusSchema,
  updatedBy: z.string().uuid(),
  updatedAt: z.coerce.date(),
});
export type OrderStatusUpdatedEvent = z.infer<typeof orderStatusUpdatedEventSchema>;

// Entrée du journal rejouée lors du rattrapage.
export const orderJournalEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal(OrderSocketEvent.CREATED), event: orderCreatedEventSchema }),
  z.object({
    type: z.literal(OrderSocketEvent.STATUS_UPDATED),
    event: orderStatusUpdatedEventSchema,
  }),
]);
export type OrderJournalEvent = z.infer<typeof orderJournalEventSchema>;

export const orderEventsSinceRequestSchema = z.object({ after: z.number().int().nonnegative() });
export type OrderEventsSinceRequest = z.infer<typeof orderEventsSinceRequestSchema>;

// Données de l'événement `order:created`, hors identifiant (attribué par le journal).
export function orderCreatedPayload(order: Order): Omit<OrderCreatedEvent, 'eventId'> {
  return {
    orderId: order.id,
    restaurantId: order.restaurantId,
    tableNumber: order.tableNumber,
    items: order.items,
    comment: order.comment,
    status: order.status,
    createdBy: order.waiterId,
    createdAt: order.createdAt,
  };
}

export function orderFromCreatedEvent(event: OrderCreatedEvent): Order {
  return {
    id: event.orderId,
    restaurantId: event.restaurantId,
    tableNumber: event.tableNumber,
    items: event.items,
    comment: event.comment,
    status: event.status,
    clientOrderId: null,
    waiterId: event.createdBy,
    createdAt: event.createdAt,
    updatedAt: event.createdAt,
  };
}

// Codes d'erreur des accusés de réception, en plus de ceux des transitions.
export const RealtimeErrorCode = {
  ...OrderStatusErrorCode,
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  FORBIDDEN: 'FORBIDDEN',
  CHANNEL_FORBIDDEN: 'CHANNEL_FORBIDDEN',
  RATE_LIMITED: 'RATE_LIMITED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type RealtimeErrorCode = (typeof RealtimeErrorCode)[keyof typeof RealtimeErrorCode];

// Erreur renvoyée au client quand la connexion est refusée (jeton absent ou invalide).
export const SOCKET_UNAUTHORIZED = 'UNAUTHORIZED';

// Accusé de réception (cf. sujet) : confirme le traitement d'une commande, mais
// ne remplace pas l'événement métier, diffusé à toute la salle émetteur compris.
export type AckFailure = {
  accepted: false;
  errorCode: RealtimeErrorCode;
  message: string;
  currentStatus?: z.infer<typeof orderStatusSchema>;
};
export type Ack = { accepted: true; orderId: string } | AckFailure;
export type ChatMessageAck = { accepted: true; messageId: string } | AckFailure;
// `lastEventId` : position du journal au moment de l'instantané `orders`.
export type OrderSyncAck = { accepted: true; orders: Order[]; lastEventId: number } | AckFailure;
// `complete` est faux si trop d'événements ont été manqués : il faut alors
// une resynchronisation complète.
export type OrderEventsSinceAck =
  { accepted: true; events: OrderJournalEvent[]; complete: boolean } | AckFailure;
export type ChatJoinAck = { accepted: true; messages: ChatMessageCreatedEvent[] } | AckFailure;

// Typage Socket.IO partagé entre le serveur et le client.
export interface ClientToServerEvents {
  [OrderSocketEvent.CREATE]: (input: CreateOrderRequest, ack: (response: Ack) => void) => void;
  [OrderSocketEvent.SYNC]: (
    input: Record<string, never>,
    ack: (response: OrderSyncAck) => void,
  ) => void;
  [OrderSocketEvent.EVENTS_SINCE]: (
    input: OrderEventsSinceRequest,
    ack: (response: OrderEventsSinceAck) => void,
  ) => void;
  [OrderSocketEvent.STATUS_UPDATE]: (
    input: UpdateOrderStatusInput,
    ack: (response: Ack) => void,
  ) => void;
  [ChatSocketEvent.CHANNEL_JOIN]: (
    input: ChatChannelRequest,
    ack: (response: ChatJoinAck) => void,
  ) => void;
  [ChatSocketEvent.CHANNEL_LEAVE]: (input: ChatChannelRequest) => void;
  [ChatSocketEvent.MESSAGE_CREATE]: (
    input: CreateChatMessageInput,
    ack: (response: ChatMessageAck) => void,
  ) => void;
}

export interface ServerToClientEvents {
  [OrderSocketEvent.CREATED]: (event: OrderCreatedEvent) => void;
  [OrderSocketEvent.STATUS_UPDATED]: (event: OrderStatusUpdatedEvent) => void;
  [ChatSocketEvent.MESSAGE_CREATED]: (event: ChatMessageCreatedEvent) => void;
  [ChatSocketEvent.PRESENCE_UPDATED]: (event: PresenceUpdatedEvent) => void;
}
