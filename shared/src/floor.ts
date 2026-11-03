import { z } from 'zod';
import { UserRole } from './role.js';

// Petite table carrée pour 2, longue table rectangulaire pour 4.
export const tableShapeSchema = z.enum(['small', 'long']);
export type TableShape = z.infer<typeof tableShapeSchema>;

// Une table du plan de salle. Position au sol en mètres, origine au centre de
// la pièce : x vers la droite, z vers l'avant (la salle), cuisine au fond (z < 0).
export const floorTableSchema = z.object({
  number: z.number().int().positive(),
  x: z.number(),
  z: z.number(),
  shape: tableShapeSchema,
  seats: z.number().int().positive(),
});
export type FloorTable = z.infer<typeof floorTableSchema>;

// GET /floor-plan — le plan du restaurant de l'utilisateur authentifié. Un plan
// vide signifie que le restaurant n'a pas (encore) décrit sa salle : tout numéro
// de table est alors accepté à la création d'une commande.
export const floorPlanSchema = z.object({
  tables: z.array(floorTableSchema),
});
export type FloorPlan = z.infer<typeof floorPlanSchema>;

// Occupation d'une table : libre, occupée (clients installés), à débarrasser
// (clients partis). Le cycle est fermé : une table débarrassée redevient libre.
export const tableStatusSchema = z.enum(['LIBRE', 'OCCUPEE', 'A_DEBARRASSER']);
export const TableStatus = tableStatusSchema.enum;
export type TableStatus = z.infer<typeof tableStatusSchema>;

export const TABLE_STATUS_TRANSITIONS: Readonly<Record<TableStatus, readonly TableStatus[]>> = {
  LIBRE: [TableStatus.OCCUPEE],
  OCCUPEE: [TableStatus.A_DEBARRASSER],
  A_DEBARRASSER: [TableStatus.LIBRE],
};

export function canTransitionTableStatus(from: TableStatus, to: TableStatus): boolean {
  return TABLE_STATUS_TRANSITIONS[from].includes(to);
}

// La salle gère ses tables : serveurs et responsable. La cuisine et le manager
// voient l'occupation sans la modifier.
const TABLE_STATUS_ROLES: readonly UserRole[] = [UserRole.WAITER, UserRole.RESPONSABLE];

export function canRoleSetTableStatus(role: UserRole): boolean {
  return TABLE_STATUS_ROLES.includes(role);
}

export const TABLE_GUESTS_MAX = 50;

// État courant d'une table, visible par tout le restaurant (il ne dit rien des
// commandes). `version` augmente à chaque changement : un client garde l'état de
// version la plus haute, quel que soit l'ordre d'arrivée (instantané, événements).
export const tableStateSchema = z.object({
  number: z.number().int().positive(),
  status: tableStatusSchema,
  // Nombre de couverts, connu si la table a été installée explicitement.
  guests: z.number().int().positive().nullable(),
  statusChangedAt: z.coerce.date(),
  version: z.number().int().nonnegative(),
});
export type TableState = z.infer<typeof tableStateSchema>;

export const tableStatesSchema = z.array(tableStateSchema);

// Demande de changement d'occupation (contrat `table:status:update`).
export const updateTableStatusInputSchema = z.object({
  tableNumber: z.number().int().positive(),
  expectedStatus: tableStatusSchema,
  requestedStatus: tableStatusSchema,
  // Couverts, pour l'installation des clients (OCCUPEE).
  guests: z.number().int().positive().max(TABLE_GUESTS_MAX).optional(),
});
export type UpdateTableStatusInput = z.infer<typeof updateTableStatusInputSchema>;

// Forme HTTP : PATCH /floor-plan/tables/:number/status, le numéro est dans l'URL.
export const updateTableStatusRequestSchema = updateTableStatusInputSchema.omit({
  tableNumber: true,
});
export type UpdateTableStatusRequest = z.infer<typeof updateTableStatusRequestSchema>;

// Événement publié à tout le restaurant après un changement d'occupation.
export const tableStatusUpdatedEventSchema = tableStateSchema.extend({
  previousStatus: tableStatusSchema,
  updatedBy: z.string().uuid(),
});
export type TableStatusUpdatedEvent = z.infer<typeof tableStatusUpdatedEventSchema>;

// Codes d'erreur propres aux tables (les autres sont communs aux commandes).
export const TableErrorCode = {
  TABLE_NOT_FOUND: 'TABLE_NOT_FOUND',
  // On ne libère pas une table dont des commandes sont encore en cours.
  TABLE_HAS_ACTIVE_ORDERS: 'TABLE_HAS_ACTIVE_ORDERS',
} as const;
