import { z } from 'zod';

// Un plat de la carte du restaurant (GET /dishes).
export const dishSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  price: z.number().nonnegative(),
  imageUrl: z.string(),
});
export type Dish = z.infer<typeof dishSchema>;

export const dishesListSchema = z.array(dishSchema);
