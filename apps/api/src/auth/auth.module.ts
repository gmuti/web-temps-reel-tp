import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { UsersModule } from '../users/users.module.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtStrategy } from './jwt.strategy.js';

const passportModule = PassportModule.register({ defaultStrategy: 'jwt' });

@Module({
  imports: [
    UsersModule,
    passportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
      // `expiresIn` accepte une chaîne de durée ("8h", "7d"...) à l'exécution,
      // mais son type ne l'exprime qu'via un littéral trop restrictif pour une
      // valeur venant de process.env.
      signOptions: { expiresIn: (process.env.JWT_EXPIRES_IN ?? '8h') as unknown as number },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  // passportModule est réexporté : JwtAuthGuard, utilisé dans d'autres
  // modules (OrdersModule...), a besoin d'AuthModuleOptions dans leur scope.
  exports: [AuthService, passportModule],
})
export class AuthModule {}
