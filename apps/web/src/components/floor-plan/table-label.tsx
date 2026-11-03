import { ClockIcon, MessageSquareIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { TableView } from './floor-scene-model'
import { minutesSince, TABLE_STATE_STYLES } from './table-states'

type TableLabelProps = {
  table: TableView
  now: Date
  onSelect: (tableNumber: number) => void
}

/**
 * Étiquette d'une table : numéro, nombre de commandes, attente, messages non
 * lus. C'est un vrai bouton : la scène reste utilisable au clavier.
 */
export function TableLabel({ table, now, onSelect }: TableLabelProps) {
  const style = TABLE_STATE_STYLES[table.state]
  const count = table.orders.length

  return (
    <button
      type="button"
      onClick={() => onSelect(table.number)}
      aria-label={`Table ${table.number} : ${style.label}${count > 0 ? `, ${count} commande${count > 1 ? 's' : ''}` : ''}`}
      className={cn(
        'pointer-events-auto flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap shadow-sm',
        style.badgeClass,
      )}
    >
      T{table.number}
      {count > 1 && <span className="rounded-full bg-black/20 px-1.5">{count}</span>}
      {table.since && (
        <span className="flex items-center gap-0.5 font-normal">
          <ClockIcon className="size-3" />
          {minutesSince(table.since, now)} min
        </span>
      )}
      {table.unread > 0 && (
        <span className="flex items-center gap-0.5">
          <MessageSquareIcon className="size-3" />
          {table.unread}
        </span>
      )}
    </button>
  )
}
