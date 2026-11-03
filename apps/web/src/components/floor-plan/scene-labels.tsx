import { useFrame, useThree } from '@react-three/fiber'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { Vector3 } from 'three'

/**
 * Étiquettes HTML de la scène. Elles vivent dans l'arbre React de la page (une
 * couche au-dessus du canvas), pas dans une racine React par étiquette comme
 * `<Html>` de drei : pas de problème de StrictMode, et le contexte, les styles
 * et l'accessibilité restent ceux de l'application. Seule leur position est
 * mise à jour à chaque image, directement dans le DOM.
 */
type Anchor = { position: Vector3; element: HTMLElement }
export type LabelAnchors = Map<string, Anchor>

// Dans le Canvas : projette chaque ancre à l'écran à chaque image rendue.
export function LabelProjector({ anchors }: { anchors: LabelAnchors }) {
  const invalidate = useThree((state) => state.invalidate)
  const [projected] = useState(() => new Vector3())

  // À chaque mise à jour de la scène, une image suffit à placer les nouvelles étiquettes.
  useEffect(() => invalidate())

  useFrame(({ camera, size }) => {
    anchors.forEach(({ position, element }) => {
      projected.copy(position).project(camera)
      const x = ((projected.x + 1) / 2) * size.width
      const y = ((1 - projected.y) / 2) * size.height
      element.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`
      element.style.visibility = 'visible'
    })
  })

  return null
}

type SceneLabelProps = {
  anchors: LabelAnchors
  id: string
  // Point de la scène (en mètres) au-dessus duquel l'étiquette est centrée.
  position: [number, number, number]
  children: ReactNode
}

// Hors du Canvas : étiquette masquée jusqu'à sa première projection.
export function SceneLabel({ anchors, id, position: [x, y, z], children }: SceneLabelProps) {
  const register = useCallback(
    (element: HTMLDivElement | null) => {
      if (!element) return
      anchors.set(id, { position: new Vector3(x, y, z), element })
      return () => {
        anchors.delete(id)
      }
    },
    [anchors, id, x, y, z],
  )

  return (
    <div ref={register} className="invisible absolute top-0 left-0">
      {children}
    </div>
  )
}
