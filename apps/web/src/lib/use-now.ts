import { useEffect, useState } from 'react'

// Heure courante rafraîchie à intervalle régulier : une seule horloge pour tous
// les minuteurs d'une vue, plutôt qu'un intervalle par élément.
export function useNow(intervalMs: number): Date {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])

  return now
}
