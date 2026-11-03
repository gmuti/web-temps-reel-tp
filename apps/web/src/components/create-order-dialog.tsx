import { ORDER_ITEM_NOTE_MAX_LENGTH, type CreateOrderRequest, type Dish } from '@app/shared'
import { MinusIcon, PlusIcon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { getDishes } from '@/lib/api'
import { cn } from '@/lib/utils'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

// Quantité et contrainte saisies pour chaque plat de la carte.
type Selection = Record<string, { quantity: number; note: string }>

type CreateOrderDialogProps = {
  // Envoie la commande ; la nouvelle carte apparaît via l'événement `order:created`.
  onSubmit: (input: CreateOrderRequest) => Promise<unknown>
}

export function CreateOrderDialog({ onSubmit }: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false)
  const [dishes, setDishes] = useState<Dish[] | null>(null)
  const [tableNumber, setTableNumber] = useState('')
  const [comment, setComment] = useState('')
  const [selection, setSelection] = useState<Selection>({})
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = () => {
    setTableNumber('')
    setComment('')
    setSelection({})
    setError(null)
  }

  const handleOpenChange = (next: boolean) => {
    setOpen(next)
    if (!next) resetForm()
    // La carte est chargée à la première ouverture.
    if (next && !dishes) {
      getDishes()
        .then(setDishes)
        .catch(() => setError('Impossible de charger la carte.'))
    }
  }

  const quantityOf = (dishId: string) => selection[dishId]?.quantity ?? 0

  const setQuantity = (dishId: string, quantity: number) =>
    setSelection((current) => ({
      ...current,
      [dishId]: { note: current[dishId]?.note ?? '', quantity: Math.max(0, Math.min(50, quantity)) },
    }))

  const setNote = (dishId: string, note: string) =>
    setSelection((current) => ({ ...current, [dishId]: { quantity: current[dishId]?.quantity ?? 0, note } }))

  const items = Object.entries(selection)
    .filter(([, line]) => line.quantity > 0)
    .map(([dishId, line]) => ({ dishId, quantity: line.quantity, note: line.note.trim() || undefined }))

  const total = items.reduce(
    (sum, item) => sum + item.quantity * (dishes?.find((dish) => dish.id === item.dishId)?.price ?? 0),
    0,
  )

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    if (items.length === 0) {
      setError('Choisissez au moins un plat.')
      return
    }

    setIsSubmitting(true)
    try {
      await onSubmit({
        tableNumber: Number(tableNumber),
        items,
        comment: comment.trim() || undefined,
        clientOrderId: crypto.randomUUID(),
      })
      setOpen(false)
      resetForm()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Impossible de créer la commande.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Nouvelle commande
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Nouvelle commande</DialogTitle>
          <DialogDescription>Table, plats de la carte et contraintes éventuelles.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2 sm:w-40">
            <Label htmlFor="tableNumber">Numéro de table</Label>
            <Input
              id="tableNumber"
              type="number"
              min={1}
              value={tableNumber}
              onChange={(event) => setTableNumber(event.target.value)}
              required
            />
          </div>

          <div className="flex flex-col gap-2">
            <Label>Carte</Label>
            {!dishes ? (
              <p className="text-muted-foreground text-sm">Chargement de la carte…</p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-3">
                {dishes.map((dish) => {
                  const quantity = quantityOf(dish.id)
                  return (
                    <div
                      key={dish.id}
                      className={cn(
                        'flex flex-col overflow-hidden rounded-lg border',
                        quantity > 0 && 'border-primary ring-primary/30 ring-2',
                      )}
                    >
                      <img src={dish.imageUrl} alt={dish.name} className="h-24 w-full object-cover" />
                      <div className="flex flex-1 flex-col gap-2 p-2">
                        <div className="flex items-start justify-between gap-2 text-sm">
                          <span className="font-medium">{dish.name}</span>
                          <span className="text-muted-foreground shrink-0">{dish.price.toFixed(2)} €</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => setQuantity(dish.id, quantity - 1)}
                            disabled={quantity === 0}
                            aria-label={`Retirer : ${dish.name}`}
                          >
                            <MinusIcon />
                          </Button>
                          <span className="w-6 text-center text-sm tabular-nums" aria-label={`Quantité : ${dish.name}`}>
                            {quantity}
                          </span>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="outline"
                            onClick={() => setQuantity(dish.id, quantity + 1)}
                            aria-label={`Ajouter : ${dish.name}`}
                          >
                            <PlusIcon />
                          </Button>
                        </div>
                        {quantity > 0 && (
                          <Input
                            placeholder="Contrainte (sans oignon…)"
                            value={selection[dish.id]?.note ?? ''}
                            onChange={(event) => setNote(dish.id, event.target.value)}
                            maxLength={ORDER_ITEM_NOTE_MAX_LENGTH}
                            aria-label={`Contrainte pour ${dish.name}`}
                          />
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="comment">Commentaire sur la commande</Label>
            <Input
              id="comment"
              placeholder="Allergie, client pressé…"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter className="items-center sm:justify-between">
            <span className="text-sm font-medium">Total : {total.toFixed(2)} €</span>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi…' : 'Créer la commande'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
