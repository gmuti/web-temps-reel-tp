import { canRoleSetTableStatus, TABLE_GUESTS_MAX, type TableState, type TableStatus, type UserRole } from '@app/shared'
import { useState } from 'react'
import { TABLE_STATUS_LABELS } from '@/lib/order-status'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

const timeFormat = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' })

const DEFAULT_GUESTS = 2

type TableOccupancyProps = {
  occupancy: TableState
  role: UserRole
  // Commandes en cours visibles par l'utilisateur sur cette table.
  hasActiveOrders: boolean
  isPending: boolean
  onChange: (table: TableState, status: TableStatus, guests?: number) => void
}

/**
 * Occupation d'une table et action suivante : installer des clients, constater
 * leur départ, puis débarrasser. Seuls les rôles de salle peuvent agir ; les
 * autres voient l'état.
 */
export function TableOccupancy({ occupancy, role, hasActiveOrders, isPending, onChange }: TableOccupancyProps) {
  const [guests, setGuests] = useState(String(DEFAULT_GUESTS))
  const canAct = canRoleSetTableStatus(role)
  const guestsNumber = Number(guests)
  const validGuests = Number.isInteger(guestsNumber) && guestsNumber >= 1 && guestsNumber <= TABLE_GUESTS_MAX

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border p-3 text-sm">
      <Badge variant="secondary">{TABLE_STATUS_LABELS[occupancy.status]}</Badge>
      {occupancy.status === 'OCCUPEE' && occupancy.guests !== null && (
        <span>
          {occupancy.guests} couvert{occupancy.guests > 1 ? 's' : ''}
        </span>
      )}
      <span className="text-muted-foreground">depuis {timeFormat.format(occupancy.statusChangedAt)}</span>

      {canAct && (
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {occupancy.status === 'LIBRE' && (
            <>
              <Label htmlFor="table-guests" className="text-muted-foreground font-normal">
                Couverts
              </Label>
              <Input
                id="table-guests"
                type="number"
                min={1}
                max={TABLE_GUESTS_MAX}
                value={guests}
                onChange={(event) => setGuests(event.target.value)}
                className="h-11 w-20"
              />
              <Button
                size="sm"
                disabled={isPending || !validGuests}
                onClick={() => onChange(occupancy, 'OCCUPEE', guestsNumber)}
              >
                Installer les clients
              </Button>
            </>
          )}
          {occupancy.status === 'OCCUPEE' && (
            <Button
              size="sm"
              variant="outline"
              disabled={isPending || hasActiveOrders}
              title={hasActiveOrders ? 'Des commandes sont encore en cours sur cette table.' : undefined}
              onClick={() => onChange(occupancy, 'A_DEBARRASSER')}
            >
              Clients partis
            </Button>
          )}
          {occupancy.status === 'A_DEBARRASSER' && (
            <Button size="sm" disabled={isPending} onClick={() => onChange(occupancy, 'LIBRE')}>
              Table débarrassée
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
