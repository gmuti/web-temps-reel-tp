import { Body, Controller, ForbiddenException, Get, Post, Query, UseGuards } from '@nestjs/common';
import {
  createOrderRequestSchema,
  listOrdersRequestSchema,
  type CreateOrderRequest,
  type ListOrdersRequest,
} from '@app/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrdersService } from './orders.service.js';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  // GET /orders?status=... — restaurant déduit de l'utilisateur authentifié.
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listOrdersRequestSchema)) query: ListOrdersRequest,
  ) {
    const restaurantId = this.requireRestaurant(user);
    return this.orders.list({ restaurantId, status: query.status });
  }

  // POST /orders — waiterId et restaurantId déduits de l'utilisateur authentifié.
  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createOrderRequestSchema)) body: CreateOrderRequest,
  ) {
    const restaurantId = this.requireRestaurant(user);
    return this.orders.create({ ...body, restaurantId }, user.sub);
  }

  private requireRestaurant(user: JwtPayload): string {
    if (!user.restaurantId) {
      throw new ForbiddenException("Ce compte n'est rattaché à aucun restaurant.");
    }
    return user.restaurantId;
  }
}
