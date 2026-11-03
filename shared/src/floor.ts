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
// de table est alors accepté à la création d'une commande. `version` augmente à
// chaque modification du plan (éditeur) : elle détecte les modifications concurrentes.
export const floorPlanSchema = z.object({
  tables: z.array(floorTableSchema),
  version: z.number().int().nonnegative(),
});
export type FloorPlan = z.infer<typeof floorPlanSchema>;

// Places maximales selon la forme de la table.
export const TABLE_SEATS_MAX: Readonly<Record<TableShape, number>> = { small: 2, long: 4 };

// Emprise au sol d'une table (x, z), chaises et place pour servir comprises :
// deux tables ne doivent pas se chevaucher.
export const TABLE_FOOTPRINT: Readonly<Record<TableShape, readonly [number, number]>> = {
  small: [1.9, 2.1],
  long: [2.75, 2.1],
};

// Zone de la salle où poser des tables (la cuisine et le passe sont au fond, z < -2.2).
export const DINING_AREA = { minX: -7.9, maxX: 7.9, minZ: -2.2, maxZ: 5.9 } as const;

export const FLOOR_PLAN_MAX_TABLES = 60;

export function tablesOverlap(a: FloorTable, b: FloorTable): boolean {
  const [aw, ad] = TABLE_FOOTPRINT[a.shape];
  const [bw, bd] = TABLE_FOOTPRINT[b.shape];
  return Math.abs(a.x - b.x) < (aw + bw) / 2 && Math.abs(a.z - b.z) < (ad + bd) / 2;
}

export function isInsideDiningArea(table: FloorTable): boolean {
  const [width, depth] = TABLE_FOOTPRINT[table.shape];
  return (
    table.x - width / 2 >= DINING_AREA.minX &&
    table.x + width / 2 <= DINING_AREA.maxX &&
    table.z - depth / 2 >= DINING_AREA.minZ &&
    table.z + depth / 2 <= DINING_AREA.maxZ
  );
}

/**
 * Problèmes d'un plan de salle, en clair (vide si le plan est valide). Mêmes
 * règles dans l'éditeur, qui les affiche, et sur le serveur, qui refuse le plan.
 */
export function floorPlanProblems(tables: readonly FloorTable[]): string[] {
  const problems: string[] = [];
  const seen = new Set<number>();
  for (const table of tables) {
    if (seen.has(table.number)) problems.push(`Le numéro ${table.number} est utilisé deux fois.`);
    seen.add(table.number);
    if (table.seats > TABLE_SEATS_MAX[table.shape]) {
      problems.push(`La table ${table.number} a trop de places pour sa forme.`);
    }
    if (!isInsideDiningArea(table)) problems.push(`La table ${table.number} sort de la salle.`);
  }
  tables.forEach((table, index) =>
    tables.slice(index + 1).forEach((other) => {
      if (tablesOverlap(table, other)) {
        problems.push(`Les tables ${table.number} et ${other.number} se chevauchent.`);
      }
    }),
  );
  return problems;
}

// PUT /floor-plan — remplace le plan (éditeur). `expectedVersion` : version sur
// laquelle l'éditeur a travaillé ; refusé si le plan a changé entre-temps.
export const updateFloorPlanRequestSchema = z
  .object({
    expectedVersion: z.number().int().nonnegative(),
    tables: z.array(floorTableSchema).max(FLOOR_PLAN_MAX_TABLES),
  })
  .superRefine(({ tables }, context) => {
    for (const message of floorPlanProblems(tables)) {
      context.addIssue({ code: 'custom', message, path: ['tables'] });
    }
  });
export type UpdateFloorPlanRequest = z.infer<typeof updateFloorPlanRequestSchema>;

// Le plan se modifie hors service : c'est l'administration du restaurant.
export function canRoleEditFloorPlan(role: UserRole): boolean {
  return role === UserRole.MANAGER;
}

export const FloorPlanErrorCode = {
  // Le plan a été modifié par quelqu'un d'autre depuis son chargement.
  FLOOR_PLAN_CONFLICT: 'FLOOR_PLAN_CONFLICT',
  // On ne retire pas une table occupée ou qui a des commandes en cours.
  TABLE_IN_USE: 'TABLE_IN_USE',
} as const;

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
