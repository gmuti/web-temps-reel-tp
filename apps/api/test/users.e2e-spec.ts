import { randomUUID } from 'node:crypto';
import { ConflictException, INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { createUserInputSchema, UserRole } from '@app/shared';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UsersService } from '../src/users/users.service.js';

describe('UsersService (e2e)', () => {
  let app: INestApplication;
  let usersService: UsersService;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    usersService = app.get(UsersService);
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await app.close();
  });

  it('valide, hache le mot de passe et persiste un utilisateur', async () => {
    const email = `waiter-${randomUUID()}@restaurant.test`;

    const input = createUserInputSchema.parse({
      email,
      password: 'un-mot-de-passe-solide',
      name: 'Alex Serveur',
      role: UserRole.WAITER,
    });

    const user = await usersService.create(input);

    expect(user.email).toBe(email);
    expect(user.role).toBe(UserRole.WAITER);
    expect(user).not.toHaveProperty('passwordHash');
    expect(user).not.toHaveProperty('password');

    const stored = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(stored.passwordHash).not.toBe(input.password);
    expect(stored.passwordHash.length).toBeGreaterThan(20);
  });

  it("rejette la création d'un second utilisateur avec le même email", async () => {
    const email = `cook-${randomUUID()}@restaurant.test`;
    const input = createUserInputSchema.parse({
      email,
      password: 'un-mot-de-passe-solide',
      name: 'Sacha Cuisine',
      role: UserRole.COOK,
    });

    await usersService.create(input);

    await expect(usersService.create(input)).rejects.toBeInstanceOf(ConflictException);
  });

  it('rejette un mot de passe trop court avant même de toucher la base', () => {
    expect(() =>
      createUserInputSchema.parse({
        email: `short-${randomUUID()}@restaurant.test`,
        password: 'court',
        name: 'Trop Court',
        role: UserRole.MANAGER,
      }),
    ).toThrow();
  });
});
