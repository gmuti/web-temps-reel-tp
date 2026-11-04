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
import { MessageSquareIcon, XIcon } from 'lucide-react'
import { lazy, Suspense, useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { createEventChannel } from '@/lib/event-channel'
import { useChat } from '@/lib/use-chat'
import { useFloorPlan } from '@/lib/use-floor-plan'
import { ORDER_CONFLICT_MESSAGE, orderStatusToast, TABLE_CONFLICT_MESSAGE, tableStatusToast } from '@/lib/order-status'
import { useOrdersRealtime } from '@/lib/use-orders-realtime'
import { AckError, useRealtimeSocket } from '@/lib/use-realtime-socket'
import { useMediaQuery } from '@/lib/use-media-query'
import { useTablesRealtime } from '@/lib/use-tables-realtime'
import { isWebGLAvailable } from '@/lib/webgl'
import { AppHeader, type BoardView } from '@/components/app-header'
import { ChatPanel } from '@/components/chat-panel'
import { CreateOrderDialog } from '@/components/create-order-dialog'
import { OrderKanban } from '@/components/order-kanban'
import { TablePanel } from '@/components/floor-plan/table-panel'
import { SIDE_PANEL_WIDTH } from '@/components/floor-plan/panel-layout'
import { Button } from '@/components/ui/button'
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
  // En mode Plan, le chat est un panneau rétractable, fermé par défaut pour laisser la scène entière.
  const [chatOpen, setChatOpen] = useState(false)
  // Sous 768 px, le panneau de table devient une feuille qui monte du bas.
  const isNarrow = useMediaQuery('(max-width: 767px)')
  const panelLayout = isNarrow ? 'sheet' : 'side'
  const unreadTotal = Object.values(chat.unread).reduce((sum, count) => sum + count, 0)

  const selectTable = (tableNumber: number) => {
    setChatOpen(false)
    setSelectedTable(tableNumber)
  }
  const closeTable = useCallback(() => setSelectedTable(null), [])

  // Échap ferme le panneau de table, sauf si un dialog (nouvelle commande) est ouvert par-dessus.
  useEffect(() => {
    if (selectedTable === null) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || document.querySelector('[role="dialog"][aria-modal="true"]')) return
      setSelectedTable(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [selectedTable])

  // Prénom affiché dans l'historique : soi-même ou une personne connectée.
  const nameOf = (userId: string) => {
    if (userId === user.id) return 'toi'
    const member = chat.online.find((person) => person.id === userId)
    return member ? (member.name.split(' ')[0] ?? member.name) : null
  }

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
      setChatOpen(true)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Impossible d’ouvrir la discussion.')
    }
  }

  // Depuis le plan, la discussion s'ouvre dans le chat : on ferme le détail de la table.
  const handleOpenDiscussionFromTable = (order: Order) => {
    setSelectedTable(null)
    void handleOpenDiscussion(order)
  }

  const connectionBanner =
    connection === 'reconnecting'
      ? 'Connexion perdue. On se reconnecte… Ne ferme pas l’onglet.'
      : connection === 'offline'
        ? 'Connexion interrompue par le serveur. Recharge la page pour reprendre le service.'
        : null
  const pageTitle = canSeeAllOrders(user.role) ? 'Tableau de commandes' : 'Mes commandes'

  const chatPanel = (
    <ChatPanel
      className={view === 'plan' ? 'h-full lg:static lg:h-full' : undefined}
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
  )

  const header = (
    <AppHeader
      user={user}
      connection={connection}
      view={view}
      canShowPlan={canShowPlan}
      floating={view === 'plan'}
      rightInset={view === 'plan' && selectedTable !== null && panelLayout === 'side' ? SIDE_PANEL_WIDTH : 0}
      onChangeView={changeView}
      onPreloadPlan={() => void loadFloorPlan()}
      onLogout={logout}
    />
  )

  // Mode Plan (handoff § 6.3) : la scène occupe toute la fenêtre, tout le reste flotte au-dessus.
  if (view === 'plan') {
    return (
      <div className="fixed inset-0 overflow-hidden">
        <h1 className="sr-only">{pageTitle} : plan de salle</h1>
        <main className="absolute inset-0">
          <ViewErrorBoundary onError={fallBackToKanban}>
            <Suspense
              fallback={
                <div className="bg-muted text-muted-foreground absolute inset-0 flex items-center justify-center text-[15px]">
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
                selectedTable={selectedTable}
                panel={selectedTable !== null ? panelLayout : null}
                onSelectTable={selectTable}
                onDeselect={closeTable}
                onContextLost={fallBackToKanban}
                subscribeToOrderEvents={liveOrderEvents.subscribe}
                subscribeToTableEvents={liveTableEvents.subscribe}
              />
            </Suspense>
          </ViewErrorBoundary>
        </main>

        {header}

        {connectionBanner && (
          <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-3">
            <p
              role="status"
              className="bg-background text-destructive rounded-full px-4 py-2 text-center text-[15px] font-semibold shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]"
            >
              {connectionBanner}
            </p>
          </div>
        )}

        <div className="absolute right-3 bottom-4 z-10 flex flex-col items-end gap-2 sm:right-4">
          <Button
            variant="ghost"
            className="bg-background shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]"
            aria-expanded={chatOpen}
            aria-controls="plan-chat"
            onClick={() => setChatOpen((open) => !open)}
          >
            <MessageSquareIcon />
            <span className="max-sm:sr-only">Chat d’équipe</span>
            {unreadTotal > 0 && (
              <span className="bg-destructive rounded-full px-1.5 text-xs text-white tabular-nums">
                {unreadTotal}
                <span className="sr-only"> non lus</span>
              </span>
            )}
          </Button>
          <CreateOrderDialog onSubmit={createOrder} triggerClassName="shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]" />
        </div>

        {chatOpen && (
          <div
            id="plan-chat"
            className="absolute top-20 right-3 bottom-4 z-20 w-[min(380px,calc(100%-1.5rem))] sm:right-4"
          >
            {chatPanel}
            <Button
              variant="ghost"
              size="icon-sm"
              className="absolute top-3 right-3"
              aria-label="Fermer le chat"
              onClick={() => setChatOpen(false)}
            >
              <XIcon />
            </Button>
          </div>
        )}

        {selectedTable !== null && (
          <TablePanel
            tableNumber={selectedTable}
            layout={panelLayout}
            floorTables={floor.plan?.tables ?? []}
            orders={orders}
            tableStates={tableStates}
            unread={chat.unread}
            role={user.role}
            nameOf={nameOf}
            pendingOrderId={pendingOrderId}
            isTablePending={pendingTableNumber === selectedTable}
            onClose={closeTable}
            onStatusChange={handleStatusChange}
            onOpenDiscussion={handleOpenDiscussionFromTable}
            onCreateOrder={createOrder}
            onTableStatusChange={handleTableStatusChange}
          />
        )}
      </div>
    )
  }

  return (
    <div className="flex min-h-svh flex-col">
      {header}

      {connectionBanner && (
        <div
          role="status"
          className="bg-destructive/10 text-destructive border-b px-4 py-3 text-center text-[15px] font-semibold sm:px-6"
        >
          {connectionBanner}
        </div>
      )}

      <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[24px] leading-tight font-extrabold sm:text-[34px]">{pageTitle}</h1>
            <p className="text-muted-foreground text-sm">Mises à jour en temps réel (Socket.IO)</p>
          </div>
          <CreateOrderDialog onSubmit={createOrder} />
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-[1fr_22rem]">
          <OrderKanban
            orders={orders}
            role={user.role}
            pendingOrderId={pendingOrderId}
            onStatusChange={handleStatusChange}
            onOpenDiscussion={handleOpenDiscussion}
            isConnected={connection === 'connected'}
          />
          {chatPanel}
        </div>
      </div>
    </div>
  )
}
