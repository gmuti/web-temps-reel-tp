import type { OrderItem } from '@app/shared'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

type Slide = { imageUrl: string; label: string }

// Une photo par plat de la commande (les plats sans photo, antérieurs à la carte, sont ignorés).
function slidesOf(items: OrderItem[]): Slide[] {
  const seen = new Set<string>()
  const slides: Slide[] = []
  for (const item of items) {
    if (!item.imageUrl || seen.has(item.imageUrl)) continue
    seen.add(item.imageUrl)
    slides.push({ imageUrl: item.imageUrl, label: item.meal })
  }
  return slides
}

export function DishCarousel({ items }: { items: OrderItem[] }) {
  const slides = slidesOf(items)
  const [index, setIndex] = useState(0)
  if (slides.length === 0) return null

  const current = Math.min(index, slides.length - 1)
  const go = (delta: number) => setIndex((current + delta + slides.length) % slides.length)
  const slide = slides[current]

  return (
    <div className="relative overflow-hidden rounded-md" aria-roledescription="carrousel">
      <img src={slide.imageUrl} alt={slide.label} className="aspect-[4/3] h-28 w-full object-cover" />
      <span className="absolute bottom-1 left-1 rounded bg-black/60 px-1.5 py-0.5 text-xs text-white">
        {slide.label}
      </span>
      {slides.length > 1 && (
        <>
          <Button
            size="icon-sm"
            variant="secondary"
            className="absolute top-1/2 left-1 -translate-y-1/2 opacity-90"
            onClick={() => go(-1)}
            aria-label="Photo précédente"
          >
            <ChevronLeftIcon />
          </Button>
          <Button
            size="icon-sm"
            variant="secondary"
            className="absolute top-1/2 right-1 -translate-y-1/2 opacity-90"
            onClick={() => go(1)}
            aria-label="Photo suivante"
          >
            <ChevronRightIcon />
          </Button>
          <div className="absolute right-1 bottom-1 flex gap-1">
            {slides.map((s, i) => (
              <button
                key={s.imageUrl}
                type="button"
                onClick={() => setIndex(i)}
                className={cn('size-1.5 rounded-full bg-white/60', i === current && 'bg-white')}
                aria-label={`Photo ${i + 1} : ${s.label}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
