import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { FloorPlanController } from './floor-plan.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [FloorPlanController],
})
export class FloorPlanModule {}
