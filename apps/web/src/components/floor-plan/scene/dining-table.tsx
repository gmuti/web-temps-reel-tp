import type { ThreeEvent } from '@react-three/fiber'
import type { TableView } from '../floor-scene-model'
import { TABLE_STATE_STYLES } from '../table-states'

const TABLE_HEIGHT = 0.75
const WOOD = '#a1887f'
const CHAIR = '#6d4c41'

// Au-delà de ce déplacement (en pixels), le geste est un glissé de caméra, pas un clic.
const CLICK_MAX_DRAG = 6

type DiningTableProps = {
  table: TableView
  onSelect: (tableNumber: number) => void
}

// Chaises autour de la table : face à face pour 2 places, sur les 4 côtés pour 4.
function chairPositions(seats: TableView['seats']): { x: number; z: number; rotation: number }[] {
  const sides = [
    { x: -0.85, z: 0, rotation: Math.PI / 2 },
    { x: 0.85, z: 0, rotation: -Math.PI / 2 },
    { x: 0, z: -0.85, rotation: 0 },
    { x: 0, z: 0.85, rotation: Math.PI },
  ]
  return sides.slice(0, seats)
}

/**
 * Table du plan, en primitives (remplacées plus tard par des modèles .glb).
 * L'anneau au sol porte l'état ; le détail est dans l'étiquette HTML (TableLabel).
 */
export function DiningTable({ table, onSelect }: DiningTableProps) {
  const style = TABLE_STATE_STYLES[table.state]
  const highlighted = table.state !== 'free' && table.state !== 'unknown'

  const handleClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation()
    if (event.delta > CLICK_MAX_DRAG) return
    onSelect(table.number)
  }

  return (
    <group
      position={[table.x, 0, table.z]}
      onClick={handleClick}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = '')}
    >
      {highlighted && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.01}>
          <ringGeometry args={[0.95, 1.2, 48]} />
          <meshBasicMaterial color={style.color} />
        </mesh>
      )}

      {table.shape === 'round' ? (
        <mesh position-y={TABLE_HEIGHT}>
          <cylinderGeometry args={[0.55, 0.55, 0.06, 32]} />
          <meshStandardMaterial color={WOOD} />
        </mesh>
      ) : (
        <mesh position-y={TABLE_HEIGHT}>
          <boxGeometry args={[1.1, 0.06, 1.1]} />
          <meshStandardMaterial color={WOOD} />
        </mesh>
      )}
      <mesh position-y={TABLE_HEIGHT / 2}>
        <cylinderGeometry args={[0.06, 0.08, TABLE_HEIGHT, 12]} />
        <meshStandardMaterial color={CHAIR} />
      </mesh>

      {chairPositions(table.seats).map((chair) => (
        <group key={`${chair.x}:${chair.z}`} position={[chair.x, 0, chair.z]} rotation-y={chair.rotation}>
          <mesh position-y={0.45}>
            <boxGeometry args={[0.42, 0.05, 0.42]} />
            <meshStandardMaterial color={CHAIR} />
          </mesh>
          <mesh position={[0, 0.7, -0.19]}>
            <boxGeometry args={[0.42, 0.5, 0.05]} />
            <meshStandardMaterial color={CHAIR} />
          </mesh>
        </group>
      ))}

      {/* Zone de clic plus large que la table, utile au doigt sur mobile */}
      <mesh position-y={0.5}>
        <boxGeometry args={[2, 1, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
