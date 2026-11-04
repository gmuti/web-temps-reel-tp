import { Link, Navigate } from 'react-router'
import { LoginForm } from '@/components/login-form'
import { useAuth } from '@/lib/auth-context'
import { useDocumentTitle } from '@/lib/use-document-title'

export default function LoginPage() {
  const { user, isLoading } = useAuth()
  useDocumentTitle('Poêle Position · Connexion')

  if (isLoading) return null
  // Déjà connecté (ou connexion qui vient d'aboutir) : direction l'app.
  if (user) return <Navigate to="/service" replace />

  return (
    <div className="grid min-h-svh min-[900px]:grid-cols-2">
      <section aria-labelledby="login-title" className="bg-brand-blue flex flex-col text-white">
        <div className="flex flex-1 flex-col gap-12 px-6 pt-6 pb-12 sm:px-12 sm:pt-10">
          <Link
            to="/"
            className="font-display text-brand-yellow inline-flex min-h-11 items-center self-start rounded-md text-[30px] leading-none focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white"
          >
            Poêle Position
          </Link>
          <div className="flex flex-col gap-6 min-[900px]:my-auto">
            <h1
              id="login-title"
              className="font-display text-brand-yellow text-[clamp(56px,7vw,104px)] leading-[0.92] text-balance"
            >
              Grille de départ
            </h1>
            <p className="max-w-md text-[19px] leading-snug">
              Connecte-toi pour prendre ton poste. La salle et la cuisine t’attendent.
            </p>
          </div>
        </div>
        {/* Damier en carreaux de 32 px : deux rangées pleines sur les 64 px de la bande. */}
        <div aria-hidden="true" className="checkerboard h-16" style={{ backgroundSize: '32px 32px' }} />
      </section>

      <main className="flex items-center justify-center px-6 py-12">
        <div className="flex w-full max-w-[400px] flex-col gap-8">
          <LoginForm />
          <div className="flex flex-col gap-3 text-[15px]">
            <p className="text-muted-foreground">Pas d’accès ? Demande à ton responsable de t’ajouter.</p>
            <Link
              to="/"
              className="focus-visible:outline-ring inline-flex min-h-11 items-center self-start rounded-md font-semibold underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2"
            >
              Retour au site du restaurant
            </Link>
          </div>
        </div>
      </main>
    </div>
  )
}
