import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  createOrderRequestSchema,
  orderEventsSinceRequestSchema,
  OrderSocketEvent,
  ordersBoardRoom,
  updateOrderStatusInputSchema,
  userRoom,
  type Ack,
  type OrderCreatedEvent,
  type OrderEventsSinceAck,
  type OrderStatusUpdatedEvent,
  type OrderSyncAck,
} from '@app/shared';
import { validationFailure, withAck } from '../realtime/ack.js';
import {
  GATEWAY_OPTIONS,
  type RealtimeServer,
  type RealtimeSocket,
} from '../realtime/realtime.types.js';
import { OrdersService } from './orders.service.js';

/**
 * Tableau de commandes temps réel (cf. sujet, séance 3 — Socket.IO).
 * Le client envoie des commandes (`order:create`, `order:status:update`) et reçoit
 * un accusé de réception ; le serveur publie ensuite l'événement journalisé à
 * ceux qui peuvent voir la commande, émetteur compris. Après une coupure, le
 * client rattrape les événements manqués (`order:events:since`) ou se
 * resynchronise (`order:sync`). L'authentification et les salles sont gérées
 * par RealtimeGateway.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
export class OrdersGateway {
  private readonly logger = new Logger(OrdersGateway.name);

  @WebSocketServer()
  private server!: RealtimeServer;

  constructor(private readonly orders: OrdersService) {}

  @SubscribeMessage(OrderSocketEvent.CREATE)
  async onCreate(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    const parsed = createOrderRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error.issues);

    const user = client.data.user;
    return withAck(this.logger, async () => {
      const { order, event } = await this.orders.createOrGet(
        { ...parsed.data, restaurantId: user.restaurantId },
        user.id,
      );
      if (event) this.publishCreated(event);
      return { accepted: true as const, orderId: order.id };
    });
  }

  @SubscribeMessage(OrderSocketEvent.STATUS_UPDATE)
  async onStatusUpdate(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<Ack> {
    const parsed = updateOrderStatusInputSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error.issues);

    return withAck(this.logger, async () => {
      const { order, event } = await this.orders.updateStatus(parsed.data, client.data.user);
      this.publishStatusUpdated(order.restaurantId, order.waiterId, event);
      return { accepted: true as const, orderId: order.id };
    });
  }

  // Instantané du tableau + position du journal (première connexion, ou
  // rattrapage impossible).
  @SubscribeMessage(OrderSocketEvent.SYNC)
  async onSync(@ConnectedSocket() client: RealtimeSocket): Promise<OrderSyncAck> {
    return withAck(this.logger, async () => ({
      accepted: true as const,
      ...(await this.orders.sync(client.data.user)),
    }));
  }

  // Rattrapage après une coupure : événements postérieurs au dernier reçu.
  @SubscribeMessage(OrderSocketEvent.EVENTS_SINCE)
  async onEventsSince(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<OrderEventsSinceAck> {
    const parsed = orderEventsSinceRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error.issues);

    return withAck(this.logger, async () => ({
      accepted: true as const,
      ...(await this.orders.eventsSince(client.data.user, parsed.data.after)),
    }));
  }

  publishCreated(event: OrderCreatedEvent) {
    this.server
      .to(this.audience(event.restaurantId, event.createdBy))
      .emit(OrderSocketEvent.CREATED, event);
  }

  publishStatusUpdated(restaurantId: string, waiterId: string, event: OrderStatusUpdatedEvent) {
    this.server
      .to(this.audience(restaurantId, waiterId))
      .emit(OrderSocketEvent.STATUS_UPDATED, event);
  }

  // Ceux qui voient tout le tableau, et le serveur de la commande.
  private audience(restaurantId: string, waiterId: string) {
    return [ordersBoardRoom(restaurantId), userRoom(waiterId)];
  }
}
