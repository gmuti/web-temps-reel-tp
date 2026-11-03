import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  canRoleAccessChatChannel,
  canSeeAllOrders,
  orderIdOfChannel,
  RealtimeErrorCode,
  userRoleSchema,
  type ChatChannelId,
  type ChatMessageCreatedEvent,
  type CreateChatMessageInput,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { SocketUser } from '../realtime/realtime.types.js';

// Nombre de messages renvoyés à l'ouverture d'un canal.
const HISTORY_LIMIT = 50;

type MessageWithAuthor = {
  id: string;
  channelId: string;
  content: string;
  createdAt: Date;
  author: { id: string; name: string; role: string };
};

const withAuthor = {
  author: { select: { id: true, name: true, role: true } },
} as const;

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Droit d'accès à un canal : selon le rôle et, pour une discussion de
   * commande, à condition que l'utilisateur puisse voir la commande (une salle
   * ne remplace pas la vérification des droits).
   */
  async assertCanAccess(user: SocketUser, channelId: ChatChannelId) {
    let allowed = canRoleAccessChatChannel(user.role, channelId);
    const orderId = orderIdOfChannel(channelId);
    if (allowed && orderId) {
      const order = await this.prisma.order.findFirst({
        where: {
          id: orderId,
          restaurantId: user.restaurantId,
          // Comme pour le tableau, un serveur ne voit que ses propres commandes.
          ...(canSeeAllOrders(user.role) ? {} : { waiterId: user.id }),
        },
        select: { id: true },
      });
      allowed = order !== null;
    }
    if (!allowed) {
      throw new ForbiddenException({
        message: "Vous n'avez pas accès à ce canal.",
        errorCode: RealtimeErrorCode.CHANNEL_FORBIDDEN,
      });
    }
  }

  async history(
    restaurantId: string,
    channelId: ChatChannelId,
  ): Promise<ChatMessageCreatedEvent[]> {
    const messages = await this.prisma.message.findMany({
      where: { restaurantId, channelId },
      include: withAuthor,
      orderBy: { createdAt: 'desc' },
      take: HISTORY_LIMIT,
    });
    // L'identifiant du message sert d'identifiant d'événement pour l'historique.
    return messages.reverse().map((message) => this.toEvent(message, message.id));
  }

  /**
   * Enregistre un message. Idempotent vis-à-vis de `clientMessageId` : un renvoi
   * après une coupure renvoie le message existant sans le republier.
   */
  async createOrGet(
    user: SocketUser,
    input: CreateChatMessageInput,
    eventId: string,
  ): Promise<{ message: ChatMessageCreatedEvent; created: boolean }> {
    const existing = await this.prisma.message.findUnique({
      where: { clientMessageId: input.clientMessageId },
      include: withAuthor,
    });
    if (existing) {
      return { message: this.toEvent(existing, existing.id), created: false };
    }

    const message = await this.prisma.message.create({
      data: {
        restaurantId: user.restaurantId,
        channelId: input.channelId,
        authorId: user.id,
        content: input.content,
        clientMessageId: input.clientMessageId,
      },
      include: withAuthor,
    });
    return { message: this.toEvent(message, eventId), created: true };
  }

  private toEvent(message: MessageWithAuthor, eventId: string): ChatMessageCreatedEvent {
    return {
      eventId,
      messageId: message.id,
      channelId: message.channelId,
      author: {
        id: message.author.id,
        name: message.author.name,
        role: userRoleSchema.parse(message.author.role),
      },
      content: message.content,
      createdAt: message.createdAt,
    };
  }
}
