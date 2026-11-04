import type { Order, TableStatus } from '@app/shared'

// Libellés des statuts, partagés par les vues des commandes et leurs notifications.
export const STATUS_LABELS: Record<Order['status'], string> = {
  A_VALIDER: 'À valider',
  VALIDEE: 'Validée',
  EN_PREPARATION: 'En préparation',
  PRETE: 'Prête',
  SERVIE: 'Servie',
  ANNULEE: 'Annulée',
}

// Libellés de l'occupation des tables.
export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  LIBRE: 'Libre',
  OCCUPEE: 'Occupée',
  A_DEBARRASSER: 'À débarrasser',
}

// Textes des toasts (handoff § 3.5) : courts, tutoiement, un seul jeu de mots (le feu vert).
export function orderStatusToast(tableNumber: number, status: Order['status']): string {
  const table = `T${tableNumber}`
  switch (status) {
    case 'VALIDEE':
      return `Feu vert, ${table} part en cuisine.`
    case 'EN_PREPARATION':
      return `${table} en préparation.`
    case 'PRETE':
      return `${table} prête.`
    case 'SERVIE':
      return `${table} servie.`
    case 'ANNULEE':
      return `${table} annulée.`
    case 'A_VALIDER':
      return `${table} à valider.`
  }
}

export function tableStatusToast(tableNumber: number, status: TableStatus): string {
  return `T${tableNumber} ${TABLE_STATUS_LABELS[status].toLowerCase()}.`
}

export const ORDER_CONFLICT_MESSAGE = 'Quelqu’un a modifié cette commande juste avant toi. Vérifie et réessaie.'
export const TABLE_CONFLICT_MESSAGE = 'Quelqu’un a modifié cette table juste avant toi. Vérifie et réessaie.'
