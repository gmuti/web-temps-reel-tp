import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { DishesController } from './dishes.controller.js';

@Module({
  imports: [AuthModule],
  controllers: [DishesController],
})
export class DishesModule {}
