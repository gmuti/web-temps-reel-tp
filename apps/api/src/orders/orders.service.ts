import { Injectable } from '@nestjs/common';
import type { CreateOrderInput, ListOrdersQuery, Order, OrderStatus } from '@app/shared';
import { OrderStatus as OrderStatusValues } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';

type OrderWithItems = {
  id: string;
  restaurantId: string;
  tableNumber: number;
  comment: string | null;
  status: string;
  clientOrderId: string | null;
  waiterId: string;
  createdAt: Date;
  updatedAt: Date;
  items: { id: string; meal: string; quantity: number; price: unknown }[];
};

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le tableau de commandes d'un restaurant (cf. README, séance 1 — `GET /orders`).
   * Par défaut, ne renvoie que les commandes "en cours" (ni servies, ni annulées).
   */
  async list(query: ListOrdersQuery): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        restaurantId: query.restaurantId,
        status: query.status ?? { notIn: [OrderStatusValues.SERVIE, OrderStatusValues.ANNULEE] },
      },
      include: { items: true },
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((order) => this.toOrder(order));
  }

  /**
   * Enregistre une commande. Idempotent vis-à-vis de `clientOrderId` : rejouer
   * la même création (reconnexion, double envoi) renvoie la commande existante
   * plutôt que d'en créer une seconde (cf. README, "Points d'architecture").
   */
  async create(input: CreateOrderInput, waiterId: string): Promise<Order> {
    const existing = await this.prisma.order.findUnique({
      where: { clientOrderId: input.clientOrderId },
      include: { items: true },
    });
    if (existing) {
      return this.toOrder(existing);
    }

    const order = await this.prisma.order.create({
      data: {
        restaurantId: input.restaurantId,
        tableNumber: input.tableNumber,
        comment: input.comment ?? null,
        clientOrderId: input.clientOrderId,
        waiterId,
        status: OrderStatusValues.A_VALIDER,
        items: {
          create: input.items.map((item) => ({
            meal: item.meal,
            quantity: item.quantity,
            price: item.price,
          })),
        },
      },
      include: { items: true },
    });

    return this.toOrder(order);
  }

  private toOrder(order: OrderWithItems): Order {
    return {
      id: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      items: order.items.map((item) => ({
        id: item.id,
        meal: item.meal,
        quantity: item.quantity,
        price: Number(item.price),
      })),
      comment: order.comment,
      status: order.status as OrderStatus,
      clientOrderId: order.clientOrderId,
      waiterId: order.waiterId,
      createdAt: order.createdAt,
      updatedAt: order.updatedAt,
    };
  }
}
