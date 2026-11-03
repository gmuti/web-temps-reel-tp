import { z } from 'zod';
import { UserRole } from './role.js';

// Cycle de vie d'une commande (cf. sujet, "Cycle de vie d'une commande").
export const orderStatusSchema = z.enum([
  'A_VALIDER',
  'VALIDEE',
  'EN_PREPARATION',
  'PRETE',
  'SERVIE',
  'ANNULEE',
]);
export const OrderStatus = orderStatusSchema.enum;
export type OrderStatus = z.infer<typeof orderStatusSchema>;

// Transitions autorisées, dérivées directement du diagramme d'état du sujet.
export const ORDER_STATUS_TRANSITIONS: Readonly<Record<OrderStatus, readonly OrderStatus[]>> = {
  A_VALIDER: [OrderStatus.VALIDEE, OrderStatus.ANNULEE],
  VALIDEE: [OrderStatus.EN_PREPARATION, OrderStatus.ANNULEE],
  EN_PREPARATION: [OrderStatus.PRETE],
  PRETE: [OrderStatus.SERVIE],
  SERVIE: [],
  ANNULEE: [],
};

export function canTransitionOrderStatus(from: OrderStatus, to: OrderStatus): boolean {
  return ORDER_STATUS_TRANSITIONS[from].includes(to);
}

// Rôles autorisés à amener une commande dans chaque statut (cf. sujet, "Rôles proposés").
// Chaque statut cible n'est atteignable que par une seule transition métier, d'où
// une indexation par statut cible. MANAGER administre sans intervenir dans le service.
export const ORDER_STATUS_ALLOWED_ROLES: Readonly<Record<OrderStatus, readonly UserRole[]>> = {
  A_VALIDER: [],
  VALIDEE: [UserRole.WAITER, UserRole.RESPONSABLE],
  EN_PREPARATION: [UserRole.COOK, UserRole.RESPONSABLE],
  PRETE: [UserRole.COOK, UserRole.RESPONSABLE],
  SERVIE: [UserRole.WAITER, UserRole.RESPONSABLE],
  ANNULEE: [UserRole.RESPONSABLE],
};

export function canRoleSetOrderStatus(role: UserRole, to: OrderStatus): boolean {
  return ORDER_STATUS_ALLOWED_ROLES[to].includes(role);
}

// Visibilité des commandes : un serveur ne voit que ses propres commandes, les
// autres rôles voient toutes celles du restaurant.
export function canSeeAllOrders(role: UserRole): boolean {
  return role !== UserRole.WAITER;
}

// Transitions qu'un rôle donné peut demander depuis un statut : ce que l'UI propose.
export function availableOrderStatusTransitions(role: UserRole, from: OrderStatus): OrderStatus[] {
  return ORDER_STATUS_TRANSITIONS[from].filter((to) => canRoleSetOrderStatus(role, to));
}

export const ORDER_ITEM_NOTE_MAX_LENGTH = 120;

// Une ligne de commande envoyée par le client : un plat de la carte, sa
// quantité et une contrainte libre ("sans oignon"). Le nom et le prix sont
// lus côté serveur dans la carte, jamais fournis par le client.
export const orderItemInputSchema = z.object({
  dishId: z.string().uuid(),
  quantity: z.number().int().positive().max(50),
  note: z.string().trim().max(ORDER_ITEM_NOTE_MAX_LENGTH).optional(),
});
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

// Ligne de commande persistée : nom et prix unitaire recopiés au moment de la
// commande (on ne référence pas un prix de carte qui peut changer). `dishId` et
// `imageUrl` sont nuls pour les commandes antérieures au catalogue.
export const orderItemSchema = z.object({
  id: z.string().uuid(),
  dishId: z.string().uuid().nullable(),
  meal: z.string(),
  quantity: z.number().int().positive(),
  price: z.number().nonnegative(),
  note: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

// Commande envoyée par le client (cf. sujet, contrat `order:create`).
export const createOrderInputSchema = z.object({
  restaurantId: z.string().uuid(),
  tableNumber: z.number().int().positive(),
  items: z.array(orderItemInputSchema).min(1, 'Une commande doit contenir au moins un article'),
  comment: z.string().trim().max(280).optional(),
  clientOrderId: z.string().trim().min(1).max(100),
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

// Forme persistée / publiée (cf. sujet, événement `order:created`).
export const orderSchema = z.object({
  id: z.string().uuid(),
  restaurantId: z.string().uuid(),
  tableNumber: z.number().int().positive(),
  items: z.array(orderItemSchema),
  comment: z.string().nullable(),
  status: orderStatusSchema,
  clientOrderId: z.string().nullable(),
  waiterId: z.string().uuid(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type Order = z.infer<typeof orderSchema>;

export const ordersListSchema = z.array(orderSchema);

// Formes HTTP : restaurantId et waiterId sont déduits du jeton
// d'authentification, jamais fournis explicitement par le client.
export const createOrderRequestSchema = createOrderInputSchema.omit({ restaurantId: true });
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

// GET /orders?status=... — sans filtre, les commandes en cours (cf. sujet, séance 1).
export const listOrdersRequestSchema = z.object({ status: orderStatusSchema.optional() });
export type ListOrdersRequest = z.infer<typeof listOrdersRequestSchema>;

export function orderTotal(order: Pick<Order, 'items'>): number {
  return order.items.reduce((total, item) => total + item.price * item.quantity, 0);
}

// Demande de transition envoyée par le client (cf. sujet, contrat `order:status:update`).
export const updateOrderStatusInputSchema = z.object({
  orderId: z.string().uuid(),
  expectedStatus: orderStatusSchema,
  requestedStatus: orderStatusSchema,
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;

// Forme HTTP : PATCH /orders/:orderId/status, l'identifiant est porté par l'URL.
export const updateOrderStatusRequestSchema = updateOrderStatusInputSchema.omit({ orderId: true });
export type UpdateOrderStatusRequest = z.infer<typeof updateOrderStatusRequestSchema>;

// Codes d'erreur métier renvoyés lors d'un refus de transition
// (cf. sujet, champ `errorCode` de l'accusé de réception).
export const OrderStatusErrorCode = {
  ORDER_NOT_FOUND: 'ORDER_NOT_FOUND',
  STATUS_CONFLICT: 'STATUS_CONFLICT',
  INVALID_TRANSITION: 'INVALID_TRANSITION',
  FORBIDDEN_TRANSITION: 'FORBIDDEN_TRANSITION',
  // Création : un plat demandé n'est pas à la carte du restaurant.
  UNKNOWN_DISH: 'UNKNOWN_DISH',
  // Création : la table n'existe pas sur le plan de salle du restaurant.
  UNKNOWN_TABLE: 'UNKNOWN_TABLE',
} as const;
export type OrderStatusErrorCode = (typeof OrderStatusErrorCode)[keyof typeof OrderStatusErrorCode];
