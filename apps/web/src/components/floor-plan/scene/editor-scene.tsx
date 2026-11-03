import { TABLE_FOOTPRINT, type FloorTable } from '@app/shared'
import type { ThreeEvent } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { ROOM } from '../floor-plan-data'
import { TableFurniture } from './dining-table'

const SELECTED_COLOR = '#2563eb'
const FAULTY_COLOR = '#dc2626'
const FOOTPRINT_COLOR = '#94a3b8'

type EditorSceneProps = {
  tables: FloorTable[]
  selected: number | null
  // Tables en défaut (chevauchement, doublon, hors de la salle).
  faulty: Set<number>
  onSelect: (tableNumber: number | null) => void
  // Position visée par le glissé ; l'appelant l'accroche à la grille.
  onMove: (tableNumber: number, x: number, z: number) => void
}

/**
 * Éditeur de plan, dans le canvas (vue de dessus). Un appui sur une table la
 * sélectionne et commence le glissé ; un plan invisible au sol suit le pointeur
 * (lancer de rayons) et déplace la table. L'emprise au sol de chaque table
 * (chaises et place pour servir comprises) est dessinée : c'est elle qui ne doit
 * pas chevaucher les autres.
 */
export function EditorScene({ tables, selected, faulty, onSelect, onMove }: EditorSceneProps) {
  // Table en cours de glissé et décalage entre le pointeur et son centre.
  const dragRef = useRef<{ tableNumber: number; dx: number; dz: number } | null>(null)

  // Le glissé s'arrête aussi si le bouton est relâché hors du canvas.
  useEffect(() => {
    const endDrag = () => {
      dragRef.current = null
    }
    window.addEventListener('pointerup', endDrag)
    return () => window.removeEventListener('pointerup', endDrag)
  }, [])

  const startDrag = (table: FloorTable) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation()
    onSelect(table.number)
    dragRef.current = { tableNumber: table.number, dx: table.x - event.point.x, dz: table.z - event.point.z }
  }

  const drag = (event: ThreeEvent<PointerEvent>) => {
    const current = dragRef.current
    if (current) onMove(current.tableNumber, event.point.x + current.dx, event.point.z + current.dz)
  }

  return (
    <group>
      {/* Grille de repère, un trait tous les 50 cm */}
      <gridHelper args={[ROOM.width, ROOM.width * 2, '#cbd5e1', '#e2e8f0']} position-y={0.004} />

      {tables.map((table) => {
        const [width, depth] = TABLE_FOOTPRINT[table.shape]
        const color = faulty.has(table.number)
          ? FAULTY_COLOR
          : table.number === selected
            ? SELECTED_COLOR
            : FOOTPRINT_COLOR
        return (
          <group key={table.number} position={[table.x, 0, table.z]} onPointerDown={startDrag(table)}>
            <mesh rotation-x={-Math.PI / 2} position-y={0.008}>
              <planeGeometry args={[width, depth]} />
              <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
            </mesh>
            <TableFurniture table={table} />
          </group>
        )
      })}

      {/* Sol de capture : suit le pointeur pendant un glissé ; un appui dans le vide désélectionne. */}
      <mesh rotation-x={-Math.PI / 2} position-y={0.002} onPointerMove={drag} onPointerDown={() => onSelect(null)}>
        <planeGeometry args={[ROOM.width * 2, ROOM.depth * 2]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  )
}
