import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createOrderRequestSchema,
  listOrdersRequestSchema,
  updateOrderStatusRequestSchema,
  userRoleSchema,
  type CreateOrderRequest,
  type ListOrdersRequest,
  type UpdateOrderStatusRequest,
} from '@app/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { OrdersGateway } from './orders.gateway.js';
import { OrdersService, type OrderViewer } from './orders.service.js';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly gateway: OrdersGateway,
  ) {}

  // GET /orders?status=... — restaurant déduit de l'utilisateur authentifié.
  @Get()
  list(
    @CurrentUser() user: JwtPayload,
    @Query(new ZodValidationPipe(listOrdersRequestSchema)) query: ListOrdersRequest,
  ) {
    return this.orders.list(this.viewer(user), query.status);
  }

  // POST /orders — waiterId et restaurantId déduits de l'utilisateur authentifié.
  // Les écritures HTTP sont diffusées aux clients Socket.IO comme celles du socket.
  @Post()
  async create(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(createOrderRequestSchema)) body: CreateOrderRequest,
  ) {
    const { restaurantId } = this.viewer(user);
    const { order, event } = await this.orders.createOrGet({ ...body, restaurantId }, user.sub);
    if (event) this.gateway.publishCreated(event);
    return order;
  }

  // PATCH /orders/:orderId/status — demande de transition (cf. sujet, `order:status:update`).
  @Patch(':orderId/status')
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('orderId', new ParseUUIDPipe()) orderId: string,
    @Body(new ZodValidationPipe(updateOrderStatusRequestSchema)) body: UpdateOrderStatusRequest,
  ) {
    const { order, event } = await this.orders.updateStatus(
      { ...body, orderId },
      this.viewer(user),
    );
    this.gateway.publishStatusUpdated(order.restaurantId, order.waiterId, event);
    return order;
  }

  // Mêmes règles de visibilité qu'en Socket.IO (OrdersService), à partir du jeton.
  private viewer(user: JwtPayload): OrderViewer {
    if (!user.restaurantId) {
      throw new ForbiddenException("Ce compte n'est rattaché à aucun restaurant.");
    }
    return { id: user.sub, role: userRoleSchema.parse(user.role), restaurantId: user.restaurantId };
  }
}
