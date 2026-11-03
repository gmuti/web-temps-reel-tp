import { z } from 'zod';

// Cycle de vie d'une commande (cf. README, "Cycle de vie d'une commande").
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

// Transitions autorisées, dérivées directement du diagramme d'état du README.
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

// Une ligne de commande : un plat, sa quantité, son prix unitaire au moment
// de la commande (on ne référence pas un prix de carte qui peut changer).
export const orderItemInputSchema = z.object({
  meal: z.string().trim().min(1).max(120),
  quantity: z.number().int().positive().max(50),
  price: z.number().nonnegative().max(10_000),
});
export type OrderItemInput = z.infer<typeof orderItemInputSchema>;

export const orderItemSchema = orderItemInputSchema.extend({
  id: z.string().uuid(),
});
export type OrderItem = z.infer<typeof orderItemSchema>;

// Commande envoyée par le client (cf. README, contrat `order:create`).
export const createOrderInputSchema = z.object({
  restaurantId: z.string().uuid(),
  tableNumber: z.number().int().positive(),
  items: z.array(orderItemInputSchema).min(1, 'Une commande doit contenir au moins un article'),
  comment: z.string().trim().max(280).optional(),
  clientOrderId: z.string().trim().min(1).max(100),
});
export type CreateOrderInput = z.infer<typeof createOrderInputSchema>;

// Forme persistée / publiée (cf. README, événement `order:created`).
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

// GET /orders — le tableau de commandes d'un restaurant (cf. README, séance 1).
export const listOrdersQuerySchema = z.object({
  restaurantId: z.string().uuid(),
  status: orderStatusSchema.optional(),
});
export type ListOrdersQuery = z.infer<typeof listOrdersQuerySchema>;

// Formes HTTP : restaurantId et waiterId sont déduits du jeton
// d'authentification, jamais fournis explicitement par le client.
export const createOrderRequestSchema = createOrderInputSchema.omit({ restaurantId: true });
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;

export const listOrdersRequestSchema = listOrdersQuerySchema.omit({ restaurantId: true });
export type ListOrdersRequest = z.infer<typeof listOrdersRequestSchema>;

export function orderTotal(order: Pick<Order, 'items'>): number {
  return order.items.reduce((total, item) => total + item.price * item.quantity, 0);
}

// Demande de transition envoyée par le client (cf. README, contrat `order:status:update`).
export const updateOrderStatusInputSchema = z.object({
  orderId: z.string().uuid(),
  expectedStatus: orderStatusSchema,
  requestedStatus: orderStatusSchema,
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusInputSchema>;
