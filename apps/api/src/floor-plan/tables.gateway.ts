import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  restaurantRoom,
  TableSocketEvent,
  updateTableStatusInputSchema,
  type TableAck,
  type TableStatusUpdatedEvent,
  type TableSyncAck,
} from '@app/shared';
import { validationFailure, withAck } from '../realtime/ack.js';
import {
  GATEWAY_OPTIONS,
  type RealtimeServer,
  type RealtimeSocket,
} from '../realtime/realtime.types.js';
import { TablesService } from './tables.service.js';

/**
 * Occupation des tables en temps réel. L'occupation est publique au sein du
 * restaurant (elle ne dit rien des commandes) : l'événement est diffusé à la
 * salle du restaurant, que tous les rôles rejoignent à la connexion.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
export class TablesGateway {
  private readonly logger = new Logger(TablesGateway.name);

  @WebSocketServer()
  private server!: RealtimeServer;

  constructor(private readonly tables: TablesService) {}

  @SubscribeMessage(TableSocketEvent.SYNC)
  async onSync(@ConnectedSocket() client: RealtimeSocket): Promise<TableSyncAck> {
    return withAck(this.logger, async () => ({
      accepted: true as const,
      tables: await this.tables.sync(client.data.user.restaurantId),
    }));
  }

  @SubscribeMessage(TableSocketEvent.STATUS_UPDATE)
  async onStatusUpdate(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<TableAck> {
    const parsed = updateTableStatusInputSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error.issues);

    const user = client.data.user;
    return withAck(this.logger, async () => {
      const { table, event } = await this.tables.updateStatus(parsed.data, user);
      this.publishStatusUpdated(user.restaurantId, event);
      return { accepted: true as const, tableNumber: table.number };
    });
  }

  publishStatusUpdated(restaurantId: string, event: TableStatusUpdatedEvent) {
    this.server.to(restaurantRoom(restaurantId)).emit(TableSocketEvent.STATUS_UPDATED, event);
  }
}
