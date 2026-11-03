import { z } from 'zod';
import { emailSchema, userSchema } from './user.js';

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Le mot de passe est requis'),
});
export type LoginInput = z.infer<typeof loginInputSchema>;

export const authResponseSchema = z.object({
  accessToken: z.string(),
  user: userSchema,
});
export type AuthResponse = z.infer<typeof authResponseSchema>;
