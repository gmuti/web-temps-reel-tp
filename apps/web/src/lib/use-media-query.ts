import { useSyncExternalStore } from 'react'

// Suit une media query CSS (ex. largeur d'écran) et se met à jour quand elle change.
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (onChange) => {
      const list = window.matchMedia(query)
      list.addEventListener('change', onChange)
      return () => list.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
  )
}
