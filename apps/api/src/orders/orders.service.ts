import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type {
  CreateOrderInput,
  Order,
  OrderCreatedEvent,
  OrderJournalEvent,
  OrderStatus,
  OrderStatusUpdatedEvent,
  UpdateOrderStatusInput,
  UserRole,
} from '@app/shared';
import {
  canRoleSetOrderStatus,
  canSeeAllOrders,
  canTransitionOrderStatus,
  orderCreatedPayload,
  OrderSocketEvent,
  OrderStatusErrorCode,
  OrderStatus as OrderStatusValues,
} from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

// Celui qui consulte ou modifie : détermine la visibilité des commandes.
export type OrderViewer = { id: string; role: UserRole; restaurantId: string };

// Nombre maximal d'événements rejoués ; au-delà, le client se resynchronise.
const EVENTS_SINCE_LIMIT = 500;

const withItems = {
  items: { include: { dish: { select: { imageUrl: true } } } },
} as const;

type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof withItems }>;

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Le tableau de commandes (cf. sujet — `GET /orders`). Par défaut, ne renvoie
   * que les commandes "en cours" (ni servies, ni annulées). Un serveur ne voit
   * que ses propres commandes.
   */
  async list(viewer: OrderViewer, status?: OrderStatus): Promise<Order[]> {
    const orders = await this.prisma.order.findMany({
      where: {
        ...this.visibleTo(viewer),
        status: status ?? { notIn: [OrderStatusValues.SERVIE, OrderStatusValues.ANNULEE] },
      },
      include: withItems,
      orderBy: { createdAt: 'asc' },
    });

    return orders.map((order) => this.toOrder(order));
  }

  async create(input: CreateOrderInput, waiterId: string): Promise<Order> {
    return (await this.createOrGet(input, waiterId)).order;
  }

  /**
   * Enregistre une commande et son événement `order:created` dans le journal.
   * Idempotent vis-à-vis de `clientOrderId` : un rejeu (reconnexion, double
   * envoi) renvoie la commande existante, sans nouvel événement (`event` nul).
   * Le nom et le prix de chaque plat sont lus dans la carte du restaurant.
   */
  async createOrGet(
    input: CreateOrderInput,
    waiterId: string,
  ): Promise<{ order: Order; created: boolean; event: OrderCreatedEvent | null }> {
    const existing = await this.prisma.order.findUnique({
      where: { clientOrderId: input.clientOrderId },
      include: withItems,
    });
    if (existing) {
      return { order: this.toOrder(existing), created: false, event: null };
    }

    const dishIds = [...new Set(input.items.map((item) => item.dishId))];
    const dishes = await this.prisma.dish.findMany({
      where: { id: { in: dishIds }, restaurantId: input.restaurantId },
    });
    const dishById = new Map(dishes.map((dish) => [dish.id, dish]));
    if (dishById.size !== dishIds.length) {
      throw new BadRequestException({
        message: "Un des plats demandés n'est pas à la carte.",
        errorCode: OrderStatusErrorCode.UNKNOWN_DISH,
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const created = await tx.order.create({
        data: {
          restaurantId: input.restaurantId,
          tableNumber: input.tableNumber,
          comment: input.comment ?? null,
          clientOrderId: input.clientOrderId,
          waiterId,
          status: OrderStatusValues.A_VALIDER,
          items: {
            create: input.items.map((item) => {
              const dish = dishById.get(item.dishId)!;
              return {
                dishId: dish.id,
                meal: dish.name,
                price: dish.price,
                quantity: item.quantity,
                note: item.note || null,
              };
            }),
          },
        },
        include: withItems,
      });
      const order = this.toOrder(created);
      const payload = orderCreatedPayload(order);
      const journal = await tx.orderEvent.create({
        data: {
          restaurantId: order.restaurantId,
          orderId: order.id,
          waiterId,
          type: OrderSocketEvent.CREATED,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      return { order, created: true, event: { ...payload, eventId: journal.id } };
    });
  }

  /**
   * Demande de transition d'état (cf. sujet, contrat `order:status:update`).
   * Le serveur reste l'autorité : il vérifie que la transition existe, que le rôle
   * y a droit, puis que la commande est toujours dans `expectedStatus` — sinon un
   * autre utilisateur l'a modifiée entre-temps et la demande est refusée (409).
   * Un serveur ne peut agir que sur ses propres commandes.
   */
  async updateStatus(
    input: UpdateOrderStatusInput,
    viewer: OrderViewer,
  ): Promise<{ order: Order; event: OrderStatusUpdatedEvent }> {
    const { orderId, expectedStatus, requestedStatus } = input;

    if (!canTransitionOrderStatus(expectedStatus, requestedStatus)) {
      throw new UnprocessableEntityException({
        message: `Transition impossible de ${expectedStatus} vers ${requestedStatus}.`,
        errorCode: OrderStatusErrorCode.INVALID_TRANSITION,
      });
    }
    if (!canRoleSetOrderStatus(viewer.role, requestedStatus)) {
      throw new ForbiddenException({
        message: `Le rôle ${viewer.role} ne peut pas passer une commande en ${requestedStatus}.`,
        errorCode: OrderStatusErrorCode.FORBIDDEN_TRANSITION,
      });
    }

    const scope = { id: orderId, ...this.visibleTo(viewer) };
    const order = await this.prisma.order.findFirst({ where: scope, select: { id: true } });
    if (!order) {
      throw new NotFoundException({
        message: 'Commande introuvable.',
        errorCode: OrderStatusErrorCode.ORDER_NOT_FOUND,
      });
    }

    // Mise à jour conditionnelle : le filtre sur `status` rend la vérification de
    // `expectedStatus` atomique, même si deux demandes arrivent simultanément.
    // L'événement est journalisé dans la même transaction.
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.order.updateMany({
        where: { ...scope, status: expectedStatus },
        data: { status: requestedStatus },
      });
      const current = await tx.order.findUniqueOrThrow({
        where: { id: orderId },
        include: withItems,
      });
      if (count === 0) return { current, event: null };

      const payload = {
        orderId,
        previousStatus: expectedStatus,
        status: requestedStatus,
        updatedBy: viewer.id,
        updatedAt: current.updatedAt,
      };
      const journal = await tx.orderEvent.create({
        data: {
          restaurantId: current.restaurantId,
          orderId,
          waiterId: current.waiterId,
          type: OrderSocketEvent.STATUS_UPDATED,
          payload: payload as unknown as Prisma.InputJsonValue,
        },
      });
      return { current, event: { ...payload, eventId: journal.id } };
    });

    if (!result.event) {
      throw new ConflictException({
        message: 'La commande a déjà été modifiée par un autre utilisateur.',
        errorCode: OrderStatusErrorCode.STATUS_CONFLICT,
        currentStatus: result.current.status,
      });
    }
    return { order: this.toOrder(result.current), event: result.event };
  }

  /**
   * Instantané du tableau et position du journal à cet instant. La position est
   * lue avant les commandes : un événement concurrent peut donc être à la fois
   * dans l'instantané et rejoué ensuite, ce qui est sans effet côté client.
   */
  async sync(viewer: OrderViewer): Promise<{ orders: Order[]; lastEventId: number }> {
    const { _max } = await this.prisma.orderEvent.aggregate({
      where: { restaurantId: viewer.restaurantId },
      _max: { id: true },
    });
    const orders = await this.list(viewer);
    return { orders, lastEventId: _max.id ?? 0 };
  }

  /**
   * Événements du journal postérieurs à `after`, visibles par l'utilisateur,
   * pour rattraper ceux manqués pendant une coupure. `complete` est faux si la
   * limite est atteinte : le client doit alors se resynchroniser.
   */
  async eventsSince(
    viewer: OrderViewer,
    after: number,
  ): Promise<{ events: OrderJournalEvent[]; complete: boolean }> {
    const rows = await this.prisma.orderEvent.findMany({
      where: {
        id: { gt: after },
        restaurantId: viewer.restaurantId,
        ...(canSeeAllOrders(viewer.role) ? {} : { waiterId: viewer.id }),
      },
      orderBy: { id: 'asc' },
      take: EVENTS_SINCE_LIMIT + 1,
    });
    const events = rows.slice(0, EVENTS_SINCE_LIMIT).map(
      (row) =>
        ({
          type: row.type,
          event: { ...(row.payload as object), eventId: row.id },
        }) as OrderJournalEvent,
    );
    return { events, complete: rows.length <= EVENTS_SINCE_LIMIT };
  }

  private visibleTo(viewer: OrderViewer) {
    return {
      restaurantId: viewer.restaurantId,
      ...(canSeeAllOrders(viewer.role) ? {} : { waiterId: viewer.id }),
    };
  }

  private toOrder(order: OrderWithItems): Order {
    return {
      id: order.id,
      restaurantId: order.restaurantId,
      tableNumber: order.tableNumber,
      items: order.items.map((item) => ({
        id: item.id,
        dishId: item.dishId,
        meal: item.meal,
        quantity: item.quantity,
        price: Number(item.price),
        note: item.note,
        imageUrl: item.dish?.imageUrl ?? null,
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
