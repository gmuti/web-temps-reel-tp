import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import {
  canRoleEditFloorPlan,
  FloorPlanErrorCode,
  OrderStatus,
  OrderStatusErrorCode,
  TableStatus,
  type FloorPlan,
  type UpdateFloorPlanRequest,
} from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import type { TableActor } from './tables.service.js';

/**
 * Plan de salle (géométrie des tables). Le remplacement par l'éditeur est
 * atomique et protégé par la version du plan, comme les autres écritures de
 * l'application : un plan modifié entre-temps par quelqu'un d'autre est refusé.
 */
@Injectable()
export class FloorPlanService {
  constructor(private readonly prisma: PrismaService) {}

  async get(restaurantId: string): Promise<FloorPlan> {
    const [restaurant, tables] = await Promise.all([
      this.prisma.restaurant.findUniqueOrThrow({
        where: { id: restaurantId },
        select: { floorPlanVersion: true },
      }),
      this.prisma.diningTable.findMany({ where: { restaurantId }, orderBy: { number: 'asc' } }),
    ]);
    return {
      tables: tables.map(({ number, x, z, shape, seats }) => ({ number, x, z, shape, seats })),
      version: restaurant.floorPlanVersion,
    };
  }

  /**
   * Remplace les tables du restaurant. Les tables gardées conservent leur
   * occupation ; les nouvelles sont libres ; une table retirée doit être libre
   * et sans commande en cours. Les commandes d'une table retirée restent
   * valides (elles apparaissent « hors plan »).
   */
  async replace(input: UpdateFloorPlanRequest, actor: TableActor): Promise<FloorPlan> {
    if (!canRoleEditFloorPlan(actor.role)) {
      throw new ForbiddenException({
        message: `Le rôle ${actor.role} ne peut pas modifier le plan de salle.`,
        errorCode: OrderStatusErrorCode.FORBIDDEN_TRANSITION,
      });
    }
    const { restaurantId } = actor;
    const numbers = new Set(input.tables.map((table) => table.number));

    await this.prisma.$transaction(async (tx) => {
      // Mise à jour conditionnelle : la vérification de version est atomique.
      const { count } = await tx.restaurant.updateMany({
        where: { id: restaurantId, floorPlanVersion: input.expectedVersion },
        data: { floorPlanVersion: { increment: 1 } },
      });
      if (count === 0) {
        throw new ConflictException({
          message: 'Le plan de salle a été modifié par quelqu’un d’autre entre-temps.',
          errorCode: FloorPlanErrorCode.FLOOR_PLAN_CONFLICT,
        });
      }

      const removed = (
        await tx.diningTable.findMany({
          where: { restaurantId },
          select: { number: true, status: true },
        })
      ).filter((table) => !numbers.has(table.number));
      const activeOrders = await tx.order.findMany({
        where: {
          restaurantId,
          tableNumber: { in: removed.map((table) => table.number) },
          status: { notIn: [OrderStatus.SERVIE, OrderStatus.ANNULEE] },
        },
        select: { tableNumber: true },
      });
      const busy = removed
        .filter(
          (table) =>
            table.status !== TableStatus.LIBRE ||
            activeOrders.some((order) => order.tableNumber === table.number),
        )
        .map((table) => table.number);
      if (busy.length > 0) {
        throw new ConflictException({
          message: `Impossible de retirer la table ${busy.join(', ')} : elle est occupée ou a des commandes en cours.`,
          errorCode: FloorPlanErrorCode.TABLE_IN_USE,
        });
      }

      await tx.diningTable.deleteMany({
        where: { restaurantId, number: { in: removed.map((table) => table.number) } },
      });
      for (const { number, x, z, shape, seats } of input.tables) {
        await tx.diningTable.upsert({
          where: { restaurantId_number: { restaurantId, number } },
          update: { x, z, shape, seats },
          create: { restaurantId, number, x, z, shape, seats },
        });
      }
    });

    return this.get(restaurantId);
  }
}
