import { Navigate } from 'react-router'
import { OrderBoard } from '@/components/order-board'
import { useAuth } from '@/lib/auth-context'
import { useDocumentTitle } from '@/lib/use-document-title'

export default function ServicePage() {
  const { user, isLoading } = useAuth()
  useDocumentTitle('Poêle Position · Service')

  if (isLoading) return null
  // Non connecté (ou déconnexion) : retour à l'écran de connexion.
  if (!user) return <Navigate to="/connexion" replace />
  return <OrderBoard user={user} />
}
