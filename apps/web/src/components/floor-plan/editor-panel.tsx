import { TABLE_SEATS_MAX, tableShapeSchema, type FloorTable, type TableShape } from '@app/shared'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

const SHAPE_LABELS: Record<TableShape, string> = {
  small: `Petite (${TABLE_SEATS_MAX.small} places)`,
  long: `Longue (${TABLE_SEATS_MAX.long} places)`,
}

type EditorPanelProps = {
  selected: FloorTable | null
  // La table sélectionnée est occupée ou a des commandes : on ne peut ni la
  // retirer ni la renuméroter (pour le serveur, c'est retirer l'ancienne).
  selectedInUse: boolean
  problems: string[]
  hasChanges: boolean
  isSaving: boolean
  onAdd: () => void
  onRemove: (tableNumber: number) => void
  onRenumber: (tableNumber: number, nextNumber: number) => void
  onReshape: (tableNumber: number, shape: TableShape) => void
  onCancel: () => void
  onSave: () => void
}

/** Commandes de l'éditeur de plan, par-dessus la vue de dessus. */
export function EditorPanel({
  selected,
  selectedInUse,
  problems,
  hasChanges,
  isSaving,
  onAdd,
  onRemove,
  onRenumber,
  onReshape,
  onCancel,
  onSave,
}: EditorPanelProps) {
  return (
    <div className="bg-background/95 absolute top-20 left-3 flex max-h-[calc(100%-6rem)] w-72 max-w-[calc(100%-1.5rem)] flex-col gap-3 overflow-y-auto rounded-2xl p-3 text-sm shadow-md">
      <div>
        <p className="font-semibold">Édition du plan</p>
        <p className="text-muted-foreground text-xs">Glissez les tables pour les déplacer (grille de 25 cm).</p>
      </div>

      <Button size="sm" variant="outline" onClick={onAdd}>
        <PlusIcon />
        Ajouter une table
      </Button>

      {selected && (
        <div className="flex flex-col gap-2 rounded-md border p-2">
          <div className="grid grid-cols-2 gap-2">
            <div className="flex flex-col gap-1">
              <Label htmlFor="editor-table-number">Numéro</Label>
              <Input
                id="editor-table-number"
                type="number"
                min={1}
                value={selected.number}
                disabled={selectedInUse}
                title={selectedInUse ? 'Table occupée ou avec des commandes en cours.' : undefined}
                onChange={(event) => {
                  const next = Number(event.target.value)
                  if (Number.isInteger(next) && next > 0) onRenumber(selected.number, next)
                }}
                className="h-10"
              />
            </div>
            <div className="flex flex-col gap-1">
              <Label>Forme</Label>
              <Select
                value={selected.shape}
                onValueChange={(value) => onReshape(selected.number, tableShapeSchema.parse(value))}
              >
                <SelectTrigger size="sm" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {tableShapeSchema.options.map((shape) => (
                    <SelectItem key={shape} value={shape}>
                      {SHAPE_LABELS[shape]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button
            size="sm"
            variant="destructive"
            disabled={selectedInUse}
            title={selectedInUse ? 'Table occupée ou avec des commandes en cours.' : undefined}
            onClick={() => onRemove(selected.number)}
          >
            <Trash2Icon />
            Retirer la table {selected.number}
          </Button>
        </div>
      )}

      {problems.length > 0 && (
        <ul className="text-destructive flex flex-col gap-1 text-xs" aria-live="polite">
          {problems.map((problem) => (
            <li key={problem}>{problem}</li>
          ))}
        </ul>
      )}

      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel} disabled={isSaving}>
          Annuler
        </Button>
        <Button size="sm" onClick={onSave} disabled={isSaving || !hasChanges || problems.length > 0}>
          {isSaving ? 'Enregistrement…' : 'Enregistrer'}
        </Button>
      </div>
    </div>
  )
}
