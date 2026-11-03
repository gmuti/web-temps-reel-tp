import { z } from 'zod';
import { userRoleSchema } from './role.js';

export const emailSchema = z.string().trim().toLowerCase().email();

// bcrypt tronque silencieusement au-delà de 72 octets : on borne en amont.
export const passwordSchema = z
  .string()
  .min(8, 'Le mot de passe doit contenir au moins 8 caractères')
  .max(72, 'Le mot de passe ne doit pas dépasser 72 caractères');

export const createUserInputSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  name: z.string().trim().min(1).max(100),
  role: userRoleSchema,
  restaurantId: z.string().uuid().optional(),
});
export type CreateUserInput = z.infer<typeof createUserInputSchema>;

// Forme publique d'un utilisateur : ne contient jamais le hash du mot de passe.
export const userSchema = z.object({
  id: z.string().uuid(),
  email: emailSchema,
  name: z.string(),
  role: userRoleSchema,
  restaurantId: z.string().uuid().nullable(),
  createdAt: z.coerce.date(),
});
export type User = z.infer<typeof userSchema>;
