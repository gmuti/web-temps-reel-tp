import { useGLTF } from '@react-three/drei'
import type { ThreeElements } from '@react-three/fiber'
import { useMemo } from 'react'
import { Box3, Mesh, MeshStandardMaterial, Vector3 } from 'three'

// Modèles du Furniture Kit de Kenney (CC0, cf. public/models/kenney-furniture/License.txt).
const MODELS_URL = '/models/kenney-furniture'

const KIT_MODELS = [
  'chair',
  'kitchenBar',
  'kitchenBarEnd',
  'kitchenCabinet',
  'kitchenCoffeeMachine',
  'kitchenFridgeLarge',
  'kitchenSink',
  'kitchenStove',
  'pottedPlant',
  'table',
  'tableCloth',
] as const

export type KitModelName = (typeof KIT_MODELS)[number]

// Le kit est modélisé petit : 1 unité du kit ≈ 2,2 m (table de 0,33 → 0,73 m).
const KIT_SCALE = 2.2

const urlOf = (name: KitModelName) => `${MODELS_URL}/${name}.glb`

// Téléchargés dès le chargement du module 3D, en parallèle (quelques Ko chacun).
KIT_MODELS.forEach((name) => useGLTF.preload(urlOf(name)))

type KitModelProps = Omit<ThreeElements['group'], 'scale'> & {
  name: KitModelName
  // Étirement propre à un usage (ex. table raccourcie), en plus de l'échelle du kit.
  stretch?: [number, number, number]
  // Couleurs imposées par nom de matériau glTF (ex. la nappe du kit, rose, passée en blanc cassé).
  materialColors?: Record<string, string>
}

/**
 * Modèle du kit à l'échelle de la scène, recentré : l'origine des modèles
 * Kenney est dans un coin, on la ramène au sol, au centre de l'emprise. Chaque
 * instance clone la scène glTF (une scène three ne peut être montée qu'une
 * fois) ; géométries et matériaux restent partagés.
 */
export function KitModel({ name, stretch = [1, 1, 1], materialColors, ...groupProps }: KitModelProps) {
  const { scene } = useGLTF(urlOf(name))
  const model = useMemo(() => {
    const clone = scene.clone(true)
    const box = new Box3().setFromObject(clone)
    const center = box.getCenter(new Vector3())
    clone.position.set(-center.x, -box.min.y, -center.z)
    if (materialColors) {
      // Matériau copié pour cette instance : les autres gardent la couleur du kit.
      clone.traverse((object) => {
        if (!(object instanceof Mesh) || !(object.material instanceof MeshStandardMaterial)) return
        const color = materialColors[object.material.name]
        if (!color) return
        object.material = object.material.clone()
        object.material.color.set(color)
      })
    }
    return clone
  }, [scene, materialColors])

  return (
    <group {...groupProps}>
      <group scale={[KIT_SCALE * stretch[0], KIT_SCALE * stretch[1], KIT_SCALE * stretch[2]]}>
        <primitive object={model} />
      </group>
    </group>
  )
}
