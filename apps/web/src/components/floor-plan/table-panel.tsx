import {
  availableOrderStatusTransitions,
  canRoleAccessChatChannel,
  canSeeAllOrders,
  canRoleSetTableStatus,
  orderChatChannel,
  TABLE_GUESTS_MAX,
  type CreateOrderRequest,
  type FloorTable,
  type Order,
  type TableState,
  type TableStatus,
  type UserRole,
} from '@app/shared'
import { ChevronLeftIcon, MessageSquareIcon, UsersIcon } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { STATUS_LABELS, TRANSITION_LABELS } from '@/lib/order-status'
import { useNow } from '@/lib/use-now'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CreateOrderDialog } from '@/components/create-order-dialog'
import { buildScene, type TableVisualState } from './floor-scene-model'
import { minutesSince, TABLE_STATE_STYLES } from './table-states'

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })
const DEFAULT_GUESTS = 2

// Libellé sous le temps écoulé, selon l'état affiché de la table.
const ELAPSED_LABELS: Partial<Record<TableVisualState, string>> = {
  'to-validate': 'à valider',
  validated: 'validée',
  cooking: 'en cuisine',
  ready: 'prête à servir',
  occupied: 'installés',
  'to-clear': 'à débarrasser',
}

export type TablePanelProps = {
  tableNumber: number
  layout: 'side' | 'sheet'
  floorTables: FloorTable[]
  orders: Order[]
  tableStates: Record<number, TableState>
  unread: Record<string, number>
  role: UserRole
  // Prénom d'une personne connue (soi-même ou connectée), sinon null.
  nameOf: (userId: string) => string | null
  pendingOrderId: string | null
  isTablePending: boolean
  onClose: () => void
  onStatusChange: (order: Order, status: Order['status']) => void
  onOpenDiscussion: (order: Order) => void
  onCreateOrder: (input: CreateOrderRequest) => Promise<unknown>
  onTableStatusChange: (table: TableState, status: TableStatus, guests?: number) => void
}

/**
 * Panneau d'une table ouvert depuis le plan (handoff § 6.3) : latéral à droite, ou
 * feuille en bas sous 768 px. Il relit commandes et occupation à chaque rendu et
 * suit donc les changements faits ailleurs ; les actions sont celles du kanban.
 */
export function TablePanel({
  tableNumber,
  layout,
  floorTables,
  orders,
  tableStates,
  unread,
  role,
  nameOf,
  pendingOrderId,
  isTablePending,
  onClose,
  onStatusChange,
  onOpenDiscussion,
  onCreateOrder,
  onTableStatusChange,
}: TablePanelProps) {
  const now = useNow(15_000)
  // Une table hors plan est traitée comme une table fictive : même calcul d'état que sur le plan.
  const view = useMemo(() => {
    const onPlan = floorTables.some((table) => table.number === tableNumber)
    const tables = onPlan ? floorTables : [{ number: tableNumber, x: 0, z: 0, shape: 'small' as const, seats: 2 }]
    return buildScene(tables, orders, unread, role, tableStates).tables.find((table) => table.number === tableNumber)
  }, [floorTables, orders, unread, role, tableStates, tableNumber])
  const backRef = useRef<HTMLButtonElement>(null)
  const [guests, setGuests] = useState(String(DEFAULT_GUESTS))

  // À l'ouverture, le focus va au panneau : Échap ou « Retour à la salle » le referment.
  useEffect(() => {
    backRef.current?.focus({ preventScroll: true })
  }, [])

  if (!view) return null
  const style = TABLE_STATE_STYLES[view.state]
  const tableOrders = [...view.orders].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  const occupancy = view.occupancy
  const covers = occupancy?.status === 'OCCUPEE' ? occupancy.guests : null
  const elapsedLabel = ELAPSED_LABELS[view.state]
  const canSetTable = canRoleSetTableStatus(role) && occupancy !== null
  const guestsNumber = Number(guests)
  const validGuests = Number.isInteger(guestsNumber) && guestsNumber >= 1 && guestsNumber <= TABLE_GUESTS_MAX
  const discussionOrder = [...tableOrders]
    .reverse()
    .find((order) => canRoleAccessChatChannel(role, orderChatChannel(order.id)))
  const titleId = `table-panel-${tableNumber}`

  const newOrder = (variant: 'default' | 'outline') => (
    <CreateOrderDialog
      key={tableNumber}
      onSubmit={onCreateOrder}
      defaultTableNumber={tableNumber}
      triggerLabel={`Nouvelle commande pour T${tableNumber}`}
      triggerVariant={variant}
      triggerClassName="h-12 w-full text-[15px]"
    />
  )

  return (
    <aside
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
      className={cn(
        'bg-background fixed z-40 flex flex-col',
        layout === 'side'
          ? 'top-0 right-0 h-dvh w-[440px] max-w-full shadow-[-16px_0_40px_-16px_rgba(0,0,0,0.35)] motion-safe:animate-in motion-safe:slide-in-from-right motion-safe:duration-300'
          : 'inset-x-0 bottom-0 h-[60dvh] rounded-t-[28px] shadow-[0_-16px_40px_-16px_rgba(0,0,0,0.35)] motion-safe:animate-in motion-safe:slide-in-from-bottom motion-safe:duration-300',
      )}
    >
      <div className="flex-1 overflow-y-auto px-5 pt-4 pb-6 sm:px-6">
        {layout === 'sheet' && <div aria-hidden="true" className="bg-border mx-auto mb-3 h-1.5 w-12 rounded-full" />}

        {/* 1. Retour et couverts */}
        <div className="flex items-center justify-between gap-3">
          <Button ref={backRef} variant="secondary" onClick={onClose}>
            <ChevronLeftIcon />
            Retour à la salle
          </Button>
          {covers !== null && (
            <span className="inline-flex items-center gap-1.5 text-[15px] font-semibold">
              <UsersIcon className="size-4" />
              {covers} couvert{covers > 1 ? 's' : ''}
            </span>
          )}
        </div>

        {/* 2. Numéro et temps écoulé */}
        <div className="mt-4 flex items-end justify-between gap-4">
          <h2 id={titleId} className="font-display text-brand-blue text-[104px] leading-[0.85]">
            <span className="sr-only">Table </span>T{tableNumber}
          </h2>
          {view.since && elapsedLabel && (
            <p className="text-right">
              <span className="block text-[34px] leading-none font-extrabold tabular-nums">
                {minutesSince(view.since, now)} min
              </span>
              <span className="text-muted-foreground text-[15px]">{elapsedLabel}</span>
            </p>
          )}
        </div>

        {/* 3. Pastille d'état : couleur d'état sur fond clair, texte foncé */}
        <p
          className="mt-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[15px] font-semibold text-neutral-900"
          style={{ backgroundColor: `${style.color}26` }}
        >
          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: style.color }} />
          {style.label}
        </p>

        {/* 4. Occupation */}
        {occupancy && occupancy.status !== 'LIBRE' && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[15px]">
            <p>
              {occupancy.status === 'OCCUPEE' ? 'Installés' : 'Clients partis'} à{' '}
              <time dateTime={occupancy.statusChangedAt.toISOString()} className="tabular-nums">
                {timeFormat.format(occupancy.statusChangedAt)}
              </time>
            </p>
            {occupancy.status === 'OCCUPEE' && canSetTable && (
              <Button
                size="sm"
                variant="ghost"
                disabled={isTablePending || tableOrders.length > 0}
                title={tableOrders.length > 0 ? 'Des commandes sont encore en cours sur cette table.' : undefined}
                onClick={() => onTableStatusChange(occupancy, 'A_DEBARRASSER')}
              >
                Clients partis
              </Button>
            )}
          </div>
        )}

        {/* 5. Commandes */}
        {tableOrders.length === 0 ? (
          <p className="text-muted-foreground mt-6 text-[15px]">
            {canSeeAllOrders(role) ? 'Aucune commande en cours.' : 'Aucune commande en cours de ta part.'}
          </p>
        ) : (
          <div className="mt-6 flex flex-col gap-4">
            {tableOrders.map((order) => {
              const transitions = availableOrderStatusTransitions(role, order.status)
              return (
                <section key={order.id} aria-label={`Commande de ${timeFormat.format(order.createdAt)}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <h3 className="text-[17px] font-extrabold">{STATUS_LABELS[order.status]}</h3>
                    <time
                      className="text-muted-foreground text-sm tabular-nums"
                      dateTime={order.createdAt.toISOString()}
                    >
                      {timeFormat.format(order.createdAt)}
                    </time>
                  </div>
                  <ul className="mt-2 flex flex-col gap-1.5 text-[15px]">
                    {order.items.map((item) => (
                      <li key={item.id}>
                        <span className="font-extrabold tabular-nums">{item.quantity}×</span> {item.meal}
                        {item.note && <span className="block text-sm font-semibold text-orange-800">{item.note}</span>}
                      </li>
                    ))}
                  </ul>
                  {order.comment && (
                    <p className="border-foreground mt-3 rounded-xl border-2 px-3 py-2 text-[15px]">
                      <span className="font-extrabold">Note : </span>
                      {order.comment}
                    </p>
                  )}
                  {(transitions.length > 0 || tableOrders.length > 1) && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {transitions.map((status) => (
                        <Button
                          key={status}
                          size="sm"
                          variant={status === 'ANNULEE' ? 'destructive' : 'default'}
                          disabled={pendingOrderId === order.id}
                          onClick={() => onStatusChange(order, status)}
                        >
                          {TRANSITION_LABELS[status]}
                        </Button>
                      ))}
                      {tableOrders.length > 1 && canRoleAccessChatChannel(role, orderChatChannel(order.id)) && (
                        <Button size="sm" variant="outline" onClick={() => onOpenDiscussion(order)}>
                          <MessageSquareIcon />
                          Discussion
                        </Button>
                      )}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        )}

        {/* 6. Historique : ce que l'API expose (prise, dernière étape) */}
        {tableOrders.length > 0 && (
          <section aria-labelledby={`${titleId}-history`} className="mt-6">
            <h3 id={`${titleId}-history`} className="text-[15px] font-extrabold">
              Historique
            </h3>
            <ol className="mt-2 flex flex-col gap-1.5 text-[15px]">
              {tableOrders.flatMap((order) => {
                const waiter = nameOf(order.waiterId)
                const steps = [
                  <li key={`${order.id}:created`} className="flex gap-3">
                    <time className="text-muted-foreground w-12 shrink-0 tabular-nums">
                      {timeFormat.format(order.createdAt)}
                    </time>
                    <span>Prise{waiter ? ` par ${waiter}` : ''}</span>
                  </li>,
                ]
                if (order.status !== 'A_VALIDER') {
                  steps.push(
                    <li key={`${order.id}:status`} className="flex gap-3">
                      <time className="text-muted-foreground w-12 shrink-0 tabular-nums">
                        {timeFormat.format(order.updatedAt)}
                      </time>
                      <span>{STATUS_LABELS[order.status]}</span>
                    </li>,
                  )
                }
                return steps
              })}
            </ol>
          </section>
        )}
      </div>

      {/* 7. Actions fixées en bas, selon l'état de la table */}
      <div className="flex flex-col gap-2 border-t px-5 py-4 sm:px-6">
        {canSetTable && occupancy.status === 'LIBRE' ? (
          <>
            <div className="flex items-center gap-2">
              <label htmlFor={`${titleId}-guests`} className="text-[15px] font-semibold">
                Couverts
              </label>
              <Input
                id={`${titleId}-guests`}
                type="number"
                min={1}
                max={TABLE_GUESTS_MAX}
                value={guests}
                onChange={(event) => setGuests(event.target.value)}
                className="h-12 w-20"
              />
              <Button
                className="h-12 flex-1"
                disabled={isTablePending || !validGuests}
                onClick={() => onTableStatusChange(occupancy, 'OCCUPEE', guestsNumber)}
              >
                Installer les clients
              </Button>
            </div>
            {newOrder('outline')}
          </>
        ) : canSetTable && occupancy.status === 'A_DEBARRASSER' ? (
          <>
            <Button
              className="h-12 w-full"
              disabled={isTablePending}
              onClick={() => onTableStatusChange(occupancy, 'LIBRE')}
            >
              Table débarrassée
            </Button>
            {newOrder('outline')}
          </>
        ) : (
          <>
            {newOrder('default')}
            {discussionOrder && (
              <Button variant="outline" className="h-12 w-full" onClick={() => onOpenDiscussion(discussionOrder)}>
                <MessageSquareIcon />
                Ouvrir la discussion
              </Button>
            )}
          </>
        )}
      </div>
    </aside>
  )
}
