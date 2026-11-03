import { z } from 'zod';

export const restaurantSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().min(1).max(120),
  createdAt: z.coerce.date(),
});
export type Restaurant = z.infer<typeof restaurantSchema>;

export const createRestaurantInputSchema = restaurantSchema.pick({
  name: true,
  slug: true,
});
export type CreateRestaurantInput = z.infer<typeof createRestaurantInputSchema>;
