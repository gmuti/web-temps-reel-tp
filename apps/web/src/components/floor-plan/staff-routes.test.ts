import type { FloorTable, Order, OrderJournalEvent } from '@app/shared'
import { describe, expect, it } from 'vitest'
import { CORRIDOR_X, DINING_AISLES_Z, FRONT_AISLE_Z, KITCHEN_DOOR_X, KITCHEN_WALK_Z } from './floor-plan-data'
import {
  destinationsOf,
  DWELL_MS,
  planTrip,
  positionAt,
  routeBetween,
  standAt,
  WALK_SPEED,
  type Point,
} from './staff-routes'

const TABLES: FloorTable[] = [
  { number: 2, x: -3, z: -1, shape: 'long', seats: 4 },
  { number: 9, x: 6, z: 2, shape: 'long', seats: 4 },
]
const USER_ID = '00000000-0000-4000-8000-0000000000ff'
const ORDER_ID = '00000000-0000-4000-8000-000000000001'
const date = new Date(Date.UTC(2026, 10, 3, 12, 0))

const waiterHome: Point = { x: 4.3, z: FRONT_AISLE_Z }
const cookHome: Point = { x: -2.4, z: KITCHEN_WALK_Z }

// Chaque déplacement d'un itinéraire suit un seul axe (allées et couloir).
const isAxisAligned = (route: Point[]) =>
  route.every((point, index) => index === 0 || point.x === route[index - 1].x || point.z === route[index - 1].z)

describe('routeBetween', () => {
  it('relie deux rangées de tables par le couloir, sans couper en diagonale', () => {
    const route = routeBetween(waiterHome, standAt(TABLES[1]))
    expect(route[0]).toEqual(waiterHome)
    expect(route.at(-1)).toEqual(standAt(TABLES[1]))
    expect(route).toContainEqual({ x: CORRIDOR_X, z: FRONT_AISLE_Z })
    expect(route).toContainEqual({ x: CORRIDOR_X, z: 3.4 })
    expect(isAxisAligned(route)).toBe(true)
  })

  it('reste sur son allée quand la destination la borde', () => {
    const route = routeBetween(waiterHome, standAt(TABLES[0]))
    expect(route.some((point) => point.x === CORRIDOR_X)).toBe(false)
    expect(isAxisAligned(route)).toBe(true)
  })

  it('sort de la cuisine par le bout du passe', () => {
    const route = routeBetween(cookHome, standAt(TABLES[0]))
    expect(route).toContainEqual({ x: KITCHEN_DOOR_X, z: KITCHEN_WALK_Z })
    expect(route).toContainEqual({ x: KITCHEN_DOOR_X, z: FRONT_AISLE_Z })
    expect(isAxisAligned(route)).toBe(true)
  })

  it('emprunte uniquement des allées connues entre deux tables', () => {
    const route = routeBetween(standAt(TABLES[0]), standAt(TABLES[1])).slice(1, -1)
    route.forEach((point) =>
      expect((DINING_AISLES_Z as readonly number[]).includes(point.z) || point.x === CORRIDOR_X).toBe(true),
    )
  })
})

describe('standAt', () => {
  it('se place au bout de la table, du côté du couloir', () => {
    const left = standAt(TABLES[0])
    const right = standAt(TABLES[1])
    expect(left.x).toBeCloseTo(-3 + 1.85 / 2 + 0.45)
    expect(left.z).toBe(-1)
    expect(right.x).toBeCloseTo(6 - 1.85 / 2 - 0.45)
    expect(right.z).toBe(2)
  })
})

describe('positionAt', () => {
  const trip = [
    { x: 0, z: 0 },
    { x: WALK_SPEED, z: 0, dwellMs: DWELL_MS },
    { x: 0, z: 0 },
  ]

  it('avance à vitesse constante, marque la pause, puis revient', () => {
    expect(positionAt(trip, 0)).toEqual({ x: 0, z: 0, done: false })
    expect(positionAt(trip, 500).x).toBeCloseTo(WALK_SPEED / 2)
    expect(positionAt(trip, 1000 + DWELL_MS / 2)).toEqual({ x: WALK_SPEED, z: 0, done: false })
    expect(positionAt(trip, 1000 + DWELL_MS + 500).x).toBeCloseTo(WALK_SPEED / 2)
    expect(positionAt(trip, 1000 + DWELL_MS + 1000)).toEqual({ x: 0, z: 0, done: true })
  })
})

describe('planTrip', () => {
  it('fait une pause à chaque destination et finit au poste', () => {
    const destinations = [{ x: 0, z: FRONT_AISLE_Z }, standAt(TABLES[1])]
    const trip = planTrip(waiterHome, destinations, waiterHome)
    expect(trip.filter((point) => point.dwellMs === DWELL_MS)).toEqual([
      { ...destinations[0], dwellMs: DWELL_MS },
      { ...destinations[1], dwellMs: DWELL_MS },
    ])
    expect(trip.at(-1)).toEqual(waiterHome)
  })
})

describe('destinationsOf', () => {
  const order = { id: ORDER_ID, tableNumber: 9 } as Order
  const statusUpdated = (status: Order['status']): OrderJournalEvent => ({
    type: 'order:status-updated',
    event: { eventId: 2, orderId: ORDER_ID, previousStatus: 'A_VALIDER', status, updatedBy: USER_ID, updatedAt: date },
  })

  it('mène le serveur au passe puis à la table pour servir', () => {
    expect(destinationsOf(statusUpdated('SERVIE'), 'WAITER', TABLES, [order])).toEqual([
      { x: 0, z: FRONT_AISLE_Z },
      standAt(TABLES[1]),
    ])
  })

  it('garde le cuisinier en cuisine', () => {
    const [stove] = destinationsOf(statusUpdated('EN_PREPARATION'), 'COOK', TABLES, [order])
    const [pass] = destinationsOf(statusUpdated('PRETE'), 'COOK', TABLES, [order])
    expect(stove.z).toBeLessThan(KITCHEN_WALK_Z)
    expect(pass).toEqual({ x: 0, z: KITCHEN_WALK_Z })
  })

  it("mène à la table pour un changement d'occupation, et nulle part hors plan", () => {
    const tableEvent = {
      number: 2,
      status: 'OCCUPEE' as const,
      previousStatus: 'LIBRE' as const,
      guests: 2,
      statusChangedAt: date,
      version: 1,
      updatedBy: USER_ID,
    }
    expect(destinationsOf(tableEvent, 'WAITER', TABLES, [])).toEqual([standAt(TABLES[0])])
    expect(destinationsOf({ ...tableEvent, number: 42 }, 'WAITER', TABLES, [])).toEqual([])
  })
})
