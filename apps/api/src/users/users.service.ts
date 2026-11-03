import { ConflictException, Injectable } from '@nestjs/common';
import type { CreateUserInput, User, UserRole } from '@app/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordService } from './password.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
  ) {}

  async create(input: CreateUserInput): Promise<User> {
    const existing = await this.prisma.user.findUnique({
      where: { email: input.email },
    });
    if (existing) {
      throw new ConflictException('Un utilisateur avec cet email existe déjà.');
    }

    const passwordHash = await this.passwords.hash(input.password);

    const user = await this.prisma.user.create({
      data: {
        email: input.email,
        passwordHash,
        name: input.name,
        role: input.role,
        restaurantId: input.restaurantId ?? null,
      },
    });

    return this.toPublicUser(user);
  }

  /**
   * Réservé à AuthService : seule méthode du module à exposer le hash du
   * mot de passe, nécessaire pour vérifier les identifiants à la connexion.
   */
  findByEmailWithPassword(email: string) {
    return this.prisma.user.findUnique({ where: { email } });
  }

  toPublicUser(user: {
    id: string;
    email: string;
    name: string;
    role: string;
    restaurantId: string | null;
    createdAt: Date;
  }): User {
    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role as UserRole,
      restaurantId: user.restaurantId,
      createdAt: user.createdAt,
    };
  }
}
