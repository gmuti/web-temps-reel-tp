import { canSeeAllOrders, OrderStatusErrorCode, type Order, type User } from '@app/shared'
import { useState } from 'react'
import { toast } from 'sonner'
import { useAuth } from '@/lib/auth-context'
import { useChat } from '@/lib/use-chat'
import { useOrdersRealtime } from '@/lib/use-orders-realtime'
import { AckError, useRealtimeSocket, type ConnectionState } from '@/lib/use-realtime-socket'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { ChatPanel } from '@/components/chat-panel'
import { CreateOrderDialog } from '@/components/create-order-dialog'
import { OrderCard } from '@/components/order-card'

const CONNECTION_BADGES: Record<ConnectionState, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> =
  {
    connecting: { label: 'Connexion…', variant: 'outline' },
    connected: { label: 'Connecté', variant: 'secondary' },
    reconnecting: { label: 'Reconnexion…', variant: 'destructive' },
    offline: { label: 'Déconnecté', variant: 'destructive' },
  }

const STATUS_LABELS: Record<Order['status'], string> = {
  A_VALIDER: 'À valider',
  VALIDEE: 'Validée',
  EN_PREPARATION: 'En préparation',
  PRETE: 'Prête',
  SERVIE: 'Servie',
  ANNULEE: 'Annulée',
}

// Colonnes du kanban : les statuts en cours (servies et annulées quittent le tableau).
const KANBAN_COLUMNS: readonly Order['status'][] = ['A_VALIDER', 'VALIDEE', 'EN_PREPARATION', 'PRETE']

export function OrderBoard({ user }: { user: User }) {
  const { accessToken, logout } = useAuth()
  const { socket, connection } = useRealtimeSocket(accessToken, logout)
  const { orders, resync, createOrder, updateStatus } = useOrdersRealtime(socket)
  const chat = useChat(socket, user.role)
  const [pendingOrderId, setPendingOrderId] = useState<string | null>(null)
  const badge = CONNECTION_BADGES[connection]

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
                        role={user.role}
                        isPending={pendingOrderId === order.id}
                        onStatusChange={handleStatusChange}
                        onOpenDiscussion={handleOpenDiscussion}
                      />
                    ))
                  )}
                </div>
              </section>
            )
          })}
        </main>

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
    </div>
  )
}
