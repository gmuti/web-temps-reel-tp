import { LoginForm } from '@/components/login-form'
import { OrderBoard } from '@/components/order-board'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider, useAuth } from '@/lib/auth-context'

function AppContent() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return null
  }

  return user ? <OrderBoard user={user} /> : <LoginForm />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
      <Toaster richColors position="top-right" />
    </AuthProvider>
  )
}

export default App
