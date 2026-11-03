import { orderTotal, type Order } from '@app/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getOrders } from '@/lib/api'
import { useAuth } from '@/lib/auth-context'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { CreateOrderDialog } from '@/components/create-order-dialog'

const POLL_INTERVAL_MS = 4000

const STATUS_LABELS: Record<Order['status'], string> = {
  A_VALIDER: 'À valider',
  VALIDEE: 'Validée',
  EN_PREPARATION: 'En préparation',
  PRETE: 'Prête',
  SERVIE: 'Servie',
  ANNULEE: 'Annulée',
}

const STATUS_VARIANTS: Record<Order['status'], 'default' | 'secondary' | 'destructive' | 'outline'> = {
  A_VALIDER: 'outline',
  VALIDEE: 'secondary',
  EN_PREPARATION: 'default',
  PRETE: 'default',
  SERVIE: 'secondary',
  ANNULEE: 'destructive',
}

export function OrderBoard() {
  const { user, logout } = useAuth()
  const [orders, setOrders] = useState<Order[]>([])
  const [error, setError] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(true)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)

  const refresh = useCallback(async () => {
    try {
      const data = await getOrders()
      setOrders(data)
      setIsConnected(true)
      setError(null)
    } catch (err) {
      setIsConnected(false)
      setError(err instanceof ApiError ? err.message : 'Connexion au serveur perdue.')
    }
  }, [])

  useEffect(() => {
    refresh()
    pollTimer.current = setInterval(refresh, POLL_INTERVAL_MS)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [refresh])

  const handleCreated = (order: Order) => {
    setOrders((current) => [...current, order])
  }

  return (
    <div className="mx-auto flex min-h-svh max-w-5xl flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Tableau de commandes</h1>
          <p className="text-muted-foreground text-sm">
            Rafraîchissement automatique toutes les {POLL_INTERVAL_MS / 1000}s
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant={isConnected ? 'secondary' : 'destructive'}>
            {isConnected ? 'Connecté' : 'Déconnecté'}
          </Badge>
          <CreateOrderDialog onCreated={handleCreated} />
          <div className="flex items-center gap-2">
            {user && (
              <span className="text-muted-foreground text-sm">
                {user.name} · {user.role}
              </span>
            )}
            <Button variant="outline" size="sm" onClick={logout}>
              Se déconnecter
            </Button>
          </div>
        </div>
      </header>

      <Separator />

      {error && <p className="text-destructive text-sm">{error}</p>}

      {orders.length === 0 ? (
        <p className="text-muted-foreground text-sm">Aucune commande en cours.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {orders.map((order) => (
            <Card key={order.id}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Table {order.tableNumber}</CardTitle>
                  <Badge variant={STATUS_VARIANTS[order.status]}>{STATUS_LABELS[order.status]}</Badge>
                </div>
                {order.comment && <CardDescription>{order.comment}</CardDescription>}
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm">
                {order.items.map((item) => (
                  <div key={item.id} className="flex items-center justify-between">
                    <span>
                      {item.quantity}× {item.meal}
                    </span>
                    <span className="text-muted-foreground">{(item.price * item.quantity).toFixed(2)} €</span>
                  </div>
                ))}
                <Separator className="my-2" />
                <div className="flex items-center justify-between font-medium">
                  <span>Total</span>
                  <span>{orderTotal(order).toFixed(2)} €</span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
