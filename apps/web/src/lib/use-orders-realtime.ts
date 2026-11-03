import {
  OrderSocketEvent,
  orderFromCreatedEvent,
  orderJournalEventSchema,
  ordersListSchema,
  type CreateOrderRequest,
  type Order,
  type OrderJournalEvent,
} from '@app/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { emitWithAck, type RealtimeSocket } from '@/lib/use-realtime-socket'

// Statuts terminaux : le tableau ne les affiche pas.
const HIDDEN_STATUSES: readonly Order['status'][] = ['SERVIE', 'ANNULEE']

function applyEvent(orders: Order[], entry: OrderJournalEvent): Order[] {
  if (entry.type === OrderSocketEvent.CREATED) {
    const order = orderFromCreatedEvent(entry.event)
    return orders.some((o) => o.id === order.id) ? orders : [...orders, order]
  }
  const { orderId, status, updatedAt } = entry.event
  return HIDDEN_STATUSES.includes(status)
    ? orders.filter((o) => o.id !== orderId)
    : orders.map((o) => (o.id === orderId ? { ...o, status, updatedAt } : o))
}

type OrdersRealtimeOptions = {
  // Appelé pour chaque événement reçu en direct, après son application. Pas
  // pour ceux rejoués lors d'un rattrapage : les animer n'aurait pas de sens.
  onLiveEvent?: (entry: OrderJournalEvent) => void
}

/**
 * Tableau de commandes temps réel via Socket.IO (cf. sujet, séance 3).
 * Première connexion : instantané (`order:sync`) et position dans le journal.
 * Reconnexion : rattrapage des événements manqués depuis le dernier reçu
 * (`order:events:since`), ou nouvel instantané s'ils sont trop nombreux.
 * Les événements reçus pendant ce rattrapage sont mis en attente puis appliqués
 * dans l'ordre du journal ; ceux déjà appliqués sont ignorés.
 */
export function useOrdersRealtime(socket: RealtimeSocket | null, options: OrdersRealtimeOptions = {}) {
  const [orders, setOrders] = useState<Order[]>([])
  const lastEventIdRef = useRef<number | null>(null)
  const catchingUpRef = useRef(false)
  const pendingRef = useRef<OrderJournalEvent[]>([])
  const onLiveEventRef = useRef(options.onLiveEvent)

  useEffect(() => {
    onLiveEventRef.current = options.onLiveEvent
  }, [options.onLiveEvent])

  const apply = useCallback((entry: OrderJournalEvent, live = false) => {
    const last = lastEventIdRef.current
    if (last !== null && entry.event.eventId <= last) return
    lastEventIdRef.current = entry.event.eventId
    setOrders((current) => applyEvent(current, entry))
    if (live) onLiveEventRef.current?.(entry)
  }, [])

  const resync = useCallback(async () => {
    const ack = await emitWithAck(socket, OrderSocketEvent.SYNC, {})
    setOrders(ordersListSchema.parse(ack.orders))
    lastEventIdRef.current = ack.lastEventId
  }, [socket])

  const catchUp = useCallback(async () => {
    const after = lastEventIdRef.current
    if (after !== null) {
      const ack = await emitWithAck(socket, OrderSocketEvent.EVENTS_SINCE, { after })
      if (ack.complete) {
        orderJournalEventSchema
          .array()
          .parse(ack.events)
          .forEach((entry) => apply(entry))
        return
      }
    }
    await resync()
  }, [socket, apply, resync])

  useEffect(() => {
    if (!socket) return

    const onConnect = async () => {
      catchingUpRef.current = true
      try {
        await catchUp()
      } catch {
        // Échec du rattrapage (coupure, délai) : il sera retenté à la reconnexion.
      } finally {
        catchingUpRef.current = false
        const pending = pendingRef.current.sort((a, b) => a.event.eventId - b.event.eventId)
        pendingRef.current = []
        pending.forEach((entry) => apply(entry))
      }
    }
    const onEvent = (type: OrderJournalEvent['type']) => (payload: unknown) => {
      const entry = orderJournalEventSchema.parse({ type, event: payload })
      if (catchingUpRef.current) pendingRef.current.push(entry)
      else apply(entry, true)
    }
    const onCreated = onEvent(OrderSocketEvent.CREATED)
    const onStatusUpdated = onEvent(OrderSocketEvent.STATUS_UPDATED)

    socket.on('connect', onConnect)
    socket.on(OrderSocketEvent.CREATED, onCreated)
    socket.on(OrderSocketEvent.STATUS_UPDATED, onStatusUpdated)
    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off(OrderSocketEvent.CREATED, onCreated)
      socket.off(OrderSocketEvent.STATUS_UPDATED, onStatusUpdated)
    }
  }, [socket, apply, catchUp])

  const createOrder = useCallback(
    async (input: CreateOrderRequest) => (await emitWithAck(socket, OrderSocketEvent.CREATE, input)).orderId,
    [socket],
  )

  const updateStatus = useCallback(
    async (order: Order, requestedStatus: Order['status']) =>
      (
        await emitWithAck(socket, OrderSocketEvent.STATUS_UPDATE, {
          orderId: order.id,
          expectedStatus: order.status,
          requestedStatus,
        })
      ).orderId,
    [socket],
  )

  return { orders, resync, createOrder, updateStatus }
}
