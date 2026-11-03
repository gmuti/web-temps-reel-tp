import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import type { Group, Mesh, MeshBasicMaterial } from 'three'
import type { SceneEffect } from '../order-effects'

export type ActiveEffect = SceneEffect & { id: number }

const ARC_DURATION_MS = 900
const PULSE_DURATION_MS = 1200
const ARC_HEIGHT = 1.4

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2)

/**
 * Avancement de l'effet (0 → 1) à chaque image. Le plan n'est redessiné que sur
 * demande : tant que l'effet n'est pas terminé, on redemande une image.
 */
function useProgress(durationMs: number, onFrame: (t: number) => void, onDone: () => void) {
  const invalidate = useThree((state) => state.invalidate)
  const startRef = useRef<number | null>(null)
  const doneRef = useRef(false)

  // Première image dès le montage : sans elle, rien ne lancerait l'animation.
  useEffect(() => invalidate(), [invalidate])

  useFrame(() => {
    if (doneRef.current) return
    const now = performance.now()
    startRef.current ??= now
    const t = Math.min(1, (now - startRef.current) / durationMs)
    onFrame(t)
    if (t < 1) {
      invalidate()
    } else {
      doneRef.current = true
      onDone()
    }
  })
}

// Ticket ou assiette qui vole en arc d'un point à un autre.
function ArcEffect({ effect, onDone }: { effect: Extract<ActiveEffect, { kind: 'arc' }>; onDone: () => void }) {
  const ref = useRef<Group>(null)
  const { from, to } = effect

  useProgress(
    ARC_DURATION_MS,
    (t) => {
      const group = ref.current
      if (!group) return
      const eased = easeInOut(t)
      group.position.set(
        from[0] + (to[0] - from[0]) * eased,
        from[1] + (to[1] - from[1]) * eased + Math.sin(Math.PI * t) * ARC_HEIGHT,
        from[2] + (to[2] - from[2]) * eased,
      )
      const scale = effect.vanish ? 1 - eased : 1
      group.scale.setScalar(Math.max(scale, 0.001))
      group.visible = true
    },
    onDone,
  )

  return (
    <group ref={ref} position={from} visible={false}>
      {effect.item === 'ticket' ? (
        <mesh>
          <boxGeometry args={[0.35, 0.45, 0.02]} />
          <meshStandardMaterial color={effect.color} />
        </mesh>
      ) : (
        <mesh>
          <cylinderGeometry args={[0.25, 0.2, 0.05, 24]} />
          <meshStandardMaterial color={effect.color} />
        </mesh>
      )}
    </group>
  )
}

// Anneau qui s'élargit au sol en s'effaçant.
function PulseEffect({ effect, onDone }: { effect: Extract<ActiveEffect, { kind: 'pulse' }>; onDone: () => void }) {
  const ref = useRef<Mesh>(null)

  useProgress(
    PULSE_DURATION_MS,
    (t) => {
      const mesh = ref.current
      if (!mesh) return
      mesh.scale.setScalar(1 + t * 1.6)
      ;(mesh.material as MeshBasicMaterial).opacity = 0.9 * (1 - t)
    },
    onDone,
  )

  return (
    <mesh ref={ref} position={effect.at} rotation-x={-Math.PI / 2}>
      <ringGeometry args={[0.9, 1.1, 48]} />
      <meshBasicMaterial color={effect.color} transparent opacity={0.9} depthWrite={false} />
    </mesh>
  )
}

type EffectsProps = {
  effects: ActiveEffect[]
  onDone: (id: number) => void
}

export function Effects({ effects, onDone }: EffectsProps) {
  return effects.map((effect) =>
    effect.kind === 'arc' ? (
      <ArcEffect key={effect.id} effect={effect} onDone={() => onDone(effect.id)} />
    ) : (
      <PulseEffect key={effect.id} effect={effect} onDone={() => onDone(effect.id)} />
    ),
  )
}
