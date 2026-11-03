import { z } from 'zod';
import { UserRole, userRoleSchema } from './role.js';

// Canaux de discussion d'un restaurant (cf. sujet, "Organisation proposée des
// salles") : un canal général, un canal cuisine, un canal salle (service), et
// une discussion par commande, identifiée par "order:<orderId>".
export const FIXED_CHAT_CHANNELS = ['general', 'kitchen', 'service'] as const;
export type FixedChatChannel = (typeof FIXED_CHAT_CHANNELS)[number];

const ORDER_CHANNEL_PREFIX = 'order:';

export const chatChannelIdSchema = z.union([
  z.enum(FIXED_CHAT_CHANNELS),
  z
    .string()
    .startsWith(ORDER_CHANNEL_PREFIX)
    .refine(
      (value) => z.string().uuid().safeParse(value.slice(ORDER_CHANNEL_PREFIX.length)).success,
      {
        message: 'Canal de commande invalide',
      },
    ),
]);
export type ChatChannelId = z.infer<typeof chatChannelIdSchema>;

export const orderChatChannel = (orderId: string) => `${ORDER_CHANNEL_PREFIX}${orderId}`;

// Identifiant de la commande d'un canal "order:<orderId>", null pour un canal fixe.
export function orderIdOfChannel(channelId: string): string | null {
  return channelId.startsWith(ORDER_CHANNEL_PREFIX)
    ? channelId.slice(ORDER_CHANNEL_PREFIX.length)
    : null;
}

// Rôles autorisés par canal (cf. sujet, "Rôles proposés" : le responsable accède
// à tous les canaux ; MANAGER administre sans intervenir dans le service).
export const CHAT_CHANNEL_ROLES: Readonly<Record<FixedChatChannel | 'order', readonly UserRole[]>> =
  {
    general: [UserRole.RESPONSABLE, UserRole.MANAGER, UserRole.WAITER, UserRole.COOK],
    kitchen: [UserRole.RESPONSABLE, UserRole.COOK],
    service: [UserRole.RESPONSABLE, UserRole.WAITER],
    order: [UserRole.RESPONSABLE, UserRole.WAITER, UserRole.COOK],
  };

// Droit d'accès selon le rôle. Pour un canal de commande, le serveur vérifie en
// plus que la commande appartient au restaurant de l'utilisateur.
export function canRoleAccessChatChannel(role: UserRole, channelId: ChatChannelId): boolean {
  const key = orderIdOfChannel(channelId) ? 'order' : (channelId as FixedChatChannel);
  return CHAT_CHANNEL_ROLES[key].includes(role);
}

export const CHAT_MESSAGE_MAX_LENGTH = 500;

// Commande envoyée par le client (cf. sujet, contrat `chat:message:create`).
export const createChatMessageInputSchema = z.object({
  channelId: chatChannelIdSchema,
  clientMessageId: z.string().trim().min(1).max(100),
  content: z
    .string()
    .trim()
    .min(1, 'Le message est vide')
    .max(CHAT_MESSAGE_MAX_LENGTH, `Le message dépasse ${CHAT_MESSAGE_MAX_LENGTH} caractères`),
});
export type CreateChatMessageInput = z.infer<typeof createChatMessageInputSchema>;

export const chatChannelRequestSchema = z.object({ channelId: chatChannelIdSchema });
export type ChatChannelRequest = z.infer<typeof chatChannelRequestSchema>;

// L'auteur est déduit du jeton côté serveur, jamais du contenu du message.
export const chatAuthorSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  role: userRoleSchema,
});
export type ChatAuthor = z.infer<typeof chatAuthorSchema>;

// Événement publié par le serveur (cf. sujet, `chat:message:created`).
export const chatMessageCreatedEventSchema = z.object({
  eventId: z.string().uuid(),
  messageId: z.string().uuid(),
  channelId: z.string(),
  author: chatAuthorSchema,
  content: z.string(),
  createdAt: z.coerce.date(),
});
export type ChatMessageCreatedEvent = z.infer<typeof chatMessageCreatedEventSchema>;

// Personnes connectées au restaurant (présence, non persistée).
export const presenceUpdatedEventSchema = z.object({
  users: z.array(chatAuthorSchema),
});
export type PresenceUpdatedEvent = z.infer<typeof presenceUpdatedEventSchema>;
