import type { TableVisualState } from './floor-scene-model'

// Rendu de chaque état de table : couleur 3D (anneau au sol) et étiquette HTML.
// Une table prête ou à valider attend une action de la salle : elle clignote.
export const TABLE_STATE_STYLES: Record<TableVisualState, { label: string; color: string; badgeClass: string }> = {
  free: { label: 'Libre', color: '#94a3b8', badgeClass: 'bg-background text-muted-foreground' },
  unknown: {
    label: 'Pas de commande de votre part',
    color: '#cbd5e1',
    badgeClass: 'bg-background/80 text-muted-foreground',
  },
  'to-validate': { label: 'À valider', color: '#f59e0b', badgeClass: 'bg-amber-500 text-white animate-pulse' },
  validated: { label: 'Validée', color: '#3b82f6', badgeClass: 'bg-blue-500 text-white' },
  cooking: { label: 'En préparation', color: '#f97316', badgeClass: 'bg-orange-500 text-white' },
  ready: { label: 'Prête à servir', color: '#16a34a', badgeClass: 'bg-green-600 text-white animate-pulse' },
}

// Durée écoulée depuis l'entrée dans le statut, arrondie à la minute.
export function minutesSince(since: Date, now: Date): number {
  return Math.max(0, Math.floor((now.getTime() - since.getTime()) / 60_000))
}
