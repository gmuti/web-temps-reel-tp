import type { Order } from '@app/shared'
import { KITCHEN, KITCHEN_COUNTER_Z, PASS_COUNTER, ROOM } from '../floor-plan-data'
import { TABLE_STATE_STYLES } from '../table-states'

const WALL_HEIGHT = 1
const WALL_THICKNESS = 0.15
const COUNTER_HEIGHT = 0.9
const STOVES_X = [-5, -2.5, 2.5, 5]

// Au-delà, les tickets et assiettes se chevaucheraient : les étiquettes donnent le compte exact.
const MAX_TICKETS = 12
const MAX_PLATES = 10

type RoomProps = {
  kitchenTickets: Order[]
  passPlates: Order[]
}

/**
 * Décor de la salle et de la cuisine. La cuisine montre les commandes validées
 * ou en préparation (tickets au-dessus du passe, fourneaux allumés), le passe
 * les commandes prêtes (une assiette par commande).
 */
export function Room({ kitchenTickets, passPlates }: RoomProps) {
  const cookingCount = kitchenTickets.filter((order) => order.status === 'EN_PREPARATION').length
  const counterZ = KITCHEN_COUNTER_Z

  return (
    <group>
      {/* Sol de la salle et de la cuisine */}
      <mesh rotation-x={-Math.PI / 2} position-y={-0.01}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color="#e9dfcf" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[KITCHEN.x, 0, KITCHEN.z]}>
        <planeGeometry args={[KITCHEN.width, KITCHEN.depth]} />
        <meshStandardMaterial color="#cfd8dc" />
      </mesh>

      {/* Murs du fond et de gauche, bas pour ne rien masquer en vue iso */}
      <mesh position={[0, WALL_HEIGHT / 2, -ROOM.depth / 2 - WALL_THICKNESS / 2]}>
        <boxGeometry args={[ROOM.width + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color="#b0a597" />
      </mesh>
      <mesh position={[-ROOM.width / 2 - WALL_THICKNESS / 2, WALL_HEIGHT / 2, 0]}>
        <boxGeometry args={[WALL_THICKNESS, WALL_HEIGHT, ROOM.depth]} />
        <meshStandardMaterial color="#b0a597" />
      </mesh>

      {/* Plan de travail et fourneaux, allumés s'il y a des commandes en préparation */}
      <mesh position={[0, COUNTER_HEIGHT / 2, counterZ]}>
        <boxGeometry args={[ROOM.width - 1, COUNTER_HEIGHT, 0.8]} />
        <meshStandardMaterial color="#90a4ae" />
      </mesh>
      {STOVES_X.map((x, index) => (
        <mesh key={x} position={[x, COUNTER_HEIGHT + 0.03, counterZ]}>
          <cylinderGeometry args={[0.25, 0.25, 0.06, 24]} />
          <meshStandardMaterial
            color={index < cookingCount ? '#ef4444' : '#37474f'}
            emissive={index < cookingCount ? '#f97316' : '#000000'}
            emissiveIntensity={index < cookingCount ? 0.8 : 0}
          />
        </mesh>
      ))}

      {/* Passe-plat : une assiette par commande prête */}
      <mesh position={[PASS_COUNTER.x, COUNTER_HEIGHT / 2, PASS_COUNTER.z]}>
        <boxGeometry args={[PASS_COUNTER.width, COUNTER_HEIGHT, PASS_COUNTER.depth]} />
        <meshStandardMaterial color="#8d6e63" />
      </mesh>
      {passPlates.slice(0, MAX_PLATES).map((order, index) => (
        <mesh
          key={order.id}
          position={[
            PASS_COUNTER.x - PASS_COUNTER.width / 2 + 0.45 + index * 0.68,
            COUNTER_HEIGHT + 0.03,
            PASS_COUNTER.z,
          ]}
        >
          <cylinderGeometry args={[0.25, 0.2, 0.05, 24]} />
          <meshStandardMaterial color="#ffffff" />
        </mesh>
      ))}

      {/* Rail à tickets au-dessus du passe, côté cuisine */}
      {kitchenTickets.slice(0, MAX_TICKETS).map((order, index) => (
        <mesh
          key={order.id}
          position={[PASS_COUNTER.x - PASS_COUNTER.width / 2 + 0.35 + index * 0.57, 1.55, PASS_COUNTER.z - 0.2]}
        >
          <boxGeometry args={[0.35, 0.45, 0.02]} />
          <meshStandardMaterial
            color={
              order.status === 'EN_PREPARATION' ? TABLE_STATE_STYLES.cooking.color : TABLE_STATE_STYLES.validated.color
            }
          />
        </mesh>
      ))}
    </group>
  )
}
