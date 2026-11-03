import { canSeeAllOrders, orderChatChannel, type ChatAuthor, type Order, type UserRole } from '@app/shared'
import { KITCHEN_COUNTER_Z, PASS_COUNTER, ROOM, type FloorTable } from './floor-plan-data'

/**
 * État visuel d'une table, déduit de ses commandes en cours.
 * `unknown` : un serveur ne voit que ses propres commandes, il ne peut donc pas
 * savoir si une table sans commande de sa part est libre.
 */
export type TableVisualState = 'free' | 'unknown' | 'to-validate' | 'validated' | 'cooking' | 'ready'

export type TableView = FloorTable & {
  state: TableVisualState
  orders: Order[]
  // Entrée dans le statut le plus urgent (la plus ancienne commande de ce statut).
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
): SceneModel {
  const active = orders.filter((order) => URGENCY[order.status] > 0)
  const planNumbers = new Set(tables.map((table) => table.number))

  const tableViews = tables.map((table): TableView => {
    const tableOrders = active.filter((order) => order.tableNumber === table.number).sort(byUpdatedAt)
    const top = Math.max(0, ...tableOrders.map((order) => URGENCY[order.status]))
    const mostUrgent = tableOrders.find((order) => URGENCY[order.status] === top)
    return {
      ...table,
      state: mostUrgent
        ? (STATE_OF_STATUS[mostUrgent.status] ?? 'free')
        : canSeeAllOrders(viewerRole)
          ? 'free'
          : 'unknown',
      orders: tableOrders,
      since: mostUrgent?.updatedAt ?? null,
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

export type StaffView = { user: ChatAuthor; zone: StaffZone; x: number; z: number }

// Où se tient chaque rôle : cuisiniers entre le plan de travail et le passe,
// serveurs côté salle devant le passe, responsables et managers à l'entrée.
const ZONE_OF_ROLE: Record<UserRole, StaffZone> = {
  COOK: 'kitchen',
  WAITER: 'floor',
  RESPONSABLE: 'office',
  MANAGER: 'office',
}

const ZONE_ORIGIN: Record<StaffZone, { x: number; z: number; step: number }> = {
  kitchen: { x: -2.4, z: (KITCHEN_COUNTER_Z + PASS_COUNTER.z) / 2, step: 1.2 },
  floor: { x: PASS_COUNTER.x + PASS_COUNTER.width / 2 + 0.8, z: PASS_COUNTER.z + 1, step: 0.8 },
  office: { x: ROOM.width / 2 - 1, z: ROOM.depth / 2 - 2.2, step: -0.8 },
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
    return { user, zone, x: origin.x + index * origin.step, z: origin.z }
  })
}
