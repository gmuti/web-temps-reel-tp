import { canSeeAllOrders, OrderStatusErrorCode, type Order, type User } from '@app/shared'
import { BoxIcon, KanbanIcon } from 'lucide-react'
import { lazy, Suspense, useCallback, useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/use-chat'
import { STATUS_LABELS } from '@/lib/order-status'
import { useOrdersRealtime } from '@/lib/use-orders-realtime'
import { AckError, useRealtimeSocket, type ConnectionState } from '@/lib/use-realtime-socket'
import { isWebGLAvailable } from '@/lib/webgl'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChatPanel } from '@/components/chat-panel'
import { CreateOrderDialog } from '@/components/create-order-dialog'
import { OrderKanban } from '@/components/order-kanban'
import { TableDetailDialog } from '@/components/floor-plan/table-detail-dialog'
import { ViewErrorBoundary } from '@/components/view-error-boundary'

// Plan 3D chargé à la demande : three ne pèse rien tant que la vue n'est pas ouverte.
const loadFloorPlan = () => import('@/components/floor-plan/floor-plan-3d')
const FloorPlan3D = lazy(loadFloorPlan)

type BoardView = 'kanban' | 'plan'

const VIEW_STORAGE_KEY = 'orderBoard.view'

function readStoredView(): BoardView {
  try {
    return localStorage.getItem(VIEW_STORAGE_KEY) === 'plan' ? 'plan' : 'kanban'
  } catch {
    return 'kanban'
  }
}

const CONNECTION_BADGES: Record<ConnectionState, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> =
  {
    connecting: { label: 'Connexion…', variant: 'outline' },
    connected: { label: 'Connecté', variant: 'secondary' },
    reconnecting: { label: 'Reconnexion…', variant: 'destructive' },
    offline: { label: 'Déconnecté', variant: 'destructive' },
  }

export function OrderBoard({ user }: { user: User }) {
  const { accessToken, logout } = useAuth()
  const { socket, connection } = useRealtimeSocket(accessToken, logout)
  const { orders, resync, createOrder, updateStatus } = useOrdersRealtime(socket)
  const chat = useChat(socket, user.role)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const badge = CONNECTION_BADGES[connection]
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
      toast.success(`Table ${order.tableNumber} : ${STATUS_LABELS[requestedStatus]}`)
    } catch (err) {
      if (err instanceof AckError && err.errorCode === OrderStatusErrorCode.STATUS_CONFLICT) {
        toast.warning(`Table ${order.tableNumber} : ${err.message} Tableau actualisé.`)
        await resync()
      } else {
        toast.error(err instanceof Error ? err.message : 'Impossible de modifier la commande.')
      }
    } finally {
      setPendingOrderId(null)
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
    <div className="mx-auto flex min-h-svh max-w-screen-2xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">
            {canSeeAllOrders(user.role) ? 'Tableau de commandes' : 'Mes commandes'}
          </h1>
          <p className="text-muted-foreground text-sm">Mises à jour en temps réel (Socket.IO)</p>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-3">
          {canShowPlan && (
            <div role="group" aria-label="Affichage" className="bg-muted flex rounded-lg p-0.5">
              <Button
                size="sm"
                variant={view === 'kanban' ? 'outline' : 'ghost'}
                aria-pressed={view === 'kanban'}
                onClick={() => changeView('kanban')}
              >
                <KanbanIcon />
                Tableau
              </Button>
              <Button
                size="sm"
                variant={view === 'plan' ? 'outline' : 'ghost'}
                aria-pressed={view === 'plan'}
                onClick={() => changeView('plan')}
                // Précharge le module 3D dès que l'intention se précise.
                onPointerEnter={() => void loadFloorPlan()}
                onFocus={() => void loadFloorPlan()}
              >
                <BoxIcon />
                Plan
              </Button>
            </div>
          )}
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <CreateOrderDialog onSubmit={createOrder} />
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground text-sm">
              {user.name} · {user.role}
            </span>
            <Button variant="outline" size="sm" onClick={logout}>
              Se déconnecter
            </Button>
          </div>
        </div>
      </header>

      <Separator />

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
                  orders={orders}
                  unread={chat.unread}
                  role={user.role}
                  connection={connection}
                  interactive={selectedTable === null}
                  onSelectTable={setSelectedTable}
                  onContextLost={fallBackToKanban}
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
        role={user.role}
        pendingOrderId={pendingOrderId}
        onClose={() => setSelectedTable(null)}
        onStatusChange={handleStatusChange}
        onOpenDiscussion={handleOpenDiscussionFromTable}
        onCreateOrder={createOrder}
      />
    </div>
  )
}
