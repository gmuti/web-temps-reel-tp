import type { UserRole } from '@app/shared'

// Libellés des rôles, partagés par l'en-tête et le chat.
export const ROLE_LABELS: Record<UserRole, string> = {
  RESPONSABLE: 'Responsable',
  MANAGER: 'Manager',
  WAITER: 'Salle',
  COOK: 'Cuisine',
}
