import type { FloorTable, TableShape } from '@app/shared'
import type { ThreeEvent } from '@react-three/fiber'
import { Suspense } from 'react'
import { ViewErrorBoundary } from '@/components/view-error-boundary'
import type { TableView } from '../floor-scene-model'
import { TABLE_SIZE } from '../floor-plan-data'
import { TABLE_STATE_STYLES } from '../table-states'
import { KitModel } from './kit-model'

const TABLE_HEIGHT = 0.73
const WOOD = '#a1887f'
const CHAIR = '#6d4c41'

// Au-delà de ce déplacement (en pixels), le geste est un glissé de caméra, pas un clic.
const CLICK_MAX_DRAG = 6

// Anneau d'état autour de la table, chaises comprises.
const RING_RADIUS: Record<TableShape, [number, number]> = {
  small: [1.05, 1.3],
  long: [1.4, 1.65],
}

// Orientation de la chaise du kit par rapport à la convention « regarde vers +z ».
const CHAIR_MODEL_ROTATION = 0

type Chair = { x: number; z: number; rotation: number }

// Chaises face à la table, sur ses deux grands côtés (z). Une chaise « regarde »
// vers +z quand sa rotation est nulle.
function chairsOf(table: FloorTable): Chair[] {
  const xs = table.seats >= 4 ? [-0.45, 0.45] : [0]
  return xs.flatMap((x) => [
    { x, z: -0.75, rotation: 0 },
    { x, z: 0.75, rotation: Math.PI },
  ])
}

// Table et chaises en primitives : affichées pendant le chargement des modèles,
// ou à leur place s'ils ne se chargent pas.
function PrimitiveFurniture({ table }: { table: FloorTable }) {
  const [width, depth] = TABLE_SIZE[table.shape]
  return (
    <group>
      <mesh position-y={TABLE_HEIGHT}>
        <boxGeometry args={[width, 0.06, depth]} />
        <meshStandardMaterial color={WOOD} />
      </mesh>
      <mesh position-y={TABLE_HEIGHT / 2}>
        <boxGeometry args={[width * 0.6, TABLE_HEIGHT, 0.1]} />
        <meshStandardMaterial color={CHAIR} />
      </mesh>
      {chairsOf(table).map((chair) => (
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
    </group>
  )
}

// Mobilier du Furniture Kit : table nappée pour 4, petite table en bois pour 2
// (la table du kit, raccourcie).
function KitFurniture({ table }: { table: FloorTable }) {
  return (
    <group>
      {table.shape === 'long' ? (
        <KitModel name="tableCloth" />
      ) : (
        <KitModel name="table" stretch={[TABLE_SIZE.small[0] / TABLE_SIZE.long[0], 1, 1]} />
      )}
      {chairsOf(table).map((chair) => (
        <KitModel
          key={`${chair.x}:${chair.z}`}
          name="chair"
          position={[chair.x, 0, chair.z]}
          rotation-y={chair.rotation + CHAIR_MODEL_ROTATION}
        />
      ))}
    </group>
  )
}

// Tenues des clients installés, alternées d'une chaise à l'autre.
const GUEST_COLORS = ['#0ea5e9', '#f43f5e', '#84cc16', '#f59e0b']
const SKIN = '#e0b48f'

// Clients assis, un par couvert (toutes les places si le nombre n'est pas connu).
function SeatedGuests({ table }: { table: TableView }) {
  const chairs = chairsOf(table)
  const count = Math.min(table.occupancy?.guests ?? chairs.length, chairs.length)
  return chairs.slice(0, count).map((chair, index) => (
    // Légèrement avancés vers la table depuis le centre de la chaise.
    <group key={`${chair.x}:${chair.z}`} position={[chair.x, 0, chair.z * 0.9]}>
      <mesh position-y={0.82}>
        <capsuleGeometry args={[0.15, 0.36, 4, 12]} />
        <meshStandardMaterial color={GUEST_COLORS[index % GUEST_COLORS.length]} />
      </mesh>
      <mesh position-y={1.2}>
        <sphereGeometry args={[0.13, 16, 12]} />
        <meshStandardMaterial color={SKIN} />
      </mesh>
    </group>
  ))
}

// Assiettes et verres laissés par les clients partis.
function DirtyDishes({ table }: { table: FloorTable }) {
  const xs = table.seats >= 4 ? [-0.45, 0.45] : [0]
  return xs.flatMap((x) =>
    [-0.22, 0.22].map((z) => (
      <group key={`${x}:${z}`} position={[x, TABLE_HEIGHT + 0.02, z]}>
        {/* Assiette blanche (bien visible sur le bois clair) et restes du repas */}
        <mesh>
          <cylinderGeometry args={[0.16, 0.12, 0.03, 20]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
        <mesh position={[0.03, 0.03, -0.02]} scale={[1, 0.4, 1]}>
          <sphereGeometry args={[0.06, 12, 8]} />
          <meshStandardMaterial color="#92400e" />
        </mesh>
      </group>
    )),
  )
}

/** Table et chaises (modèles du kit, primitives pendant le chargement ou en cas d'échec). */
export function TableFurniture({ table }: { table: FloorTable }) {
  return (
    <ViewErrorBoundary fallback={<PrimitiveFurniture table={table} />}>
      <Suspense fallback={<PrimitiveFurniture table={table} />}>
        <KitFurniture table={table} />
      </Suspense>
    </ViewErrorBoundary>
  )
}

type DiningTableProps = {
  table: TableView
  onSelect: (tableNumber: number) => void
}

/**
 * Table du plan : mobilier, anneau d'état au sol et zone de clic. Le détail
 * (numéro, attente, messages) est dans l'étiquette HTML (TableLabel).
 */
export function DiningTable({ table, onSelect }: DiningTableProps) {
  const style = TABLE_STATE_STYLES[table.state]
  const highlighted = table.state !== 'free' && table.state !== 'unknown'
  const [innerRadius, outerRadius] = RING_RADIUS[table.shape]
  const [width] = TABLE_SIZE[table.shape]

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
          <ringGeometry args={[innerRadius, outerRadius, 48]} />
          <meshBasicMaterial color={style.color} />
        </mesh>
      )}

      <TableFurniture table={table} />

      {table.occupancy?.status === 'OCCUPEE' && <SeatedGuests table={table} />}
      {table.occupancy?.status === 'A_DEBARRASSER' && <DirtyDishes table={table} />}

      {/* Zone de clic plus large que la table, utile au doigt sur mobile */}
      <mesh position-y={0.5}>
        <boxGeometry args={[width + 0.6, 1, 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
