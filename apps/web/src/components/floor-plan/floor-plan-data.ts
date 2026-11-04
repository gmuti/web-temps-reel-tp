import type { TableShape } from '@app/shared'

// Géométrie fixe de la salle : pièce, cuisine et passe. Les tables viennent du
// plan de salle du restaurant (GET /floor-plan).
// Unités en mètres, repère de la scène 3D : x vers la droite, z vers l'avant (la
// salle), y vers le haut. L'origine est au centre de la salle d'origine : la
// cuisine a été agrandie vers le fond (z négatif) sans déplacer la salle, pour que
// les tables enregistrées et la zone de salle (DINING_AREA) restent valables.

export type FloorRect = { x: number; z: number; width: number; depth: number }

// Pièce : du mur du fond (minZ, côté cuisine) à l'entrée (maxZ).
const ROOM_MIN_Z = -9
const ROOM_MAX_Z = 6
export const ROOM = {
  width: 16,
  minZ: ROOM_MIN_Z,
  maxZ: ROOM_MAX_Z,
  depth: ROOM_MAX_Z - ROOM_MIN_Z,
  centerZ: (ROOM_MIN_Z + ROOM_MAX_Z) / 2,
}

// Passe-plat le long de la séparation entre salle et cuisine (inchangé).
export const PASS_COUNTER: FloorRect = { x: 0, z: -3.2, width: 7, depth: 0.6 }
// Cuisine au fond de la pièce, jusqu'au passe : environ 40 % de la surface (handoff § 6.3).
const KITCHEN_MAX_Z = PASS_COUNTER.z - PASS_COUNTER.depth / 2
export const KITCHEN: FloorRect = {
  x: 0,
  z: (ROOM_MIN_Z + KITCHEN_MAX_Z) / 2,
  width: ROOM.width,
  depth: KITCHEN_MAX_Z - ROOM_MIN_Z,
}
// Plan de travail et fourneaux le long du mur du fond.
export const KITCHEN_COUNTER_Z = ROOM_MIN_Z + 0.5
// Îlot de préparation au centre de la cuisine.
export const PREP_ISLAND: FloorRect = { x: 0, z: -6, width: 4.7, depth: 0.6 }

// Hauteurs, une fois les modules du kit à l'échelle : plan de travail, comptoir
// du passe, et rail à tickets au-dessus du passe (côté cuisine).
export const COUNTER_HEIGHT = 0.99
export const PASS_HEIGHT = 0.92
export const TICKET_RAIL_Y = 1.55
export const TICKET_RAIL_Z = PASS_COUNTER.z - 0.2

// Rangée du mur du fond, en modules du kit de 0,946 m à partir de la gauche.
export const MODULE_WIDTH = 0.946
export const KITCHEN_ROW_START_X = -7.15
export const kitchenModuleX = (index: number) => KITCHEN_ROW_START_X + index * MODULE_WIDTH
// Trois fourneaux alignés contre le mur du fond (indices de modules), allumés dans cet ordre.
export const STOVE_MODULES = [3, 7, 11] as const
export const STOVES_X = STOVE_MODULES.map(kitchenModuleX)

// Points d'ancrage des étiquettes de la cuisine et du passe.
export const KITCHEN_LABEL_POSITION: [number, number, number] = [ROOM.width / 2 - 2.5, 1.6, KITCHEN_COUNTER_Z]
export const PASS_LABEL_POSITION: [number, number, number] = [PASS_COUNTER.x, 0.4, PASS_COUNTER.z + 0.6]

// Dimensions au sol (x, z) des tables : la longue table suit l'axe x. Les
// chaises sont sur les grands côtés (z), les bouts de table (x) restent libres.
export const TABLE_SIZE: Record<TableShape, [number, number]> = {
  small: [1.0, 0.98],
  long: [1.85, 0.98],
}

// Circulation du personnel (cf. staff-routes.ts) : des allées horizontales
// (axe x) qui longent les rangées de tables, un couloir vertical qui les relie
// sans traverser de table, et un passage entre cuisine et salle au bout du passe.
// En cuisine : une allée devant les fourneaux, une autre entre l'îlot et le
// passe, reliées par les côtés de l'îlot.
export const STOVE_WALK_Z = (KITCHEN_COUNTER_Z + 0.45 + PREP_ISLAND.z - PREP_ISLAND.depth / 2) / 2
export const KITCHEN_WALK_Z = (PREP_ISLAND.z + PREP_ISLAND.depth / 2 + KITCHEN_MAX_Z) / 2
export const ISLAND_SIDE_X = PREP_ISLAND.width / 2 + 0.8
export const FRONT_AISLE_Z = PASS_COUNTER.z + 0.9
export const DINING_AISLES_Z = [FRONT_AISLE_Z, 0.5, 3.4] as const
export const CORRIDOR_X = 1.6
export const KITCHEN_DOOR_X = PASS_COUNTER.x + PASS_COUNTER.width / 2 + 0.7

// Postes des cuisiniers, dans l'ordre d'attribution : devant chaque fourneau, puis
// devant l'îlot. Le poste i cuisine quand au moins i + 1 commandes sont en préparation.
export type CookStation = { x: number; z: number; kind: 'stove' | 'island' }
export const COOK_STATIONS: readonly CookStation[] = [
  ...STOVES_X.map((x): CookStation => ({ x, z: STOVE_WALK_Z, kind: 'stove' })),
  ...[-1.2, 0, 1.2].map((x): CookStation => ({ x, z: KITCHEN_WALK_Z, kind: 'island' })),
]

// Hauteur de l'étiquette (prénom) au-dessus d'une silhouette du personnel.
export const STAFF_LABEL_Y = 1.75
