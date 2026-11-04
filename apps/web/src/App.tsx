import { lazy, Suspense } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { LandingPage } from '@/routes/landing-page'

// La landing est dans le chunk d'entrée et ne touche ni à l'API ni à l'auth.
// L'espace équipe (auth, toasts, connexion, service) est chargé à la demande :
// le layout porte AuthProvider et le Toaster, chaque écran a son propre chunk.
const TeamLayout = lazy(() => import('@/routes/team-layout'))
const LoginPage = lazy(() => import('@/routes/login-page'))
const ServicePage = lazy(() => import('@/routes/service-page'))

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route
        element={
          <Suspense fallback={null}>
            <TeamLayout />
          </Suspense>
        }
      >
        <Route path="/connexion" element={<LoginPage />} />
        <Route path="/service" element={<ServicePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default App
