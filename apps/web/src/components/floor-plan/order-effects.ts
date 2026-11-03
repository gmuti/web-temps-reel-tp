import { OrderSocketEvent, type Order, type OrderJournalEvent } from '@app/shared'
import {
  COUNTER_HEIGHT,
  KITCHEN_COUNTER_Z,
  PASS_COUNTER,
  PASS_HEIGHT,
  TICKET_RAIL_Y,
  TICKET_RAIL_Z,
  type FloorTable,
} from './floor-plan-data'
import { TABLE_STATE_STYLES } from './table-states'

export type Vec3 = [number, number, number]

/**
 * Effet visuel ponctuel déclenché par un événement temps réel :
 * - `arc` : un objet (ticket, assiette) vole d'un point à un autre ;
 * - `pulse` : un anneau s'élargit au sol puis s'efface.
 */
export type SceneEffect =
  | { kind: 'arc'; item: 'ticket' | 'plate'; color: string; from: Vec3; to: Vec3; vanish?: boolean }
  | { kind: 'pulse'; color: string; at: Vec3 }

const TABLE_TOP_Y = 0.8
const TICKET_START_Y = 1.2
const CANCEL_RISE = 1.2
const CANCELLED_COLOR = '#ef4444'

const RAIL: Vec3 = [PASS_COUNTER.x, TICKET_RAIL_Y, TICKET_RAIL_Z]
const PASS_TOP: Vec3 = [PASS_COUNTER.x, PASS_HEIGHT + 0.05, PASS_COUNTER.z]
const STOVE_TOP: Vec3 = [PASS_COUNTER.x, COUNTER_HEIGHT + 0.05, KITCHEN_COUNTER_Z]
// Sol de la cuisine, entre le plan de travail et le passe.
const KITCHEN_FLOOR: Vec3 = [PASS_COUNTER.x, 0.02, (KITCHEN_COUNTER_Z + PASS_COUNTER.z) / 2]

/**
 * Effet correspondant à un événement de commande. `ordersBefore` est l'état
 * avant l'événement : un changement de statut ne porte pas le numéro de table,
 * et une commande servie ou annulée a déjà quitté l'état suivant. Null si
 * l'événement n'a pas de rendu (table absente du plan, commande inconnue).
 */
export function effectOfEvent(
  entry: OrderJournalEvent,
  tables: readonly FloorTable[],
  ordersBefore: readonly Order[],
): SceneEffect | null {
  const tableNumber =
    entry.type === OrderSocketEvent.CREATED
      ? entry.event.tableNumber
      : ordersBefore.find((order) => order.id === entry.event.orderId)?.tableNumber
  const table = tables.find((candidate) => candidate.number === tableNumber)
  const atTable = (y: number): Vec3 | null => (table ? [table.x, y, table.z] : null)

  if (entry.type === OrderSocketEvent.CREATED) {
    const floor = atTable(0.02)
    return floor && { kind: 'pulse', color: TABLE_STATE_STYLES['to-validate'].color, at: floor }
  }

  const ticketStart = atTable(TICKET_START_Y)
  switch (entry.event.status) {
    case 'VALIDEE':
      return (
        ticketStart && {
          kind: 'arc',
          item: 'ticket',
          color: TABLE_STATE_STYLES.validated.color,
          from: ticketStart,
          to: RAIL,
        }
      )
    case 'EN_PREPARATION':
      return { kind: 'pulse', color: TABLE_STATE_STYLES.cooking.color, at: KITCHEN_FLOOR }
    case 'PRETE':
      return { kind: 'arc', item: 'plate', color: '#ffffff', from: STOVE_TOP, to: PASS_TOP }
    case 'SERVIE': {
      const tableTop = atTable(TABLE_TOP_Y)
      return tableTop && { kind: 'arc', item: 'plate', color: '#ffffff', from: PASS_TOP, to: tableTop }
    }
    case 'ANNULEE':
      return (
        ticketStart && {
          kind: 'arc',
          item: 'ticket',
          color: CANCELLED_COLOR,
          from: ticketStart,
          to: [ticketStart[0], ticketStart[1] + CANCEL_RISE, ticketStart[2]],
          vanish: true,
        }
      )
    default:
      return null
  }
}

// Garde-fou des animations : au-delà de quelques effets rapprochés (rafale,
// arrivée groupée), la scène se met à jour sans effet pour rester lisible.
export const MAX_EFFECTS_PER_WINDOW = 6
export const EFFECT_WINDOW_MS = 2000

/**
 * Instants des effets encore dans la fenêtre si un nouvel effet est accepté à
 * `now`, ou null s'il faut s'abstenir.
 */
export function admitEffect(recent: readonly number[], now: number): number[] | null {
  const inWindow = recent.filter((time) => now - time < EFFECT_WINDOW_MS)
  return inWindow.length >= MAX_EFFECTS_PER_WINDOW ? null : [...inWindow, now]
}
