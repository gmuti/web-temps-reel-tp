import { z } from 'zod';

/**
 * Rôles applicatifs (cf. README, "Rôles proposés").
 * RESPONSABLE : supervise le service, accède à tous les canaux.
 * MANAGER     : gère les utilisateurs et les restaurants.
 * WAITER      : enregistre les commandes depuis la salle (Serveur).
 * COOK        : prépare les commandes (Cuisine).
 */
export const userRoleSchema = z.enum(['RESPONSABLE', 'MANAGER', 'WAITER', 'COOK']);

export const UserRole = userRoleSchema.enum;

export type UserRole = z.infer<typeof userRoleSchema>;
