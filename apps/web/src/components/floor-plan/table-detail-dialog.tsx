import { canSeeAllOrders, type CreateOrderRequest, type Order, type UserRole } from '@app/shared'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { CreateOrderDialog } from '@/components/create-order-dialog'
import { OrderCard } from '@/components/order-card'

type TableDetailDialogProps = {
  // Table ouverte, null quand le dialog est fermé.
  tableNumber: number | null
  orders: Order[]
  role: UserRole
  pendingOrderId: string | null
  onClose: () => void
  onStatusChange: (order: Order, status: Order['status']) => void
  onOpenDiscussion: (order: Order) => void
  onCreateOrder: (input: CreateOrderRequest) => Promise<unknown>
}

/**
 * Commandes en cours d'une table, ouvertes depuis le plan. Le dialog relit
 * `orders` à chaque rendu : il suit en direct les changements faits ailleurs.
 * Les cartes et leurs actions sont celles du kanban (mêmes règles de rôle).
 */
export function TableDetailDialog({
  tableNumber,
  orders,
  role,
  pendingOrderId,
  onClose,
  onStatusChange,
  onOpenDiscussion,
  onCreateOrder,
}: TableDetailDialogProps) {
  const tableOrders = orders
    .filter((order) => order.tableNumber === tableNumber)
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())

  return (
    <Dialog open={tableNumber !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Table {tableNumber}</DialogTitle>
          <DialogDescription>
            {tableOrders.length === 0
              ? canSeeAllOrders(role)
                ? 'Aucune commande en cours.'
                : 'Aucune commande en cours de votre part.'
              : `${tableOrders.length} commande${tableOrders.length > 1 ? 's' : ''} en cours`}
          </DialogDescription>
        </DialogHeader>

        {tableOrders.length > 0 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {tableOrders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                role={role}
                isPending={pendingOrderId === order.id}
                onStatusChange={onStatusChange}
                onOpenDiscussion={onOpenDiscussion}
              />
            ))}
          </div>
        )}

        {tableNumber !== null && (
          <DialogFooter>
            <CreateOrderDialog
              key={tableNumber}
              onSubmit={onCreateOrder}
              defaultTableNumber={tableNumber}
              triggerLabel="Nouvelle commande pour cette table"
            />
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
