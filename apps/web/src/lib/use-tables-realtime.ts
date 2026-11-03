import {
  TableSocketEvent,
  tableStatesSchema,
  tableStatusUpdatedEventSchema,
  type TableState,
  type TableStatus,
  type TableStatusUpdatedEvent,
} from '@app/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { emitWithAck, type RealtimeSocket } from '@/lib/use-realtime-socket'

export type TableStates = Record<number, TableState>

type TablesRealtimeOptions = {
  // Appelé pour chaque changement reçu en direct et plus récent que l'état connu.
  onLiveEvent?: (event: TableStatusUpdatedEvent) => void
}

const stateOf = ({ number, status, guests, statusChangedAt, version }: TableState): TableState => ({
  number,
  status,
  guests,
  statusChangedAt,
  version,
})

/**
 * Occupation des tables en temps réel. Pas de journal : à chaque (re)connexion,
 * l'instantané `table:sync` est rechargé, et chaque table garde l'état de
 * version la plus haute, qu'il vienne de l'instantané ou d'un événement — l'ordre
 * d'arrivée n'a donc pas d'importance. Les changements manqués pendant une
 * coupure arrivent avec l'instantané, sans être animés.
 */
export function useTablesRealtime(socket: RealtimeSocket | null, options: TablesRealtimeOptions = {}) {
  const [tables, setTables] = useState<TableStates>({})
  // Versions connues, lues de façon synchrone par les écouteurs.
  const versionsRef = useRef(new Map<number, number>())
  const onLiveEventRef = useRef(options.onLiveEvent)

  useEffect(() => {
    onLiveEventRef.current = options.onLiveEvent
  }, [options.onLiveEvent])

  // Garde un état s'il est plus récent que celui connu ; renvoie vrai s'il est retenu.
  const keepIfNewer = useCallback((state: TableState): boolean => {
    const known = versionsRef.current.get(state.number)
    if (known !== undefined && known >= state.version) return false
    versionsRef.current.set(state.number, state.version)
    setTables((current) => ({ ...current, [state.number]: stateOf(state) }))
    return true
  }, [])

  const resync = useCallback(async () => {
    const ack = await emitWithAck(socket, TableSocketEvent.SYNC, {})
    tableStatesSchema.parse(ack.tables).forEach(keepIfNewer)
  }, [socket, keepIfNewer])

  useEffect(() => {
    if (!socket) return

    const onConnect = () => {
      resync().catch(() => {
        // Échec (coupure, délai) : il sera retenté à la reconnexion.
      })
    }
    const onStatusUpdated = (payload: unknown) => {
      const event = tableStatusUpdatedEventSchema.parse(payload)
      if (keepIfNewer(event)) onLiveEventRef.current?.(event)
    }

    socket.on('connect', onConnect)
    socket.on(TableSocketEvent.STATUS_UPDATED, onStatusUpdated)
    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off(TableSocketEvent.STATUS_UPDATED, onStatusUpdated)
    }
  }, [socket, resync, keepIfNewer])

  const updateTableStatus = useCallback(
    async (table: TableState, requestedStatus: TableStatus, guests?: number) =>
      (
        await emitWithAck(socket, TableSocketEvent.STATUS_UPDATE, {
          tableNumber: table.number,
          expectedStatus: table.status,
          requestedStatus,
          guests,
        })
      ).tableNumber,
    [socket],
  )

  return { tables, resync, updateTableStatus }
}
