import { canSeeAllOrders, orderChatChannel, type Order, type UserRole } from '@app/shared'
import type { FloorTable } from './floor-plan-data'

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
