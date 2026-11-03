import {
  availableOrderStatusTransitions,
  canRoleAccessChatChannel,
  orderChatChannel,
  orderTotal,
  type Order,
  type UserRole,
} from '@app/shared'
import { MessageSquareIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { DishCarousel } from '@/components/dish-carousel'

// Libellé du bouton qui demande la transition vers chaque statut.
const TRANSITION_LABELS: Record<Order['status'], string> = {
  A_VALIDER: '',
  VALIDEE: 'Valider',
  EN_PREPARATION: 'Prendre en charge',
  PRETE: 'Marquer prête',
  SERVIE: 'Marquer servie',
  ANNULEE: 'Annuler',
}

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

type OrderCardProps = {
  order: Order
  role: UserRole
  isPending: boolean
  onStatusChange: (order: Order, status: Order['status']) => void
  onOpenDiscussion: (order: Order) => void
}

export function OrderCard({ order, role, isPending, onStatusChange, onOpenDiscussion }: OrderCardProps) {
  const transitions = availableOrderStatusTransitions(role, order.status)

  return (
    <Card className="gap-3 py-4">
      <CardHeader className="px-4">
        <div className="flex items-center justify-between">
          <CardTitle>Table {order.tableNumber}</CardTitle>
          <time className="text-muted-foreground text-xs" dateTime={order.createdAt.toISOString()}>
            {timeFormat.format(order.createdAt)}
          </time>
        </div>
        {order.comment && <CardDescription>{order.comment}</CardDescription>}
      </CardHeader>
      <CardContent className="flex flex-col gap-2 px-4 text-sm">
        <DishCarousel items={order.items} />
        {order.items.map((item) => (
          <div key={item.id} className="flex flex-col gap-1">
            <div className="flex items-center justify-between gap-2">
              <span>
                {item.quantity}× {item.meal}
              </span>
              <span className="text-muted-foreground shrink-0">{(item.price * item.quantity).toFixed(2)} €</span>
            </div>
            {item.note && (
              <Badge variant="outline" className="max-w-full self-start truncate">
                {item.note}
              </Badge>
            )}
          </div>
        ))}
        <Separator className="my-1" />
        <div className="flex items-center justify-between font-medium">
          <span>Total</span>
          <span>{orderTotal(order).toFixed(2)} €</span>
        </div>
      </CardContent>
      <CardFooter className="flex flex-wrap gap-2 px-4">
        {transitions.map((status) => (
          <Button
            key={status}
            size="sm"
            variant={status === 'ANNULEE' ? 'destructive' : 'default'}
            disabled={isPending}
            onClick={() => onStatusChange(order, status)}
          >
            {TRANSITION_LABELS[status]}
          </Button>
        ))}
        {canRoleAccessChatChannel(role, orderChatChannel(order.id)) && (
          <Button size="sm" variant="outline" onClick={() => onOpenDiscussion(order)}>
            <MessageSquareIcon />
            Discussion
          </Button>
        )}
      </CardFooter>
    </Card>
  )
}
