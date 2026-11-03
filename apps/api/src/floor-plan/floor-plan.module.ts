import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FloorPlanController } from './floor-plan.controller.js';
import { FloorPlanService } from './floor-plan.service.js';
import { TablesGateway } from './tables.gateway.js';
import { TablesService } from './tables.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FloorPlanController],
  providers: [FloorPlanService, TablesService, TablesGateway],
  exports: [TablesService, TablesGateway],
})
export class FloorPlanModule {}
