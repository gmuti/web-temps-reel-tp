export type EventChannel<T> = {
  emit: (value: T) => void
  // Renvoie la fonction de désabonnement.
  subscribe: (listener: (value: T) => void) => () => void
}

// Diffusion synchrone vers des abonnés : relaie des événements ponctuels entre
// composants sans les stocker dans un état React.
export function createEventChannel<T>(): EventChannel<T> {
  const listeners = new Set<(value: T) => void>()
  return {
    emit: (value) => listeners.forEach((listener) => listener(value)),
    subscribe: (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
  }
}
