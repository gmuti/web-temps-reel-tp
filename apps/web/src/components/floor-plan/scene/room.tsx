import type { Order } from '@app/shared'
import { Suspense, type ReactNode } from 'react'
import { ViewErrorBoundary } from '@/components/view-error-boundary'
import { KITCHEN, KITCHEN_COUNTER_Z, PASS_COUNTER, ROOM } from '../floor-plan-data'
import { TABLE_STATE_STYLES } from '../table-states'
import { KitModel, type KitModelName } from './kit-model'

const WALL_HEIGHT = 1
const WALL_THICKNESS = 0.15

// Hauteurs des modules du kit une fois à l'échelle (plan de travail, comptoir du passe).
const COUNTER_HEIGHT = 0.99
const PASS_HEIGHT = 0.92

// Plan de travail le long du mur du fond, de gauche à droite, en modules de 0,95 m,
// puis le frigo. Le frigo (2 m) est à droite : dans le coin arrière gauche, le
// plus haut de l'écran en vue iso, il sortirait du cadre.
const MODULE_WIDTH = 0.946
const KITCHEN_ROW_START_X = -7.15
const KITCHEN_ROW: readonly KitModelName[] = [
  'kitchenCabinet',
  'kitchenCabinet',
  'kitchenCabinet',
  'kitchenStove',
  'kitchenStove',
  'kitchenCabinet',
  'kitchenSink',
  'kitchenCabinet',
  'kitchenCabinet',
  'kitchenStove',
  'kitchenStove',
  'kitchenCabinet',
  'kitchenCabinet',
  'kitchenCabinet',
  'kitchenCabinet',
]
const moduleX = (index: number) => KITCHEN_ROW_START_X + index * MODULE_WIDTH
// Fourneaux, dans l'ordre où ils s'allument quand des commandes passent en préparation.
const STOVES_X = KITCHEN_ROW.flatMap((name, index) => (name === 'kitchenStove' ? [moduleX(index)] : []))
const COFFEE_MACHINE_X = moduleX(12)
const FRIDGE_X = 7.14

// Passe : 7 modules de comptoir et une extrémité de chaque côté.
const PASS_MODULES = 7
const PASS_END_WIDTH = 0.224
const passModuleX = (index: number) => PASS_COUNTER.x + (index - (PASS_MODULES - 1) / 2) * MODULE_WIDTH
const PASS_HALF_WIDTH = (PASS_MODULES * MODULE_WIDTH) / 2

const PLANTS: readonly [number, number][] = [
  [-7.5, 5.5],
  [7.5, 5.5],
  [7.5, -2.9],
  [-7.5, -2.9],
]

// Orientation des modules du kit pour que leur façade donne sur la salle (+z).
const KITCHEN_MODEL_ROTATION = 0

// Au-delà, les tickets et assiettes se chevaucheraient : les étiquettes donnent le compte exact.
const MAX_TICKETS = 12
const MAX_PLATES = 10

// Modèles du kit, avec une primitive pendant le chargement ou en cas d'échec.
function WithFallback({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <ViewErrorBoundary fallback={fallback}>
      <Suspense fallback={fallback}>{children}</Suspense>
    </ViewErrorBoundary>
  )
}

function KitchenFurniture() {
  return (
    <group>
      {KITCHEN_ROW.map((name, index) => (
        <KitModel
          key={index}
          name={name}
          position={[moduleX(index), 0, KITCHEN_COUNTER_Z]}
          rotation-y={KITCHEN_MODEL_ROTATION}
        />
      ))}
      <KitModel
        name="kitchenFridgeLarge"
        position={[FRIDGE_X, 0, KITCHEN_COUNTER_Z]}
        rotation-y={KITCHEN_MODEL_ROTATION}
      />
      <KitModel
        name="kitchenCoffeeMachine"
        position={[COFFEE_MACHINE_X, COUNTER_HEIGHT, KITCHEN_COUNTER_Z]}
        rotation-y={KITCHEN_MODEL_ROTATION}
      />
    </group>
  )
}

function PassFurniture() {
  return (
    <group>
      {Array.from({ length: PASS_MODULES }, (_, index) => (
        <KitModel
          key={index}
          name="kitchenBar"
          position={[passModuleX(index), 0, PASS_COUNTER.z]}
          rotation-y={KITCHEN_MODEL_ROTATION}
        />
      ))}
      <KitModel
        name="kitchenBarEnd"
        position={[PASS_COUNTER.x - PASS_HALF_WIDTH - PASS_END_WIDTH / 2, 0, PASS_COUNTER.z]}
        rotation-y={KITCHEN_MODEL_ROTATION}
      />
      <KitModel
        name="kitchenBarEnd"
        position={[PASS_COUNTER.x + PASS_HALF_WIDTH + PASS_END_WIDTH / 2, 0, PASS_COUNTER.z]}
        rotation-y={KITCHEN_MODEL_ROTATION + Math.PI}
      />
    </group>
  )
}

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

      <WithFallback
        fallback={
          <mesh position={[0, COUNTER_HEIGHT / 2, KITCHEN_COUNTER_Z]}>
            <boxGeometry args={[ROOM.width - 1, COUNTER_HEIGHT, 0.9]} />
            <meshStandardMaterial color="#90a4ae" />
          </mesh>
        }
      >
        <KitchenFurniture />
      </WithFallback>

      {/* Feux des fourneaux, allumés s'il y a des commandes en préparation */}
      {STOVES_X.map((x, index) => (
        <mesh key={x} position={[x, COUNTER_HEIGHT + 0.01, KITCHEN_COUNTER_Z]}>
          <cylinderGeometry args={[0.3, 0.3, 0.02, 24]} />
          <meshStandardMaterial
            color={index < cookingCount ? '#ef4444' : '#37474f'}
            emissive={index < cookingCount ? '#f97316' : '#000000'}
            emissiveIntensity={index < cookingCount ? 0.8 : 0}
            transparent
            opacity={index < cookingCount ? 0.9 : 0}
          />
        </mesh>
      ))}

      <WithFallback
        fallback={
          <mesh position={[PASS_COUNTER.x, PASS_HEIGHT / 2, PASS_COUNTER.z]}>
            <boxGeometry args={[PASS_COUNTER.width, PASS_HEIGHT, PASS_COUNTER.depth]} />
            <meshStandardMaterial color="#8d6e63" />
          </mesh>
        }
      >
        <PassFurniture />
      </WithFallback>

      {/* Passe-plat : une assiette par commande prête */}
      {passPlates.slice(0, MAX_PLATES).map((order, index) => (
        <mesh
          key={order.id}
          position={[PASS_COUNTER.x - PASS_COUNTER.width / 2 + 0.45 + index * 0.68, PASS_HEIGHT + 0.03, PASS_COUNTER.z]}
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

      {/* Plantes aux angles, pour l'ambiance */}
      <WithFallback fallback={null}>
        {PLANTS.map(([x, z]) => (
          <KitModel key={`${x}:${z}`} name="pottedPlant" position={[x, 0, z]} />
        ))}
      </WithFallback>
    </group>
  )
}
