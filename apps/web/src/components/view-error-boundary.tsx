import { Component, type ReactNode } from 'react'

type ViewErrorBoundaryProps = {
  children: ReactNode
  // Appelé une fois quand la vue échoue (chargement du module, WebGL...).
  onError?: (error: Error) => void
  // Affiché à la place de la vue en échec (rien par défaut).
  fallback?: ReactNode
}

/**
 * Isole une vue facultative : si elle échoue, le reste de la page continue de
 * fonctionner, avec un remplacement ou une bascule décidée par l'appelant.
 */
export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
