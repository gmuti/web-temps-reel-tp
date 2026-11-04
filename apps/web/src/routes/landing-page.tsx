import { Link } from 'react-router'
import { useDocumentTitle } from '@/lib/use-document-title'

// Squelette provisoire (lot 1) : la landing complète arrive au lot 2.
// Aucune dépendance à l'API, à l'auth ni à Three.js.
export function LandingPage() {
  useDocumentTitle('Poêle Position')

  return (
    <main className="bg-brand-blue flex min-h-svh flex-col items-center justify-center gap-8 px-6 text-center">
      <h1 className="font-display text-brand-yellow text-[clamp(64px,9vw,132px)] leading-[0.92]">Poêle Position</h1>
      <p className="max-w-xl text-[22px] text-white">Ici, on cuisine à fond.</p>
      <Link
        to="/connexion"
        className="inline-flex min-h-11 items-center rounded-full bg-brand-yellow px-6 font-extrabold text-[#101010] focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-white"
      >
        Espace équipe
      </Link>
    </main>
  )
}
