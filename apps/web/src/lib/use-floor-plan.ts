import { FloorSocketEvent, floorPlanSchema, type FloorPlan } from '@app/shared'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getFloorPlan } from '@/lib/api'
import type { RealtimeSocket } from '@/lib/use-realtime-socket'

type FloorPlanOptions = {
  // Appelé quand un autre utilisateur a modifié le plan (nouvelles tables à synchroniser).
  onUpdated?: (plan: FloorPlan) => void
}

/**
 * Plan de salle du restaurant : chargé en REST, rechargé à chaque (re)connexion
 * (une modification a pu être manquée pendant la coupure), puis tenu à jour par
 * l'événement `floor:updated`. On garde le plan de version la plus haute.
 */
export function useFloorPlan(socket: RealtimeSocket | null, options: FloorPlanOptions = {}) {
  const [plan, setPlan] = useState<FloorPlan | null>(null)
  const [error, setError] = useState<Error | null>(null)
  const onUpdatedRef = useRef(options.onUpdated)

  useEffect(() => {
    onUpdatedRef.current = options.onUpdated
  }, [options.onUpdated])

  const keepIfNewer = useCallback(
    (next: FloorPlan) => setPlan((current) => (current && current.version > next.version ? current : next)),
    [],
  )

  const reload = useCallback(async () => {
    try {
      keepIfNewer(await getFloorPlan())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err : new Error('Plan de salle indisponible.'))
    }
  }, [keepIfNewer])

  useEffect(() => {
    if (!socket) return

    const onConnect = () => void reload()
    const onUpdated = (payload: unknown) => {
      const next = floorPlanSchema.parse(payload)
      keepIfNewer(next)
      onUpdatedRef.current?.(next)
    }

    socket.on('connect', onConnect)
    socket.on(FloorSocketEvent.UPDATED, onUpdated)
    if (socket.connected) onConnect()

    return () => {
      socket.off('connect', onConnect)
      socket.off(FloorSocketEvent.UPDATED, onUpdated)
    }
  }, [socket, reload, keepIfNewer])

  return { plan, error, reload }
}
