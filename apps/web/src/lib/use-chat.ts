import {
  canRoleAccessChatChannel,
  ChatSocketEvent,
  chatMessageCreatedEventSchema,
  FIXED_CHAT_CHANNELS,
  orderChatChannel,
  presenceUpdatedEventSchema,
  type ChatAuthor,
  type ChatChannelId,
  type ChatMessageCreatedEvent,
  type Order,
  type UserRole,
} from '@app/shared'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { emitWithAck, type RealtimeSocket } from '@/lib/use-realtime-socket'

export type ChatChannel = { id: ChatChannelId; label: string; closable: boolean }

const FIXED_CHANNEL_LABELS: Record<(typeof FIXED_CHAT_CHANNELS)[number], string> = {
  general: 'Général',
  kitchen: 'Cuisine',
  service: 'Salle',
}

/**
 * Chat d'équipe via la connexion Socket.IO partagée. Les canaux fixes autorisés
 * par le rôle sont toujours affichés ; une discussion de commande s'ouvre à la
 * demande. À chaque (re)connexion, l'historique de chaque canal ouvert est
 * rechargé (et les salles des discussions de commande sont rejointes à nouveau).
 */
export function useChat(socket: RealtimeSocket | null, role: UserRole) {
  const fixedChannels = useMemo<ChatChannel[]>(
    () =>
      FIXED_CHAT_CHANNELS.filter((id) => canRoleAccessChatChannel(role, id)).map((id) => ({
        id,
        label: FIXED_CHANNEL_LABELS[id],
        closable: false,
      })),
    [role],
  )
  const [orderChannels, setOrderChannels] = useState<ChatChannel[]>([])
  const [activeChannelId, setActiveChannelId] = useState<ChatChannelId>('general')
  const [messages, setMessages] = useState<Record<string, ChatMessageCreatedEvent[]>>({})
  const [unread, setUnread] = useState<Record<string, number>>({})
  const [online, setOnline] = useState<ChatAuthor[]>([])

  const channels = useMemo(() => [...fixedChannels, ...orderChannels], [fixedChannels, orderChannels])

  // Refs lues par les écouteurs Socket.IO, qui ne sont pas réabonnés à chaque rendu.
  const channelsRef = useRef(channels)
  const activeRef = useRef(activeChannelId)
  useEffect(() => {
    channelsRef.current = channels
    activeRef.current = activeChannelId
  }, [channels, activeChannelId])

  const loadChannel = useCallback(
    async (channelId: ChatChannelId) => {
      const ack = await emitWithAck(socket, ChatSocketEvent.CHANNEL_JOIN, { channelId })
      // Les données reçues sont validées (et les dates reconstruites) comme pour les événements.
      const history = chatMessageCreatedEventSchema.array().parse(ack.messages)
      setMessages((current) => ({ ...current, [channelId]: history }))
    },
    [socket],
  )

  useEffect(() => {
    if (!socket) return

    const onConnect = () => {
      channelsRef.current.forEach((channel) => {
        loadChannel(channel.id).catch(() => undefined)
      })
    }
    const onMessage = (payload: unknown) => {
      const message = chatMessageCreatedEventSchema.parse(payload)
      setMessages((current) => {
        const list = current[message.channelId] ?? []
        // Un même événement peut être reçu deux fois (reconnexion) : on déduplique.
        if (list.some((m) => m.messageId === message.messageId)) return current
        return { ...current, [message.channelId]: [...list, message] }
      })
      if (message.channelId !== activeRef.current) {
        setUnread((current) => ({ ...current, [message.channelId]: (current[message.channelId] ?? 0) + 1 }))
      }
    }
    const onPresence = (payload: unknown) => {
      setOnline(presenceUpdatedEventSchema.parse(payload).users)
    }

    socket.on('connect', onConnect)
    socket.on(ChatSocketEvent.MESSAGE_CREATED, onMessage)
    socket.on(ChatSocketEvent.PRESENCE_UPDATED, onPresence)
    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off(ChatSocketEvent.MESSAGE_CREATED, onMessage)
      socket.off(ChatSocketEvent.PRESENCE_UPDATED, onPresence)
    }
  }, [socket, loadChannel])

  const selectChannel = useCallback((channelId: ChatChannelId) => {
    setActiveChannelId(channelId)
    setUnread((current) => ({ ...current, [channelId]: 0 }))
  }, [])

  const openOrderChannel = useCallback(
    async (order: Order) => {
      const channelId = orderChatChannel(order.id)
      await loadChannel(channelId)
      setOrderChannels((current) =>
        current.some((c) => c.id === channelId)
          ? current
          : [...current, { id: channelId, label: `Table ${order.tableNumber}`, closable: true }],
      )
      selectChannel(channelId)
    },
    [loadChannel, selectChannel],
  )

  const closeChannel = useCallback(
    (channelId: ChatChannelId) => {
      socket?.emit(ChatSocketEvent.CHANNEL_LEAVE, { channelId })
      setOrderChannels((current) => current.filter((c) => c.id !== channelId))
      if (activeRef.current === channelId) selectChannel('general')
    },
    [socket, selectChannel],
  )

  const sendMessage = useCallback(
    (content: string) =>
      emitWithAck(socket, ChatSocketEvent.MESSAGE_CREATE, {
        channelId: activeChannelId,
        clientMessageId: crypto.randomUUID(),
        content,
      }),
    [socket, activeChannelId],
  )

  return {
    channels,
    activeChannelId,
    messages: messages[activeChannelId] ?? [],
    unread,
    online,
    selectChannel,
    openOrderChannel,
    closeChannel,
    sendMessage,
  }
}
