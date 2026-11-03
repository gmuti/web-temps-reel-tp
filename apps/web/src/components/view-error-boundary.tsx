import { Component, type ReactNode } from 'react'

type ViewErrorBoundaryProps = {
  children: ReactNode
  // Appelé une fois quand la vue échoue (chargement du module, WebGL...).
  onError: (error: Error) => void
}

/**
 * Isole une vue facultative : si elle échoue, le reste de la page continue de
 * fonctionner et l'appelant bascule sur une autre vue.
 */
export class ViewErrorBoundary extends Component<ViewErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error: Error) {
    this.props.onError(error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}
