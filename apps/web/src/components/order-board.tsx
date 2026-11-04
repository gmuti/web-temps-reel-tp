import {
  canSeeAllOrders,
  OrderStatusErrorCode,
  type Order,
  type OrderJournalEvent,
  type TableState,
  type TableStatus,
  type TableStatusUpdatedEvent,
  type User,
} from '@app/shared'
import { lazy, Suspense, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { createEventChannel } from '@/lib/event-channel'
import { useChat } from '@/lib/use-chat'
import { useFloorPlan } from '@/lib/use-floor-plan'
import { ORDER_CONFLICT_MESSAGE, orderStatusToast, TABLE_CONFLICT_MESSAGE, tableStatusToast } from '@/lib/order-status'
import { useOrdersRealtime } from '@/lib/use-orders-realtime'
import { AckError, useRealtimeSocket } from '@/lib/use-realtime-socket'
import { useTablesRealtime } from '@/lib/use-tables-realtime'
import { isWebGLAvailable } from '@/lib/webgl'
import { AppHeader, type BoardView } from '@/components/app-header'
import { ChatPanel } from '@/components/chat-panel'
import { CreateOrderDialog } from '@/components/create-order-dialog'
import { OrderKanban } from '@/components/order-kanban'
import { TableDetailDialog } from '@/components/floor-plan/table-detail-dialog'
import { ViewErrorBoundary } from '@/components/view-error-boundary'

// Plan 3D chargé à la demande : three ne pèse rien tant que la vue n'est pas ouverte.
const loadFloorPlan = () => import('@/components/floor-plan/floor-plan-3d')
const FloorPlan3D = lazy(loadFloorPlan)

const VIEW_STORAGE_KEY = 'orderBoard.view'

function readStoredView(): BoardView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'plan' ? 'plan' : 'kanban'
  } catch {
    return 'kanban'
  }
}

export function OrderBoard({ user }: { user: User }) {
  const { accessToken, logout } = useAuth()
  const { socket, connection } = useRealtimeSocket(accessToken, logout)
  // Événements reçus en direct, relayés au plan de salle pour ses animations.
  const [liveOrderEvents] = useState(() => createEventChannel<OrderJournalEvent>())
  const { orders, resync, createOrder, updateStatus } = useOrdersRealtime(socket, {
    onLiveEvent: liveOrderEvents.emit,
  })
  const [liveTableEvents] = useState(() => createEventChannel<TableStatusUpdatedEvent>())
  const {
    tables: tableStates,
    resync: resyncTables,
    updateTableStatus,
  } = useTablesRealtime(socket, { onLiveEvent: liveTableEvents.emit })
  // Plan de salle ; s'il change (éditeur), l'occupation des nouvelles tables est rechargée.
  const floor = useFloorPlan(socket, { onUpdated: () => void resyncTables().catch(() => undefined) })
  const chat = useChat(socket, user.role)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const [pendingTableNumber, setPendingTableNumber] = useState<number | null>(null)
  // Sans WebGL, seul le kanban est proposé.
  const [canShowPlan] = useState(isWebGLAvailable)
  const [view, setView] = useState<BoardView>(() => (canShowPlan ? readStoredView() : 'kanban'))
  const [selectedTable, setSelectedTable] = useState<number | null>(null)

  const changeView = (next: BoardView) => {
    setView(next)
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, next)
    } catch {
      // Stockage indisponible (navigation privée) : le choix n'est simplement pas mémorisé.
    }
  }

  // Le plan ne peut plus s'afficher (module non chargé, contexte WebGL perdu) :
  // retour au kanban, qui offre les mêmes actions.
  const fallBackToKanban = useCallback(() => {
    setView('kanban')
    setSelectedTable(null)
    toast.error('Le plan de salle ne peut pas s’afficher. Retour au tableau.')
  }, [])

  // Le client demande une transition et attend l'accusé de réception ; la carte
  // ne change qu'à réception de l'événement `order:status-updated` publié par le
  // serveur (le serveur reste l'autorité sur l'état).
  const handleStatusChange = async (order: Order, requestedStatus: Order['status']) => {
    setPendingOrderId(order.id)
    try {
      await updateStatus(order, requestedStatus)
      toast.success(orderStatusToast(order.tableNumber, requestedStatus))
    } catch (err) {
      if (err instanceof AckError && err.errorCode === OrderStatusErrorCode.STATUS_CONFLICT) {
        toast.warning(ORDER_CONFLICT_MESSAGE)
        await resync()
      } else {
        toast.error(err instanceof Error ? err.message : 'Impossible de modifier la commande.')
      }
    } finally {
      setPendingOrderId(null)
    }
  }

  // Même principe que pour les commandes : l'état ne change qu'à réception de
  // l'événement `table:status-updated` ; un conflit recharge l'occupation.
  const handleTableStatusChange = async (table: TableState, requestedStatus: TableStatus, guests?: number) => {
    setPendingTableNumber(table.number)
    try {
      await updateTableStatus(table, requestedStatus, guests)
      toast.success(tableStatusToast(table.number, requestedStatus))
    } catch (err) {
      if (err instanceof AckError && err.errorCode === OrderStatusErrorCode.STATUS_CONFLICT) {
        toast.warning(TABLE_CONFLICT_MESSAGE)
        await resyncTables()
      } else {
        toast.error(err instanceof Error ? err.message : 'Impossible de modifier la table.')
      }
    } finally {
      setPendingTableNumber(null)
    }
  }

  const handleOpenDiscussion = async (order: Order) => {
    try {
      await chat.openOrderChannel(order)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible d’ouvrir la discussion.')
    }
  }

  // Depuis le plan, la discussion s'ouvre dans le chat : on ferme le détail de la table.
  const handleOpenDiscussionFromTable = (order: Order) => {
    setSelectedTable(null)
    void handleOpenDiscussion(order)
  }

  return (
    <div className="flex min-h-svh flex-col">
      <AppHeader
        user={user}
        connection={connection}
        view={view}
        canShowPlan={canShowPlan}
        onChangeView={changeView}
        onPreloadPlan={() => void loadFloorPlan()}
        onLogout={logout}
      />

      {(connection === 'reconnecting' || connection === 'offline') && (
        <div
          role="status"
          className="bg-destructive/10 text-destructive border-b px-4 py-3 text-center text-[15px] font-semibold sm:px-6"
        >
          {connection === 'reconnecting'
            ? 'Connexion perdue. On se reconnecte… Ne ferme pas l’onglet.'
            : 'Connexion interrompue par le serveur. Recharge la page pour reprendre le service.'}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[24px] leading-tight font-extrabold sm:text-[34px]">
              {canSeeAllOrders(user.role) ? 'Tableau de commandes' : 'Mes commandes'}
            </h1>
            <p className="text-muted-foreground text-sm">Mises à jour en temps réel (Socket.IO)</p>
          </div>
          <CreateOrderDialog onSubmit={createOrder} />
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_22rem]">
          {view === 'plan' ? (
            <main className="min-w-0">
              <ViewErrorBoundary onError={fallBackToKanban}>
                <Suspense
                  fallback={
                    <div className="bg-muted/50 text-muted-foreground flex h-[min(72svh,720px)] min-h-[420px] items-center justify-center rounded-lg text-sm">
                      Chargement du plan…
                    </div>
                  }
                >
                  <FloorPlan3D
                    floorPlan={floor.plan}
                    floorPlanError={floor.error}
                    onReloadFloorPlan={floor.reload}
                    orders={orders}
                    tableStates={tableStates}
                    unread={chat.unread}
                    online={chat.online}
                    role={user.role}
                    connection={connection}
                    interactive={selectedTable === null}
                    onSelectTable={setSelectedTable}
                    onContextLost={fallBackToKanban}
                    subscribeToOrderEvents={liveOrderEvents.subscribe}
                    subscribeToTableEvents={liveTableEvents.subscribe}
                  />
                </Suspense>
              </ViewErrorBoundary>
            </main>
          ) : (
            <OrderKanban
              orders={orders}
              role={user.role}
              pendingOrderId={pendingOrderId}
              onStatusChange={handleStatusChange}
              onOpenDiscussion={handleOpenDiscussion}
              isConnected={connection === 'connected'}
            />
          )}

          <ChatPanel
            currentUserId={user.id}
            isConnected={connection === 'connected'}
            channels={chat.channels}
            activeChannelId={chat.activeChannelId}
            messages={chat.messages}
            unread={chat.unread}
            online={chat.online}
            onSelectChannel={chat.selectChannel}
            onCloseChannel={chat.closeChannel}
            onSend={chat.sendMessage}
          />
        </div>

        <TableDetailDialog
          tableNumber={selectedTable}
          orders={orders}
          occupancy={selectedTable !== null ? (tableStates[selectedTable] ?? null) : null}
          role={user.role}
          pendingOrderId={pendingOrderId}
          isTablePending={pendingTableNumber === selectedTable}
          onClose={() => setSelectedTable(null)}
          onStatusChange={handleStatusChange}
          onOpenDiscussion={handleOpenDiscussionFromTable}
          onCreateOrder={createOrder}
          onTableStatusChange={handleTableStatusChange}
        />
      </div>
    </div>
  )
}
