import { useEffect, useId, useState } from 'react'
import { Link } from 'react-router'
import { useDocumentTitle } from '@/lib/use-document-title'

// Landing publique du restaurant (handoff § 5). Dans le chunk d'entrée : aucune dépendance
// à l'API, à l'auth ni à Three.js. Prix et coordonnées sont fictifs ; les photos sont sous
// licence libre (cf. docs/CREDITS-PHOTOS.md).

// Jointure de classes locale : importer lib/utils (paquet cn) ici le partagerait avec les chunks lazy
// et ajouterait un second fichier JS au chargement de la landing.
const cn = (...classes: (string | false | undefined)[]) => classes.filter(Boolean).join(' ')

const CONTAINER = 'mx-auto w-full max-w-[1320px] px-6'

// Survol léger, seul effet autorisé sur la landing ; rien si l'utilisateur réduit les animations.
const PILL =
  'inline-flex min-h-11 items-center justify-center rounded-full px-6 py-3 text-[17px] font-extrabold motion-safe:transition-transform motion-safe:hover:-translate-y-0.5 focus-visible:outline-3 focus-visible:outline-offset-4'

// Contour de focus contrasté selon le fond de la section.
const FOCUS_ON_BLUE = 'focus-visible:outline-white'
const FOCUS_ON_YELLOW = 'focus-visible:outline-brand-ink'
const FOCUS_ON_INK = 'focus-visible:outline-brand-yellow'

const DISHES = [
  {
    name: 'La Carbo Turbo',
    description: 'Guanciale croustillant, jaune d’œuf, pecorino. Zéro crème, zéro compromis.',
    price: '15 €',
    image: '/landing/carbo-turbo.jpg',
    alt: 'Assiette de spaghetti carbonara au guanciale, parsemée de fromage râpé',
    tint: 'bg-[#ffe58a]',
  },
  {
    name: 'Pizza Pit-Stop',
    description: 'Tomate, mozzarella, basilic. Quatre-vingt-dix secondes au four, montre en main.',
    price: '12 €',
    image: '/landing/pizza-pit-stop.jpg',
    alt: 'Pizza margherita à pâte gonflée, mozzarella et feuilles de basilic',
    tint: 'bg-[#ffcfc2]',
  },
  {
    name: 'Tiramisu Tour d’honneur',
    description: 'Le dessert qu’on mérite après avoir tout fini. Servi à la cuillère, généreusement.',
    price: '7 €',
    image: '/landing/tiramisu-tour-honneur.jpg',
    alt: 'Part de tiramisu en couches, saupoudrée de cacao et décorée de chocolat',
    tint: 'bg-[#d3d9ff]',
  },
]

// Attribution des photos du site (licences libres, cf. docs/CREDITS-PHOTOS.md).
const PHOTO_CREDITS = [
  {
    label: 'Chef flambant une poêle, U.S. Navy',
    license: 'domaine public',
    href: 'https://commons.wikimedia.org/wiki/File:Flickr_-_Official_U.S._Navy_Imagery_-_Navy_chef_takes_part_in_culinary_competition..jpg',
  },
  {
    label: 'Carbonara, jeffreyw',
    license: 'CC BY 2.0',
    href: 'https://commons.wikimedia.org/wiki/File:Spaghetti_Carbonara_2015.jpg',
  },
  {
    label: 'Pizza margherita, ノボホショコロトソ',
    license: 'CC BY 4.0',
    href: 'https://commons.wikimedia.org/wiki/File:Pizza_Margherita_%E3%83%94%E3%82%B6%E3%83%BB%E3%83%9E%E3%83%AB%E3%82%B2%E3%83%AA%E3%83%BC%E3%82%BF.jpg',
  },
  {
    label: 'Tiramisu, Sarah Stierch',
    license: 'CC BY 4.0',
    href: 'https://commons.wikimedia.org/wiki/File:Tiramisu_-_Bistro_Don_Giovanni_-_Sarah_Stierch_2018_02.jpg',
  },
  {
    label: 'Salle de restaurant, Diego F. Parra',
    license: 'CC BY-SA 4.0',
    href: 'https://commons.wikimedia.org/wiki/File:Restaurant_dining_room_with_brick_walls_and_set_tables,_Colombia.jpg',
  },
]

// Coordonnées fictives (restaurant de démonstration). Le numéro appartient à une
// tranche que l'ARCEP réserve aux œuvres de fiction : il n'attribue aucune ligne réelle.
const PRACTICAL_INFO: { term: string; lines: string[]; href?: string }[] = [
  { term: 'Adresse', lines: ['8 rue du Grand-Prix', '75011 Paris'] },
  { term: 'Horaires', lines: ['Du mardi au samedi', '12 h – 14 h 30 et 19 h – 23 h'] },
  { term: 'Téléphone', lines: ['01 99 00 42 42'], href: 'tel:+33199004242' },
  { term: 'Accès', lines: ['Métro à 3 minutes à pied', 'Arceaux vélo devant la porte'] },
]

// Icônes du menu en SVG inline : importer lucide-react ici le partagerait avec les chunks lazy
// et ajouterait un second fichier JS au chargement de la landing.
function MenuGlyph({ open }: { open: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="size-7"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
    >
      {open ? <path d="M18 6 6 18M6 6l12 12" /> : <path d="M4 6h16M4 12h16M4 18h16" />}
    </svg>
  )
}

function CheckerBand() {
  return <div aria-hidden="true" className="checkerboard h-10" />
}

function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuId = useId()

  useEffect(() => {
    if (!menuOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)
  const navLink = cn(
    'inline-flex min-h-11 items-center rounded-full text-[17px] font-semibold text-white underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2',
    FOCUS_ON_BLUE,
  )

  return (
    <header className="bg-brand-blue relative">
      <div className={cn(CONTAINER, 'flex min-h-20 items-center justify-between gap-6 py-4')}>
        <Link
          to="/"
          className={cn(
            'font-display text-brand-yellow inline-flex min-h-11 items-center rounded-md text-[30px] leading-none focus-visible:outline-3 focus-visible:outline-offset-4',
            FOCUS_ON_BLUE,
          )}
        >
          Poêle Position
        </Link>

        <nav aria-label="Navigation principale" className="hidden items-center gap-8 lg:flex">
          <a href="#carte" className={navLink}>
            La carte
          </a>
          <a href="#garage" className={navLink}>
            Nous trouver
          </a>
        </nav>

        <div className="hidden items-center gap-6 lg:flex">
          <Link to="/connexion" className={cn(navLink, 'font-medium text-white/90')}>
            Espace équipe
          </Link>
          <a href="#garage" className={cn(PILL, 'bg-brand-yellow text-brand-ink', FOCUS_ON_BLUE)}>
            Réserver une table
          </a>
        </div>

        <button
          type="button"
          className={cn(
            'inline-flex size-11 items-center justify-center rounded-full text-white focus-visible:outline-3 focus-visible:outline-offset-2 lg:hidden',
            FOCUS_ON_BLUE,
          )}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label={menuOpen ? 'Fermer le menu' : 'Ouvrir le menu'}
          onClick={() => setMenuOpen((open) => !open)}
        >
          <MenuGlyph open={menuOpen} />
        </button>
      </div>

      <div
        id={menuId}
        hidden={!menuOpen}
        className="bg-brand-blue absolute inset-x-0 top-full z-20 border-t border-white/20 pb-6 shadow-[0_12px_24px_-12px_rgba(0,0,0,0.5)] lg:hidden"
      >
        <nav aria-label="Navigation principale (mobile)" className={cn(CONTAINER, 'flex flex-col gap-1 pt-3')}>
          <a href="#carte" className={navLink} onClick={closeMenu}>
            La carte
          </a>
          <a href="#garage" className={navLink} onClick={closeMenu}>
            Nous trouver
          </a>
          <Link to="/connexion" className={navLink} onClick={closeMenu}>
            Espace équipe
          </Link>
          <a
            href="#garage"
            className={cn(PILL, 'bg-brand-yellow text-brand-ink mt-3 self-start', FOCUS_ON_BLUE)}
            onClick={closeMenu}
          >
            Réserver une table
          </a>
        </nav>
      </div>
    </header>
  )
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className="bg-brand-blue overflow-x-clip">
      <div className={cn(CONTAINER, 'grid items-center gap-16 pt-10 pb-20 lg:grid-cols-2 lg:gap-12 lg:pt-16 lg:pb-28')}>
        <div className="flex flex-col items-start gap-8">
          <h1
            id="hero-title"
            className="font-display text-brand-yellow text-[clamp(64px,9vw,132px)] leading-[0.92] text-balance"
          >
            Ici, on cuisine à fond.
          </h1>
          <p className="max-w-xl text-[22px] leading-snug text-white">
            Des pâtes qui sortent de la casserole en un temps record, des pizzas qui tournent plus vite que des roues,
            et une brigade qui ne lève jamais le pied.
          </p>
          <div className="flex flex-wrap gap-4">
            <a href="#garage" className={cn(PILL, 'bg-brand-yellow text-brand-ink', FOCUS_ON_BLUE)}>
              Réserver une table
            </a>
            <a href="#carte" className={cn(PILL, 'border-2 border-white text-white', FOCUS_ON_BLUE)}>
              Voir la carte
            </a>
          </div>
        </div>

        <div className="relative mx-auto w-full max-w-[460px] lg:mr-0">
          <div className="bg-brand-yellow aspect-[4/5] rotate-3 overflow-hidden rounded-[28px]">
            {/* Image principale du héros : chargée en priorité (au-dessus de la ligne de flottaison). */}
            <img
              src="/landing/heros-poele-flambee.jpg"
              alt="Un chef en toque fait flamber une poêle, les flammes montent bien au-dessus du feu"
              width={960}
              height={1200}
              fetchPriority="high"
              decoding="async"
              className="size-full object-cover"
            />
          </div>
          <p className="font-display bg-brand-orange text-brand-ink absolute -bottom-8 -left-2 flex size-[150px] -rotate-12 items-center justify-center rounded-full p-4 text-center text-[24px] leading-tight sm:-left-10">
            Chaud devant{' '}!
          </p>
        </div>
      </div>
    </section>
  )
}

function Menu() {
  return (
    <section id="carte" aria-labelledby="carte-title" className="scroll-mt-4 bg-white">
      <div className={cn(CONTAINER, 'py-20 lg:py-28')}>
        <div className="mb-12 grid items-end gap-6 lg:grid-cols-2">
          <h2
            id="carte-title"
            className="font-display text-brand-blue text-[clamp(48px,6vw,84px)] leading-[0.95] text-balance"
          >
            Le tiercé gagnant
          </h2>
          <p className="text-brand-ink max-w-lg text-[17px] lg:justify-self-end">
            Les trois plats qui finissent toujours sur le podium. Le reste de la carte change avec les saisons.
          </p>
        </div>

        <ul className="grid list-none gap-10 p-0 [grid-template-columns:repeat(auto-fit,minmax(min(300px,100%),1fr))]">
          {DISHES.map((dish) => (
            <li key={dish.name}>
              <article className="flex flex-col gap-4">
                {/* Fond pastel visible le temps du chargement de la photo. */}
                <div className={cn('aspect-square overflow-hidden rounded-[24px]', dish.tint)}>
                  <img
                    src={dish.image}
                    alt={dish.alt}
                    width={900}
                    height={900}
                    loading="lazy"
                    decoding="async"
                    className="size-full object-cover"
                  />
                </div>
                <div className="flex items-baseline justify-between gap-4">
                  <h3 className="text-brand-ink text-[30px] leading-tight font-extrabold">{dish.name}</h3>
                  <p className="text-brand-ink shrink-0 text-[20px] font-extrabold tabular-nums">{dish.price}</p>
                </div>
                <p className="text-[17px] text-neutral-600">{dish.description}</p>
              </article>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Garage() {
  return (
    <section id="garage" aria-labelledby="garage-title" className="bg-brand-yellow text-brand-ink scroll-mt-4">
      <div className={cn(CONTAINER, 'grid items-center gap-14 py-20 lg:grid-cols-[1.15fr_0.85fr] lg:py-28')}>
        <div className="flex flex-col items-start gap-6">
          <h2 id="garage-title" className="font-display text-[clamp(48px,6vw,84px)] leading-[0.95]">
            Le garage
          </h2>
          <p className="max-w-lg text-[17px]">
            Gare-toi, on s’occupe du reste. Réserve pour être sûr d’avoir ta place sur la grille.
          </p>
          {/* Lien de réservation à fournir : en attendant, le bouton reste sur la section infos. */}
          <a href="#garage" className={cn(PILL, 'bg-brand-blue text-white', FOCUS_ON_YELLOW)}>
            Réserver une table
          </a>

          <dl className="mt-6 grid w-full gap-x-8 gap-y-6 sm:grid-cols-2">
            {PRACTICAL_INFO.map((item) => (
              <div key={item.term} className="border-brand-ink border-t-2 pt-4">
                <dt className="text-[15px] font-extrabold tracking-wide uppercase">{item.term}</dt>
                <dd className="mt-1 text-[17px] leading-snug">
                  {item.href ? (
                    <a
                      href={item.href}
                      className={cn(
                        'rounded-sm font-semibold tabular-nums underline underline-offset-4 focus-visible:outline-3 focus-visible:outline-offset-2',
                        FOCUS_ON_YELLOW,
                      )}
                    >
                      {item.lines[0]}
                    </a>
                  ) : (
                    item.lines.map((line) => (
                      <span key={line} className="block">
                        {line}
                      </span>
                    ))
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="mx-auto w-full max-w-[420px] lg:mr-0">
          <div className="bg-brand-ink aspect-[4/5] -rotate-2 overflow-hidden rounded-[28px]">
            <img
              src="/landing/salle-restaurant.jpg"
              alt="La salle : banquette capitonnée en cuir, murs de briques et tables en bois dressées"
              width={800}
              height={1000}
              loading="lazy"
              decoding="async"
              className="size-full object-cover"
            />
          </div>
        </div>
      </div>
    </section>
  )
}

function SiteFooter() {
  const footerLink = cn(
    'inline-flex min-h-11 items-center rounded-full text-[17px] font-semibold underline-offset-4 hover:underline focus-visible:outline-3 focus-visible:outline-offset-2',
    FOCUS_ON_INK,
  )

  return (
    <footer className="bg-brand-ink text-white">
      <div className={cn(CONTAINER, 'flex flex-col gap-8 pt-14 pb-8 md:flex-row md:items-center md:justify-between')}>
        <p className="font-display text-brand-yellow text-[40px] leading-none">Poêle Position</p>
        <nav aria-label="Pied de page" className="flex flex-wrap gap-x-8 gap-y-1">
          <a href="#carte" className={footerLink}>
            La carte
          </a>
          <a href="#garage" className={footerLink}>
            Nous trouver
          </a>
          <Link to="/connexion" className={cn(footerLink, 'text-brand-yellow')}>
            Espace équipe
          </Link>
        </nav>
      </div>
      {/* Crédits des photos (licences libres, cf. docs/CREDITS-PHOTOS.md). */}
      <div className={cn(CONTAINER, 'border-t border-white/15 py-6')}>
        <p className="text-[14px] leading-relaxed text-white/75">
          Restaurant fictif, coordonnées de démonstration. Photos : Wikimedia Commons.{' '}
          {PHOTO_CREDITS.map((credit, index) => (
            <span key={credit.href}>
              {index > 0 && ' · '}
              <a
                href={credit.href}
                className={cn(
                  'rounded-sm underline underline-offset-2 hover:text-white',
                  'focus-visible:outline-2',
                  FOCUS_ON_INK,
                )}
              >
                {credit.label}
              </a>{' '}
              ({credit.license})
            </span>
          ))}
        </p>
      </div>
    </footer>
  )
}

export function LandingPage() {
  useDocumentTitle('Poêle Position')

  return (
    <div data-landing className="text-brand-ink min-h-svh bg-white">
      <a
        href="#contenu"
        className={cn(
          PILL,
          'bg-brand-yellow text-brand-ink sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-30',
          FOCUS_ON_BLUE,
        )}
      >
        Aller au contenu
      </a>
      <SiteHeader />
      <main id="contenu">
        <Hero />
        <CheckerBand />
        <Menu />
        <Garage />
        <CheckerBand />
      </main>
      <SiteFooter />
    </div>
  )
}
