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

// Carte de démo. Les images sont des illustrations servies par le front
// (apps/web/public/dishes) : elles peuvent être remplacées par de vraies photos.
const DEMO_DISHES = [
  { name: 'Burger maison', price: 14.5, imageUrl: '/dishes/burger.svg' },
  { name: 'Pizza Margherita', price: 12, imageUrl: '/dishes/pizza.svg' },
  { name: 'Salade César', price: 11, imageUrl: '/dishes/salade-cesar.svg' },
  { name: 'Ramen', price: 13.5, imageUrl: '/dishes/ramen.svg' },
  { name: 'Steak frites', price: 18, imageUrl: '/dishes/steak-frites.svg' },
  { name: 'Risotto aux champignons', price: 16, imageUrl: '/dishes/risotto.svg' },
  { name: 'Tiramisu', price: 7, imageUrl: '/dishes/tiramisu.svg' },
  { name: 'Limonade maison', price: 4.5, imageUrl: '/dishes/limonade.svg' },
];

// Idempotent (upserts) : exécuté à chaque démarrage du conteneur api.
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

  for (const dish of DEMO_DISHES) {
    await prisma.dish.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name: dish.name } },
      update: { price: dish.price, imageUrl: dish.imageUrl },
      create: { ...dish, restaurantId: restaurant.id },
    });
  }

  console.log(`Restaurant "${restaurant.name}" (${restaurant.id}) prêt, ${DEMO_DISHES.length} plats à la carte.`);
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
