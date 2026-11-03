import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FloorPlanController } from './floor-plan.controller.js';
import { TablesGateway } from './tables.gateway.js';
import { TablesService } from './tables.service.js';

@Module({
  imports: [AuthModule],
  controllers: [FloorPlanController],
  providers: [TablesService, TablesGateway],
  exports: [TablesService, TablesGateway],
})
export class FloorPlanModule {}
