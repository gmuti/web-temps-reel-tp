import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import type { FloorPlan } from '@app/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { PrismaService } from '../prisma/prisma.service.js';

@UseGuards(JwtAuthGuard)
@Controller('floor-plan')
export class FloorPlanController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /floor-plan — les tables du restaurant de l'utilisateur authentifié.
  // Le plan n'est pas filtré par rôle : il ne dit rien des commandes.
  @Get()
  async get(@CurrentUser() user: JwtPayload): Promise<FloorPlan> {
    if (!user.restaurantId) {
      throw new ForbiddenException("Ce compte n'est rattaché à aucun restaurant.");
    }
    const tables = await this.prisma.diningTable.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { number: 'asc' },
    });
    return {
      tables: tables.map(({ number, x, z, shape, seats }) => ({ number, x, z, shape, seats })),
    };
  }
}
