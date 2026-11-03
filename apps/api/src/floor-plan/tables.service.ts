import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  canRoleSetTableStatus,
  canTransitionTableStatus,
  OrderStatus,
  OrderStatusErrorCode,
  TableErrorCode,
  TableStatus,
  type TableState,
  type TableStatusUpdatedEvent,
  type UpdateTableStatusInput,
  type UserRole,
} from '@app/shared';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type TableActor = { id: string; role: UserRole; restaurantId: string };

type TableRow = {
  number: number;
  status: TableState['status'];
  guests: number | null;
  statusChangedAt: Date;
  version: number;
};

const toState = ({ number, status, guests, statusChangedAt, version }: TableRow): TableState => ({
  number,
  status,
  guests,
  statusChangedAt,
  version,
});

/**
 * Occupation des tables (libre, occupée, à débarrasser). Mêmes principes que
 * pour les commandes : le serveur est l'autorité, chaque changement est une
 * mise à jour conditionnelle sur l'état attendu (409 si un autre utilisateur
 * est passé avant), et l'événement est diffusé à tout le restaurant.
 */
@Injectable()
export class TablesService {
  constructor(private readonly prisma: PrismaService) {}

  // Instantané de l'occupation, pour la (re)connexion d'un client.
  async sync(restaurantId: string): Promise<TableState[]> {
    const tables = await this.prisma.diningTable.findMany({
      where: { restaurantId },
      orderBy: { number: 'asc' },
    });
    return tables.map(toState);
  }

  async updateStatus(
    input: UpdateTableStatusInput,
    actor: TableActor,
  ): Promise<{ table: TableState; event: TableStatusUpdatedEvent }> {
    const { tableNumber, expectedStatus, requestedStatus } = input;

    if (!canTransitionTableStatus(expectedStatus, requestedStatus)) {
      throw new UnprocessableEntityException({
        message: `Transition impossible de ${expectedStatus} vers ${requestedStatus}.`,
        errorCode: OrderStatusErrorCode.INVALID_TRANSITION,
      });
    }
    if (!canRoleSetTableStatus(actor.role)) {
      throw new ForbiddenException({
        message: `Le rôle ${actor.role} ne peut pas modifier l'occupation des tables.`,
        errorCode: OrderStatusErrorCode.FORBIDDEN_TRANSITION,
      });
    }

    const where = {
      restaurantId_number: { restaurantId: actor.restaurantId, number: tableNumber },
    };
    const table = await this.prisma.diningTable.findUnique({ where, select: { id: true } });
    if (!table) {
      throw new NotFoundException({
        message: `La table ${tableNumber} n'existe pas sur le plan de salle.`,
        errorCode: TableErrorCode.TABLE_NOT_FOUND,
      });
    }

    // Des clients ne quittent pas une table dont des commandes sont en cours :
    // elles doivent d'abord être servies ou annulées.
    if (requestedStatus === TableStatus.A_DEBARRASSER) {
      const activeOrders = await this.prisma.order.count({
        where: {
          restaurantId: actor.restaurantId,
          tableNumber,
          status: { notIn: [OrderStatus.SERVIE, OrderStatus.ANNULEE] },
        },
      });
      if (activeOrders > 0) {
        throw new ConflictException({
          message: `La table ${tableNumber} a encore des commandes en cours.`,
          errorCode: TableErrorCode.TABLE_HAS_ACTIVE_ORDERS,
        });
      }
    }

    const guests = requestedStatus === TableStatus.OCCUPEE ? (input.guests ?? null) : null;
    const result = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.diningTable.updateMany({
        where: { id: table.id, status: expectedStatus },
        data: {
          status: requestedStatus,
          guests,
          statusChangedAt: new Date(),
          version: { increment: 1 },
        },
      });
      const current = await tx.diningTable.findUniqueOrThrow({ where: { id: table.id } });
      return { current, changed: count === 1 };
    });

    if (!result.changed) {
      throw new ConflictException({
        message: "L'occupation de la table a déjà été modifiée par un autre utilisateur.",
        errorCode: OrderStatusErrorCode.STATUS_CONFLICT,
        currentStatus: result.current.status,
      });
    }
    const state = toState(result.current);
    return {
      table: state,
      event: { ...state, previousStatus: expectedStatus, updatedBy: actor.id },
    };
  }

  /**
   * Une commande prise à une table libre l'occupe : appelé dans la transaction
   * de création de la commande. Renvoie l'événement à publier, ou null si la
   * table n'était pas libre (ou n'est pas sur le plan).
   */
  async occupyIfFree(
    tx: Prisma.TransactionClient,
    restaurantId: string,
    tableNumber: number,
    actorId: string,
  ): Promise<TableStatusUpdatedEvent | null> {
    const { count } = await tx.diningTable.updateMany({
      where: { restaurantId, number: tableNumber, status: TableStatus.LIBRE },
      data: {
        status: TableStatus.OCCUPEE,
        guests: null,
        statusChangedAt: new Date(),
        version: { increment: 1 },
      },
    });
    if (count === 0) return null;
    const current = await tx.diningTable.findUniqueOrThrow({
      where: { restaurantId_number: { restaurantId, number: tableNumber } },
    });
    return { ...toState(current), previousStatus: TableStatus.LIBRE, updatedBy: actorId };
  }
}
