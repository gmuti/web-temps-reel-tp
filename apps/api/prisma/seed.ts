import { PrismaPg } from '@prisma/adapter-pg';
import { hash } from 'bcryptjs';
import { PrismaClient } from '../src/generated/prisma/client.js';

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
});

const DEMO_PASSWORD = 'password123';

const DEMO_USERS = [
  { email: 'responsable@chez-demo.local', name: 'Robin Responsable', role: 'RESPONSABLE' as const },
  { email: 'manager@chez-demo.local', name: 'Morgan Manager', role: 'MANAGER' as const },
  { email: 'serveur@chez-demo.local', name: 'Alex Serveur', role: 'WAITER' as const },
  { email: 'cuisine@chez-demo.local', name: 'Sacha Cuisine', role: 'COOK' as const },
];

async function main() {
  const restaurant = await prisma.restaurant.upsert({
    where: { slug: 'chez-demo' },
    update: {},
    create: { name: 'Chez Demo', slug: 'chez-demo' },
  });

  const passwordHash = await hash(DEMO_PASSWORD, 12);

  for (const demoUser of DEMO_USERS) {
    await prisma.user.upsert({
      where: { email: demoUser.email },
      update: {},
      create: {
        email: demoUser.email,
        passwordHash,
        name: demoUser.name,
        role: demoUser.role,
        restaurantId: restaurant.id,
      },
    });
  }

  console.log(`Restaurant "${restaurant.name}" (${restaurant.id}) prêt.`);
  console.log(`Comptes de démo (mot de passe : "${DEMO_PASSWORD}") :`);
  for (const demoUser of DEMO_USERS) {
    console.log(`  - ${demoUser.role.padEnd(11)} ${demoUser.email}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
