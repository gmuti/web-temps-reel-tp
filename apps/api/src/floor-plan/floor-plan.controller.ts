import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Put,
  UseGuards,
} from '@nestjs/common';
import {
  updateFloorPlanRequestSchema,
  updateTableStatusRequestSchema,
  userRoleSchema,
  type FloorPlan,
  type TableState,
  type UpdateFloorPlanRequest,
  type UpdateTableStatusRequest,
} from '@app/shared';
import { CurrentUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import type { JwtPayload } from '../auth/jwt-payload.type.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { FloorPlanService } from './floor-plan.service.js';
import { TablesGateway } from './tables.gateway.js';
import { TablesService, type TableActor } from './tables.service.js';

@UseGuards(JwtAuthGuard)
@Controller('floor-plan')
export class FloorPlanController {
  constructor(
    private readonly floorPlan: FloorPlanService,
    private readonly tables: TablesService,
    private readonly gateway: TablesGateway,
  ) {}

  // GET /floor-plan — les tables du restaurant de l'utilisateur authentifié.
  // Le plan n'est pas filtré par rôle : il ne dit rien des commandes.
  @Get()
  async get(@CurrentUser() user: JwtPayload): Promise<FloorPlan> {
    return this.floorPlan.get(this.actor(user).restaurantId);
  }

  // PUT /floor-plan — remplace le plan (éditeur, rôle MANAGER). Diffusé à tout
  // le restaurant, qui recharge la géométrie des tables.
  @Put()
  async replace(
    @CurrentUser() user: JwtPayload,
    @Body(new ZodValidationPipe(updateFloorPlanRequestSchema)) body: UpdateFloorPlanRequest,
  ): Promise<FloorPlan> {
    const actor = this.actor(user);
    const plan = await this.floorPlan.replace(body, actor);
    this.gateway.publishFloorUpdated(actor.restaurantId, plan);
    return plan;
  }

  // PATCH /floor-plan/tables/:number/status — changement d'occupation (mêmes
  // règles et même diffusion que `table:status:update`).
  @Patch('tables/:number/status')
  async updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('number', new ParseIntPipe()) tableNumber: number,
    @Body(new ZodValidationPipe(updateTableStatusRequestSchema)) body: UpdateTableStatusRequest,
  ): Promise<TableState> {
    const actor = this.actor(user);
    const { table, event } = await this.tables.updateStatus({ ...body, tableNumber }, actor);
    this.gateway.publishStatusUpdated(actor.restaurantId, event);
    return table;
  }

  private actor(user: JwtPayload): TableActor {
    if (!user.restaurantId) {
      throw new ForbiddenException("Ce compte n'est rattaché à aucun restaurant.");
    }
    return { id: user.sub, role: userRoleSchema.parse(user.role), restaurantId: user.restaurantId };
  }
}
