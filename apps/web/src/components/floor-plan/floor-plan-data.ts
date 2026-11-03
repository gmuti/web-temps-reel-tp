// Géométrie fixe de la salle : pièce, cuisine et passe. Les tables viennent du
// plan de salle du restaurant (GET /floor-plan).
// Unités en mètres, repère de la scène 3D : x vers la droite, z vers l'avant (la
// salle), y vers le haut. L'origine est au centre de la pièce.

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
