// Doit rester le tout premier import : AuthModule lit process.env.JWT_SECRET
// dès son chargement (JwtModule.register), avant que ConfigModule n'ait la
// main. Sans ce chargement anticipé, le jeton est signé avec une valeur et
// vérifié avec une autre → tous les jetons seraient rejetés (401).
import 'dotenv/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module.js';
import { ChatModule } from './chat/chat.module.js';
import { DishesModule } from './dishes/dishes.module.js';
import { FloorPlanModule } from './floor-plan/floor-plan.module.js';
import { HealthModule } from './health/health.module.js';
import { OrdersModule } from './orders/orders.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    HealthModule,
    UsersModule,
    AuthModule,
    DishesModule,
    FloorPlanModule,
    OrdersModule,
    RealtimeModule,
    ChatModule,
  ],
})
export class AppModule {}
