import type { Order } from '@app/shared'

// Libellés des statuts, partagés par les vues des commandes et leurs notifications.
export const STATUS_LABELS: Record<Order['status'], string> = {
  A_VALIDER: 'À valider',
  VALIDEE: 'Validée',
  EN_PREPARATION: 'En préparation',
  PRETE: 'Prête',
  SERVIE: 'Servie',
  ANNULEE: 'Annulée',
}
