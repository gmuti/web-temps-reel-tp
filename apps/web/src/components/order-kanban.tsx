import type { Order, UserRole } from '@app/shared'
import { STATUS_LABELS } from '@/lib/order-status'
import { Badge } from '@/components/ui/badge'
import { OrderCard } from '@/components/order-card'

// Colonnes du kanban : les statuts en cours (servies et annulées quittent le tableau).
const KANBAN_COLUMNS: readonly Order['status'][] = ['A_VALIDER', 'VALIDEE', 'EN_PREPARATION', 'PRETE']

type OrderKanbanProps = {
  orders: Order[]
  role: UserRole
  pendingOrderId: string | null
  onStatusChange: (order: Order, status: Order['status']) => void
  onOpenDiscussion: (order: Order) => void
}

/**
 * Vue kanban des commandes en cours. Elle ne fait qu'afficher : l'état et les
 * actions viennent d'OrderBoard, partagés avec les autres vues.
 */
export function OrderKanban({ orders, role, pendingOrderId, onStatusChange, onOpenDiscussion }: OrderKanbanProps) {
  return (
    <main className="grid auto-cols-[minmax(15rem,1fr)] grid-flow-col gap-4 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map((status) => {
        const columnOrders = orders.filter((order) => order.status === status)
        return (
          <section key={status} aria-label={STATUS_LABELS[status]} className="bg-muted/50 rounded-lg p-3">
            <header className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">{STATUS_LABELS[status]}</h2>
              <Badge variant="secondary">{columnOrders.length}</Badge>
            </header>
            <div className="flex flex-col gap-3">
              {columnOrders.length === 0 ? (
                <p className="text-muted-foreground py-6 text-center text-xs">Aucune commande</p>
              ) : (
                columnOrders.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    role={role}
                    isPending={pendingOrderId === order.id}
                    onStatusChange={onStatusChange}
                    onOpenDiscussion={onOpenDiscussion}
                  />
                ))
              )}
            </div>
          </section>
        )
      })}
    </main>
  )
}
