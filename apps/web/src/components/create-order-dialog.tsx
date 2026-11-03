import type { Order } from '@app/shared'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { ApiError, createOrder } from '@/lib/api'
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

type DraftItem = { meal: string; quantity: string; price: string }

const EMPTY_ITEM: DraftItem = { meal: '', quantity: '1', price: '' }

type CreateOrderDialogProps = {
  onCreated: (order: Order) => void
}

export function CreateOrderDialog({ onCreated }: CreateOrderDialogProps) {
  const [open, setOpen] = useState(false)
  const [tableNumber, setTableNumber] = useState('')
  const [comment, setComment] = useState('')
  const [items, setItems] = useState<DraftItem[]>([{ ...EMPTY_ITEM }])
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const resetForm = () => {
    setTableNumber('')
    setComment('')
    setItems([{ ...EMPTY_ITEM }])
    setError(null)
  }

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((current) => current.map((item, i) => (i === index ? { ...item, ...patch } : item)))
  }

  const addItem = () => setItems((current) => [...current, { ...EMPTY_ITEM }])

  const removeItem = (index: number) =>
    setItems((current) => (current.length > 1 ? current.filter((_, i) => i !== index) : current))

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    setError(null)

    const parsedItems = items.map((item) => ({
      meal: item.meal.trim(),
      quantity: Number(item.quantity),
      price: Number(item.price),
    }))

    if (parsedItems.some((item) => !item.meal || !Number.isFinite(item.quantity) || !Number.isFinite(item.price))) {
      setError('Chaque article doit avoir un nom, une quantité et un prix valides.')
      return
    }

    setIsSubmitting(true)
    try {
      const order = await createOrder({
        tableNumber: Number(tableNumber),
        items: parsedItems,
        comment: comment.trim() || undefined,
        clientOrderId: crypto.randomUUID(),
      })
      onCreated(order)
      setOpen(false)
      resetForm()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Impossible de créer la commande.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) resetForm()
      }}
    >
      <DialogTrigger asChild>
        <Button>
          <PlusIcon />
          Nouvelle commande
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nouvelle commande</DialogTitle>
          <DialogDescription>Table, articles et commentaire éventuel.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
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
            <Label>Articles</Label>
            {items.map((item, index) => (
              <div key={index} className="flex items-center gap-2">
                <Input
                  placeholder="Plat"
                  value={item.meal}
                  onChange={(event) => updateItem(index, { meal: event.target.value })}
                  className="flex-1"
                  required
                />
                <Input
                  type="number"
                  min={1}
                  placeholder="Qté"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, { quantity: event.target.value })}
                  className="w-16"
                  required
                />
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="Prix"
                  value={item.price}
                  onChange={(event) => updateItem(index, { price: event.target.value })}
                  className="w-20"
                  required
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => removeItem(index)}
                  disabled={items.length === 1}
                >
                  <Trash2Icon />
                  <span className="sr-only">Retirer l'article</span>
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addItem} className="self-start">
              <PlusIcon />
              Ajouter un article
            </Button>
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="comment">Commentaire</Label>
            <Input
              id="comment"
              placeholder="Sans oignons…"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <DialogFooter>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? 'Envoi…' : 'Créer la commande'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
