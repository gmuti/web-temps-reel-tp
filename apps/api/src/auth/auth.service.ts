import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AuthResponse, CreateUserInput, LoginInput, User } from '@app/shared';
import { PasswordService } from '../users/password.service.js';
import { UsersService } from '../users/users.service.js';
import type { JwtPayload } from './jwt-payload.type.js';

@Injectable()
export class AuthService {
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
  ) {}

  async register(input: CreateUserInput): Promise<AuthResponse> {
    const user = await this.users.create(input);
    return this.buildAuthResponse(user);
  }

  async login(input: LoginInput): Promise<AuthResponse> {
    const record = await this.users.findByEmailWithPassword(input.email);
    if (!record) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    const valid = await this.passwords.verify(input.password, record.passwordHash);
    if (!valid) {
      throw new UnauthorizedException('Identifiants invalides.');
    }

    return this.buildAuthResponse(this.users.toPublicUser(record));
  }

  private buildAuthResponse(user: User): AuthResponse {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
      restaurantId: user.restaurantId,
    };

    return {
      accessToken: this.jwt.sign(payload),
      user,
    };
  }
}
