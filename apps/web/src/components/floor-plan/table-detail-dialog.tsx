import {
  canSeeAllOrders,
  type CreateOrderRequest,
  type Order,
  type TableState,
  type TableStatus,
  type UserRole,
} from '@app/shared'
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
import { TableOccupancy } from './table-occupancy'

type TableDetailDialogProps = {
  // Table ouverte, null quand le dialog est fermé.
  tableNumber: number | null
  orders: Order[]
  // Occupation de la table ouverte (null hors plan ou pas encore chargée).
  occupancy: TableState | null
  role: UserRole
  pendingOrderId: string | null
  isTablePending: boolean
  onClose: () => void
  onStatusChange: (order: Order, status: Order['status']) => void
  onOpenDiscussion: (order: Order) => void
  onCreateOrder: (input: CreateOrderRequest) => Promise<unknown>
  onTableStatusChange: (table: TableState, status: TableStatus, guests?: number) => void
}

/**
 * Occupation et commandes en cours d'une table, ouvertes depuis le plan. Le
 * dialog relit `orders` et l'occupation à chaque rendu : il suit en direct les
 * changements faits ailleurs.
 * Les cartes et leurs actions sont celles du kanban (mêmes règles de rôle).
 */
export function TableDetailDialog({
  tableNumber,
  orders,
  occupancy,
  role,
  pendingOrderId,
  isTablePending,
  onClose,
  onStatusChange,
  onOpenDiscussion,
  onCreateOrder,
  onTableStatusChange,
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

        {occupancy && (
          <TableOccupancy
            key={occupancy.number}
            occupancy={occupancy}
            role={role}
            hasActiveOrders={tableOrders.length > 0}
            isPending={isTablePending}
            onChange={onTableStatusChange}
          />
        )}

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
