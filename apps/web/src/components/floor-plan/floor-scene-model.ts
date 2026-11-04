import {
  canSeeAllOrders,
  orderChatChannel,
  type ChatAuthor,
  type FloorTable,
  type Order,
  type TableState,
  type UserRole,
} from '@app/shared'
import { COOK_STATIONS, DINING_AISLES_Z, FRONT_AISLE_Z, KITCHEN_WALK_Z, PASS_COUNTER, ROOM } from './floor-plan-data'

/**
 * État visuel d'une table : d'abord celui de sa commande la plus urgente, sinon
 * son occupation (occupée, à débarrasser, libre).
 * `unknown` : occupation pas encore chargée, et un serveur ne voit que ses
 * propres commandes — il ne peut pas savoir si la table est libre.
 */
export type TableVisualState =
  'free' | 'unknown' | 'occupied' | 'to-clear' | 'to-validate' | 'validated' | 'cooking' | 'ready'

export type TableView = FloorTable & {
  state: TableVisualState
  orders: Order[]
  // Occupation de la table (null tant qu'elle n'est pas chargée).
  occupancy: TableState | null
  // Entrée dans l'état affiché : la plus ancienne commande du statut le plus
  // urgent, ou le dernier changement d'occupation.
  since: Date | null
  // Messages non lus dans les discussions des commandes de la table.
  unread: number
}

export type SceneModel = {
  tables: TableView[]
  // Commandes dont la table n'existe pas sur le plan.
  offPlan: Order[]
  kitchenTickets: Order[]
  passPlates: Order[]
}

// Urgence de chaque statut pour la salle : une commande prête doit partir en
// premier, puis une commande à valider bloque la cuisine.
const URGENCY: Record<Order['status'], number> = {
  PRETE: 4,
  A_VALIDER: 3,
  VALIDEE: 2,
  EN_PREPARATION: 1,
  SERVIE: 0,
  ANNULEE: 0,
}

const STATE_OF_STATUS: Partial<Record<Order['status'], TableVisualState>> = {
  PRETE: 'ready',
  A_VALIDER: 'to-validate',
  VALIDEE: 'validated',
  EN_PREPARATION: 'cooking',
}

const byUpdatedAt = (a: Order, b: Order) => a.updatedAt.getTime() - b.updatedAt.getTime()

// Attente au-delà de laquelle une table est signalée en retard, selon son état.
// Une assiette prête refroidit vite ; une préparation prend naturellement du temps.
export const LATE_AFTER_MINUTES: Partial<Record<TableVisualState, number>> = {
  ready: 3,
  'to-validate': 5,
  validated: 10,
  cooking: 20,
  // Une table à débarrasser bloque l'installation des clients suivants.
  'to-clear': 5,
}

const STATE_OF_OCCUPANCY: Record<TableState['status'], TableVisualState> = {
  LIBRE: 'free',
  OCCUPEE: 'occupied',
  A_DEBARRASSER: 'to-clear',
}

export function isLate(state: TableVisualState, since: Date | null, now: Date): boolean {
  const limit = LATE_AFTER_MINUTES[state]
  return limit !== undefined && since !== null && now.getTime() - since.getTime() >= limit * 60_000
}

/**
 * Modèle de la scène, indépendant du rendu : la scène 3D ne fait que l'afficher.
 * `orders` vient de useOrdersRealtime (déjà filtré selon le rôle, sans les
 * commandes servies ni annulées).
 */
export function buildScene(
  tables: readonly FloorTable[],
  orders: readonly Order[],
  unread: Record<string, number>,
  viewerRole: UserRole,
  occupancy: Readonly<Record<number, TableState>> = {},
): SceneModel {
  const active = orders.filter((order) => URGENCY[order.status] > 0)
  const planNumbers = new Set(tables.map((table) => table.number))

  const tableViews = tables.map((table): TableView => {
    const tableOrders = active.filter((order) => order.tableNumber === table.number).sort(byUpdatedAt)
    const top = Math.max(0, ...tableOrders.map((order) => URGENCY[order.status]))
    const mostUrgent = tableOrders.find((order) => URGENCY[order.status] === top)
    const tableOccupancy = occupancy[table.number] ?? null
    const occupancyState = tableOccupancy
      ? STATE_OF_OCCUPANCY[tableOccupancy.status]
      : canSeeAllOrders(viewerRole)
        ? 'free'
        : 'unknown'
    return {
      ...table,
      state: mostUrgent ? (STATE_OF_STATUS[mostUrgent.status] ?? 'free') : occupancyState,
      orders: tableOrders,
      occupancy: tableOccupancy,
      since:
        mostUrgent?.updatedAt ??
        (tableOccupancy?.status === 'LIBRE' ? null : (tableOccupancy?.statusChangedAt ?? null)),
      unread: tableOrders.reduce((sum, order) => sum + (unread[orderChatChannel(order.id)] ?? 0), 0),
    }
  })

  return {
    tables: tableViews,
    offPlan: active.filter((order) => !planNumbers.has(order.tableNumber)).sort(byUpdatedAt),
    kitchenTickets: active
      .filter((order) => order.status === 'VALIDEE' || order.status === 'EN_PREPARATION')
      .sort(byUpdatedAt),
    passPlates: active.filter((order) => order.status === 'PRETE').sort(byUpdatedAt),
  }
}

export type StaffZone = 'kitchen' | 'floor' | 'office'

// `station` : rang du poste d'un cuisinier (cf. COOK_STATIONS), null pour les autres rôles.
export type StaffView = { user: ChatAuthor; zone: StaffZone; x: number; z: number; station: number | null }

// Où se tient chaque rôle, toujours sur une allée (cf. staff-routes.ts) :
// chaque cuisinier à son poste (fourneau, puis îlot), serveurs côté salle devant
// le passe, responsables et managers à l'entrée.
const ZONE_OF_ROLE: Record<UserRole, StaffZone> = {
  COOK: 'kitchen',
  WAITER: 'floor',
  RESPONSABLE: 'office',
  MANAGER: 'office',
}

const ZONE_ORIGIN: Record<StaffZone, { x: number; z: number; step: number }> = {
  kitchen: { x: -5.5, z: KITCHEN_WALK_Z, step: -0.8 },
  floor: { x: PASS_COUNTER.x + PASS_COUNTER.width / 2 + 0.8, z: FRONT_AISLE_Z, step: 0.8 },
  office: { x: ROOM.width / 2 - 1, z: DINING_AISLES_Z[DINING_AISLES_Z.length - 1], step: -0.8 },
}

/**
 * Personnes connectées (présence) placées dans la zone de leur rôle, côte à
 * côte dans l'ordre de la liste. Position symbolique : l'application ne connaît
 * pas la position réelle du personnel.
 */
export function placeStaff(online: readonly ChatAuthor[]): StaffView[] {
  const placed: Record<StaffZone, number> = { kitchen: 0, floor: 0, office: 0 }
  return online.map((user) => {
    const zone = ZONE_OF_ROLE[user.role]
    const origin = ZONE_ORIGIN[zone]
    const index = placed[zone]++
    const station = zone === 'kitchen' ? COOK_STATIONS[index] : undefined
    // Plus de cuisiniers que de postes : les suivants attendent côte à côte devant le passe.
    if (zone === 'kitchen' && station) return { user, zone, x: station.x, z: station.z, station: index }
    return { user, zone, x: origin.x + index * origin.step, z: origin.z, station: null }
  })
}
