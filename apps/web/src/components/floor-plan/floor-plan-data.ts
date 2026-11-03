// Plan statique de la salle (MVP) : il sera remplacé par un plan servi par l'API.
// Unités en mètres, repère de la scène 3D : x vers la droite, z vers l'avant (la
// salle), y vers le haut. L'origine est au centre de la pièce.

// Petite table carrée pour 2, longue table rectangulaire (axe x) pour 4.
export type TableShape = 'small' | 'long'

export type FloorTable = {
  number: number
  x: number
  z: number
  shape: TableShape
  seats: 2 | 4
}

export type FloorRect = { x: number; z: number; width: number; depth: number }

export const ROOM = { width: 16, depth: 12 }

// Cuisine au fond de la pièce, séparée de la salle par le passe-plat.
export const KITCHEN: FloorRect = { x: 0, z: -4.75, width: 16, depth: 2.5 }
export const PASS_COUNTER: FloorRect = { x: 0, z: -3.2, width: 7, depth: 0.6 }
// Plan de travail le long du mur du fond.
export const KITCHEN_COUNTER_Z = -ROOM.depth / 2 + 0.5
// Hauteurs, une fois les modules du kit à l'échelle : plan de travail, comptoir
// du passe, et rail à tickets au-dessus du passe (côté cuisine).
export const COUNTER_HEIGHT = 0.99
export const PASS_HEIGHT = 0.92
export const TICKET_RAIL_Y = 1.55
export const TICKET_RAIL_Z = PASS_COUNTER.z - 0.2

// Points d'ancrage des étiquettes de la cuisine et du passe.
export const KITCHEN_LABEL_POSITION: [number, number, number] = [ROOM.width / 2 - 2.5, 1.6, KITCHEN_COUNTER_Z]
export const PASS_LABEL_POSITION: [number, number, number] = [PASS_COUNTER.x, 0.4, PASS_COUNTER.z + 0.6]

export const FLOOR_TABLES: readonly FloorTable[] = [
  { number: 1, x: -6, z: -1, shape: 'small', seats: 2 },
  { number: 2, x: -3, z: -1, shape: 'long', seats: 4 },
  { number: 3, x: 3, z: -1, shape: 'long', seats: 4 },
  { number: 4, x: 6, z: -1, shape: 'small', seats: 2 },
  { number: 5, x: -6, z: 2, shape: 'long', seats: 4 },
  { number: 6, x: -3, z: 2, shape: 'small', seats: 2 },
  { number: 7, x: 0, z: 2, shape: 'long', seats: 4 },
  { number: 8, x: 3, z: 2, shape: 'small', seats: 2 },
  { number: 9, x: 6, z: 2, shape: 'long', seats: 4 },
  { number: 10, x: -4.5, z: 4.8, shape: 'small', seats: 2 },
  { number: 11, x: 0, z: 4.8, shape: 'long', seats: 4 },
  { number: 12, x: 4.5, z: 4.8, shape: 'small', seats: 2 },
]
