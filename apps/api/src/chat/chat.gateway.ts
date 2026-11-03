import { randomUUID } from 'node:crypto';
import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import {
  chatChannelRequestSchema,
  chatChannelRoom,
  ChatSocketEvent,
  createChatMessageInputSchema,
  orderIdOfChannel,
  RealtimeErrorCode,
  type ChatJoinAck,
  type ChatMessageAck,
} from '@app/shared';
import { validationFailure, withAck } from '../realtime/ack.js';
import {
  GATEWAY_OPTIONS,
  type RealtimeServer,
  type RealtimeSocket,
} from '../realtime/realtime.types.js';
import { ChatService } from './chat.service.js';

// Limite de fréquence par connexion (cf. sujet, "Précautions indispensables").
const RATE_LIMIT_MESSAGES = 5;
const RATE_LIMIT_WINDOW_MS = 10_000;

/**
 * Chat d'équipe (cf. sujet, contrats `chat:message:create` / `chat:message:created`).
 * Les canaux fixes sont rejoints à la connexion (RealtimeGateway) ; une
 * discussion de commande se rejoint via `chat:channel:join`.
 */
@WebSocketGateway(GATEWAY_OPTIONS)
export class ChatGateway {
  private readonly logger = new Logger(ChatGateway.name);

  @WebSocketServer()
  private server!: RealtimeServer;

  constructor(private readonly chat: ChatService) {}

  // Vérifie l'accès, rejoint la salle d'une discussion de commande et renvoie
  // l'historique du canal.
  @SubscribeMessage(ChatSocketEvent.CHANNEL_JOIN)
  async onJoin(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<ChatJoinAck> {
    const parsed = chatChannelRequestSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error.issues);

    const user = client.data.user;
    const { channelId } = parsed.data;
    return withAck(this.logger, async () => {
      await this.chat.assertCanAccess(user, channelId);
      if (orderIdOfChannel(channelId)) {
        await client.join(chatChannelRoom(user.restaurantId, channelId));
      }
      const messages = await this.chat.history(user.restaurantId, channelId);
      return { accepted: true as const, messages };
    });
  }

  // Seules les discussions de commande se quittent : les canaux fixes restent
  // suivis tant que la connexion est ouverte.
  @SubscribeMessage(ChatSocketEvent.CHANNEL_LEAVE)
  async onLeave(@ConnectedSocket() client: RealtimeSocket, @MessageBody() body: unknown) {
    const parsed = chatChannelRequestSchema.safeParse(body);
    if (parsed.success && orderIdOfChannel(parsed.data.channelId)) {
      await client.leave(chatChannelRoom(client.data.user.restaurantId, parsed.data.channelId));
    }
  }

  @SubscribeMessage(ChatSocketEvent.MESSAGE_CREATE)
  async onMessage(
    @ConnectedSocket() client: RealtimeSocket,
    @MessageBody() body: unknown,
  ): Promise<ChatMessageAck> {
    const parsed = createChatMessageInputSchema.safeParse(body);
    if (!parsed.success) return validationFailure(parsed.error.issues);

    if (this.isRateLimited(client)) {
      return {
        accepted: false,
        errorCode: RealtimeErrorCode.RATE_LIMITED,
        message: 'Trop de messages envoyés, patientez quelques secondes.',
      };
    }

    const user = client.data.user;
    const input = parsed.data;
    return withAck(this.logger, async () => {
      await this.chat.assertCanAccess(user, input.channelId);
      const { message, created } = await this.chat.createOrGet(user, input, randomUUID());
      if (created) {
        this.server
          .to(chatChannelRoom(user.restaurantId, input.channelId))
          .emit(ChatSocketEvent.MESSAGE_CREATED, message);
      }
      return { accepted: true as const, messageId: message.messageId };
    });
  }

  private isRateLimited(client: RealtimeSocket): boolean {
    const now = Date.now();
    const recent = client.data.recentMessages.filter(
      (sentAt) => now - sentAt < RATE_LIMIT_WINDOW_MS,
    );
    const limited = recent.length >= RATE_LIMIT_MESSAGES;
    if (!limited) recent.push(now);
    client.data.recentMessages = recent;
    return limited;
  }
}
