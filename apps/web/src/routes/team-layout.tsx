import { Suspense } from 'react'
import { Outlet } from 'react-router'
import { Toaster } from '@/components/ui/sonner'
import { AuthProvider } from '@/lib/auth-context'

// Layout commun à /connexion et /service : la landing n'en dépend pas.
export default function TeamLayout() {
  return (
    <AuthProvider>
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      <Toaster richColors position="top-right" />
    </AuthProvider>
  )
}
