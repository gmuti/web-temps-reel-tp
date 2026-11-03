import { LoginForm } from '@/components/login-form'
import { OrderBoard } from '@/components/order-board'
import { AuthProvider, useAuth } from '@/lib/auth-context'

function AppContent() {
  const { user, isLoading } = useAuth()

  if (isLoading) {
    return null
  }

  return user ? <OrderBoard /> : <LoginForm />
}

function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App
