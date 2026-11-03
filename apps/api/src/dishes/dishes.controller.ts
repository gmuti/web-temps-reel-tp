import { Controller, ForbiddenException, Get, UseGuards } from '@nestjs/common';
import type { Dish } from '@app/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { PrismaService } from '../prisma/prisma.service.js';

@UseGuards(JwtAuthGuard)
@Controller('dishes')
export class DishesController {
  constructor(private readonly prisma: PrismaService) {}

  // GET /dishes — la carte du restaurant de l'utilisateur authentifié.
  @Get()
  async list(@CurrentUser() user: JwtPayload): Promise<Dish[]> {
    if (!user.restaurantId) {
      throw new ForbiddenException("Ce compte n'est rattaché à aucun restaurant.");
    }
    const dishes = await this.prisma.dish.findMany({
      where: { restaurantId: user.restaurantId },
      orderBy: { name: 'asc' },
    });
    return dishes.map((dish) => ({
      id: dish.id,
      name: dish.name,
      price: Number(dish.price),
      imageUrl: dish.imageUrl,
    }));
  }
}
