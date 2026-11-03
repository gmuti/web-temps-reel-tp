import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FloorPlanModule } from '../floor-plan/floor-plan.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersGateway } from './orders.gateway.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [AuthModule, FloorPlanModule],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersGateway],
  exports: [OrdersService],
})
export class OrdersModule {}
