import type { UserRole } from '@app/shared'
import type { TableVisualState } from './floor-scene-model'

// Rendu de chaque état de table : couleur 3D (anneau au sol) et étiquette HTML.
// Le clignotement dépend du rôle connecté (cf. blinksFor).
export const TABLE_STATE_STYLES: Record<TableVisualState, { label: string; color: string; badgeClass: string }> = {
  free: { label: 'Libre', color: '#94a3b8', badgeClass: 'bg-background text-muted-foreground' },
  unknown: {
    label: 'Pas de commande de ta part',
    color: '#cbd5e1',
    badgeClass: 'bg-background/80 text-muted-foreground',
  },
  occupied: { label: 'Occupée', color: '#64748b', badgeClass: 'bg-slate-600 text-white' },
  'to-clear': { label: 'À débarrasser', color: '#9333ea', badgeClass: 'bg-purple-600 text-white' },
  'to-validate': { label: 'À valider', color: '#f59e0b', badgeClass: 'bg-amber-500 text-white' },
  validated: { label: 'Validée', color: '#3b82f6', badgeClass: 'bg-blue-500 text-white' },
  cooking: { label: 'En préparation', color: '#f97316', badgeClass: 'bg-orange-500 text-white' },
  ready: { label: 'Prête à servir', color: '#16a34a', badgeClass: 'bg-green-600 text-white' },
}

// Durée écoulée depuis l'entrée dans le statut, arrondie à la minute.
export function minutesSince(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000))
}

// États sur lesquels chaque rôle peut agir (handoff § 6.4) : seuls ceux-là clignotent.
// Le serveur valide et sert ses commandes (il ne voit que ses tables), le responsable
// sert les commandes prêtes ; la cuisine et le manager n'ont rien à faire en salle.
const ACTIONABLE_STATES: Record<UserRole, readonly TableVisualState[]> = {
  WAITER: ['to-validate', 'ready'],
  RESPONSABLE: ['ready'],
  COOK: [],
  MANAGER: [],
}

export function blinksFor(state: TableVisualState, role: UserRole): boolean {
  return ACTIONABLE_STATES[role].includes(state)
}
