import { Navigate } from 'react-router'
import { LoginForm } from '@/components/login-form'
import { useAuth } from '@/lib/auth-context'
import { useDocumentTitle } from '@/lib/use-document-title'

export default function LoginPage() {
  const { user, isLoading } = useAuth()
  useDocumentTitle('Poêle Position · Connexion')

  if (isLoading) return null
  // Déjà connecté (ou connexion qui vient d'aboutir) : direction l'app.
  if (user) return <Navigate to="/service" replace />
  return <LoginForm />
}
