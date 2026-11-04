import type { User } from '@app/shared'
import { BoxIcon, KanbanIcon, LogOutIcon, UserRoundIcon } from 'lucide-react'
import { DropdownMenu } from 'radix-ui'
import type { ComponentProps, ReactNode } from 'react'
import { ROLE_LABELS } from '@/lib/role-labels'
import type { ConnectionState } from '@/lib/use-realtime-socket'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

export type BoardView = 'kanban' | 'plan'

const CONNECTION_STATUS: Record<ConnectionState, { label: string; dot: string }> = {
  connecting: { label: 'Connexion…', dot: 'bg-neutral-400' },
  connected: { label: 'En ligne', dot: 'bg-emerald-500' },
  reconnecting: { label: 'Reconnexion…', dot: 'bg-destructive' },
  offline: { label: 'Hors ligne', dot: 'bg-destructive' },
}

// Éléments flottants au-dessus de la scène (handoff § 3.4) : fond blanc, pilule, ombre portée.
const FLOATING = 'bg-background pointer-events-auto rounded-full shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]'

type AppHeaderProps = {
  user: User
  connection: ConnectionState
  view: BoardView
  canShowPlan: boolean
  // Mode Plan : barre flottante au-dessus de la scène, éléments en pilules blanches.
  floating?: boolean
  // Largeur (px) recouverte à droite par le panneau de table : la barre flottante s'arrête avant.
  rightInset?: number
  onChangeView: (view: BoardView) => void
  onPreloadPlan: () => void
  onLogout: () => void
}

/**
 * En-tête de l'app (handoff § 6.2), toujours sur une ligne : logo, bascule Tableau | Plan,
 * état de connexion, puis prénom et rôle (dans un menu sous 1024 px).
 */
export function AppHeader({
  user,
  connection,
  view,
  canShowPlan,
  floating = false,
  rightInset = 0,
  onChangeView,
  onPreloadPlan,
  onLogout,
}: AppHeaderProps) {
  const status = CONNECTION_STATUS[connection]
  const firstName = user.name.split(' ')[0] ?? user.name
  const identity = `${firstName} · ${ROLE_LABELS[user.role]}`

  return (
    <header className={floating ? 'pointer-events-none absolute inset-x-0 top-0 z-30' : 'bg-background border-b'}>
      <div
        className={cn(
          'flex h-16 items-center gap-2',
          floating ? 'px-3 pt-2 sm:px-4' : 'mx-auto max-w-screen-2xl px-4 sm:gap-4 sm:px-6',
        )}
        style={rightInset > 0 ? { paddingRight: rightInset + 16 } : undefined}
      >
        <p
          className={cn(
            'font-display text-brand-blue text-[18px] leading-none whitespace-nowrap min-[400px]:text-[20px] sm:text-[28px]',
            floating && `${FLOATING} flex h-12 items-center px-3 sm:px-5`,
          )}
        >
          Poêle Position
        </p>

        <div className={cn('ml-auto flex items-center gap-1.5 sm:gap-3', floating && `${FLOATING} p-1`)}>
          {canShowPlan && (
            <div role="group" aria-label="Affichage" className="bg-muted flex rounded-full p-1">
              <ViewToggle active={view === 'kanban'} onClick={() => onChangeView('kanban')} label="Tableau">
                <KanbanIcon />
              </ViewToggle>
              <ViewToggle
                active={view === 'plan'}
                onClick={() => onChangeView('plan')}
                label="Plan"
                // Précharge le module 3D dès que l'intention se précise.
                onPointerEnter={onPreloadPlan}
                onFocus={onPreloadPlan}
              >
                <BoxIcon />
              </ViewToggle>
            </div>
          )}

          <span className="inline-flex items-center gap-2 text-sm whitespace-nowrap" title={status.label}>
            <span aria-hidden="true" className={cn('size-2.5 rounded-full', status.dot)} />
            {/* Sous 640 px, la pastille seule ; le libellé reste lu par les lecteurs d'écran. */}
            <span className="sr-only sm:not-sr-only">{status.label}</span>
          </span>

          <div className="hidden items-center gap-3 lg:flex">
            <span className="text-sm font-semibold whitespace-nowrap">{identity}</span>
            <Button variant="outline" size="sm" onClick={onLogout}>
              Se déconnecter
            </Button>
          </div>

          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild>
              <Button variant="ghost" size="icon" className="lg:hidden" aria-label={`Mon compte : ${identity}`}>
                <UserRoundIcon className="size-5" />
              </Button>
            </DropdownMenu.Trigger>
            <DropdownMenu.Portal>
              <DropdownMenu.Content
                align="end"
                sideOffset={8}
                className="bg-popover text-popover-foreground z-50 min-w-52 rounded-2xl border p-1.5 shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]"
              >
                <DropdownMenu.Label className="px-3 py-2 text-sm font-semibold">{identity}</DropdownMenu.Label>
                <DropdownMenu.Separator className="bg-border my-1 h-px" />
                <DropdownMenu.Item
                  onSelect={onLogout}
                  className="data-highlighted:bg-muted flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-3 text-sm outline-none"
                >
                  <LogOutIcon className="size-4" />
                  Se déconnecter
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Portal>
          </DropdownMenu.Root>
        </div>
      </div>
    </header>
  )
}

function ViewToggle({
  active,
  label,
  children,
  ...props
}: { active: boolean; label: string; children: ReactNode } & Omit<ComponentProps<typeof Button>, 'children'>) {
  return (
    <Button
      size="sm"
      variant="ghost"
      aria-pressed={active}
      className={cn(
        'max-sm:w-8 max-sm:px-0 max-sm:pointer-coarse:w-11',
        active && 'bg-foreground text-background hover:bg-foreground/90 hover:text-background',
      )}
      {...props}
    >
      {children}
      {/* Sous 640 px, l'icône seule ; le libellé reste le nom accessible du bouton. */}
      <span className="sr-only sm:not-sr-only">{label}</span>
    </Button>
  )
}
