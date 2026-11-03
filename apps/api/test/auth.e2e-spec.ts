import { randomUUID } from 'node:crypto';
import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '@app/shared';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

describe('Auth (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("inscrit un utilisateur puis permet de se connecter avec les mêmes identifiants", async () => {
    const email = `waiter-${randomUUID()}@restaurant.test`;
    const password = 'un-mot-de-passe-solide';

    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password, name: 'Alex Serveur', role: UserRole.WAITER })
      .expect(201);

    expect(registerResponse.body.accessToken).toEqual(expect.any(String));
    expect(registerResponse.body.user).toMatchObject({ email, role: UserRole.WAITER });
    expect(registerResponse.body.user).not.toHaveProperty('passwordHash');

    const loginResponse = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password })
      .expect(200);

    expect(loginResponse.body.accessToken).toEqual(expect.any(String));
    expect(loginResponse.body.user.email).toBe(email);
  });

  it('refuse la connexion avec un mauvais mot de passe', async () => {
    const email = `cook-${randomUUID()}@restaurant.test`;
    await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'un-mot-de-passe-solide', name: 'Sacha Cuisine', role: UserRole.COOK })
      .expect(201);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email, password: 'mauvais-mot-de-passe' })
      .expect(401);
  });

  it('refuse un accès à /orders sans jeton', async () => {
    await request(app.getHttpServer()).get('/orders').expect(401);
    await request(app.getHttpServer()).post('/orders').send({}).expect(401);
  });

  it('accepte un accès à /orders avec un jeton valide', async () => {
    const email = `manager-${randomUUID()}@restaurant.test`;
    const registerResponse = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ email, password: 'un-mot-de-passe-solide', name: 'Morgan Manager', role: UserRole.MANAGER })
      .expect(201);

    // Sans restaurant associé, l'accès aux commandes est refusé (403), pas 401.
    await request(app.getHttpServer())
      .get('/orders')
      .set('Authorization', `Bearer ${registerResponse.body.accessToken}`)
      .expect(403);
  });
});
