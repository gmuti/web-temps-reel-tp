import { z } from 'zod';

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
