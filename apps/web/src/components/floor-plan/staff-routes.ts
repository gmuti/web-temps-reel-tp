import {
  OrderSocketEvent,
  type FloorTable,
  type Order,
  type OrderJournalEvent,
  type TableStatusUpdatedEvent,
  type UserRole,
} from '@app/shared'
import {
  CORRIDOR_X,
  DINING_AISLES_Z,
  FRONT_AISLE_Z,
  KITCHEN_COUNTER_Z,
  KITCHEN_DOOR_X,
  KITCHEN_WALK_Z,
  PASS_COUNTER,
  TABLE_SIZE,
} from './floor-plan-data'

/**
 * Déplacements du personnel sur le plan. Pas de recherche de chemin : la salle
 * a des allées fixes (cf. floor-plan-data.ts) et un trajet les emprunte —
 * allée de départ, couloir vertical, allée d'arrivée, puis le dernier pas vers
 * la destination. Le personnel ne traverse ainsi ni les tables ni le comptoir.
 */

export type Point = { x: number; z: number }

// Point de passage ; `dwellMs` : temps passé sur place avant de repartir.
export type Waypoint = Point & { dwellMs?: number }

export const WALK_SPEED = 2.2 // m/s, un pas de service soutenu
export const DWELL_MS = 2000

// Au-delà du passe (z), on est en cuisine.
const isKitchen = (point: Point) => point.z < PASS_COUNTER.z - 0.3

const nearestAisle = (z: number) =>
  DINING_AISLES_Z.reduce((best, aisle) => (Math.abs(aisle - z) < Math.abs(best - z) ? aisle : best))

/** Itinéraire de `from` à `to` par les allées, extrémités comprises. */
export function routeBetween(from: Point, to: Point): Point[] {
  const points: Point[] = [from]
  let aisle: number

  if (isKitchen(from)) {
    points.push({ x: from.x, z: KITCHEN_WALK_Z })
    if (isKitchen(to)) {
      points.push({ x: to.x, z: KITCHEN_WALK_Z }, to)
      return dedupe(points)
    }
    // Sortie de la cuisine par le bout du passe, vers l'allée devant le passe.
    points.push({ x: KITCHEN_DOOR_X, z: KITCHEN_WALK_Z }, { x: KITCHEN_DOOR_X, z: FRONT_AISLE_Z })
    aisle = FRONT_AISLE_Z
  } else {
    aisle = nearestAisle(from.z)
    points.push({ x: from.x, z: aisle })
  }

  const targetAisle = isKitchen(to) ? FRONT_AISLE_Z : nearestAisle(to.z)
  if (aisle !== targetAisle) {
    points.push({ x: CORRIDOR_X, z: aisle }, { x: CORRIDOR_X, z: targetAisle })
  }
  if (isKitchen(to)) {
    points.push(
      { x: KITCHEN_DOOR_X, z: FRONT_AISLE_Z },
      { x: KITCHEN_DOOR_X, z: KITCHEN_WALK_Z },
      { x: to.x, z: KITCHEN_WALK_Z },
      to,
    )
  } else {
    points.push({ x: to.x, z: targetAisle }, to)
  }
  return dedupe(points)
}

function dedupe(points: Point[]): Point[] {
  return points.filter(
    (point, index) =>
      index === 0 || Math.abs(point.x - points[index - 1].x) > 1e-6 || Math.abs(point.z - points[index - 1].z) > 1e-6,
  )
}

// Où se tenir pour servir une table : à son bout (côté x), là où il n'y a pas de chaise.
export function standAt(table: FloorTable): Point {
  const side = table.x <= CORRIDOR_X ? 1 : -1
  return { x: table.x + side * (TABLE_SIZE[table.shape][0] / 2 + 0.45), z: table.z }
}

const PASS_FRONT: Point = { x: PASS_COUNTER.x, z: FRONT_AISLE_Z }
const PASS_BACK: Point = { x: PASS_COUNTER.x, z: KITCHEN_WALK_Z }
const STOVE_FRONT: Point = { x: -4.3, z: KITCHEN_COUNTER_Z + 0.8 }

/**
 * Lieux où se rend l'auteur d'un événement, dans l'ordre (une commande servie :
 * le passe, puis la table). Vide si l'événement ne concerne pas une table du plan.
 */
export function destinationsOf(
  entry: OrderJournalEvent | TableStatusUpdatedEvent,
  actorRole: UserRole,
  tables: readonly FloorTable[],
  ordersBefore: readonly Order[],
): Point[] {
  const tableNumber =
    'number' in entry
      ? entry.number
      : entry.type === OrderSocketEvent.CREATED
        ? entry.event.tableNumber
        : ordersBefore.find((order) => order.id === entry.event.orderId)?.tableNumber
  const table = tables.find((candidate) => candidate.number === tableNumber)
  const atTable = table ? [standAt(table)] : []

  if ('number' in entry || entry.type === OrderSocketEvent.CREATED) return atTable

  const inKitchen = actorRole === 'COOK'
  switch (entry.event.status) {
    case 'EN_PREPARATION':
      return [inKitchen ? STOVE_FRONT : PASS_FRONT]
    case 'PRETE':
      return [inKitchen ? PASS_BACK : PASS_FRONT]
    case 'SERVIE':
      return table ? [PASS_FRONT, standAt(table)] : []
    default:
      return atTable
  }
}

/**
 * Trajet complet : de `from` à chaque destination (avec une pause sur place),
 * puis retour au poste `home`.
 */
export function planTrip(from: Point, destinations: readonly Point[], home: Point): Waypoint[] {
  const stops = [...destinations, home]
  const trip: Waypoint[] = [from]
  let current = from
  stops.forEach((stop, index) => {
    const route = routeBetween(current, stop).slice(1)
    const isDestination = index < destinations.length
    route.forEach((point, pointIndex) => {
      const arrived = pointIndex === route.length - 1
      trip.push(arrived && isDestination ? { ...point, dwellMs: DWELL_MS } : point)
    })
    current = stop
  })
  return trip
}

/** Position le long d'un trajet après `elapsedMs` ; `done` une fois revenu. */
export function positionAt(trip: readonly Waypoint[], elapsedMs: number): Point & { done: boolean } {
  let remaining = elapsedMs
  for (let index = 1; index < trip.length; index++) {
    const from = trip[index - 1]
    const to = trip[index]
    // Pause sur place au point précédent avant de repartir.
    const dwell = from.dwellMs ?? 0
    if (remaining < dwell) return { x: from.x, z: from.z, done: false }
    remaining -= dwell

    const legMs = (Math.hypot(to.x - from.x, to.z - from.z) / WALK_SPEED) * 1000
    if (remaining < legMs) {
      const t = legMs === 0 ? 1 : remaining / legMs
      return { x: from.x + (to.x - from.x) * t, z: from.z + (to.z - from.z) * t, done: false }
    }
    remaining -= legMs
  }
  const last = trip[trip.length - 1]
  return { x: last.x, z: last.z, done: true }
}
