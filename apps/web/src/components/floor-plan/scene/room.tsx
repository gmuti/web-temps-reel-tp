import type { Order } from '@app/shared'
import { useFrame, useThree } from '@react-three/fiber'
import { Suspense, useRef, type ReactNode } from 'react'
import type { Group, Mesh } from 'three'
import { ViewErrorBoundary } from '@/components/view-error-boundary'
import {
  COUNTER_HEIGHT,
  KITCHEN,
  KITCHEN_COUNTER_Z,
  kitchenModuleX,
  MODULE_WIDTH,
  PASS_COUNTER,
  PASS_HEIGHT,
  PREP_ISLAND,
  ROOM,
  STOVE_MODULES,
  STOVES_X,
  TICKET_RAIL_Y,
  TICKET_RAIL_Z,
} from '../floor-plan-data'
import { TABLE_STATE_STYLES } from '../table-states'
import { KitModel, type KitModelName } from './kit-model'

const WALL_HEIGHT = 1
const WALL_THICKNESS = 0.15

// Plan de travail le long du mur du fond, de gauche à droite, en modules de 0,95 m,
// puis le frigo. Trois fourneaux espacés (STOVE_MODULES), un évier entre les deux
// premiers. Le frigo (2 m) est à droite : dans le coin arrière gauche, le plus
// haut de l'écran en vue iso, il sortirait du cadre.
const KITCHEN_ROW: readonly KitModelName[] = Array.from({ length: 15 }, (_, index) =>
  (STOVE_MODULES as readonly number[]).includes(index)
    ? 'kitchenStove'
    : index === 5
      ? 'kitchenSink'
      : 'kitchenCabinet',
)
const moduleX = kitchenModuleX
const COFFEE_MACHINE_X = moduleX(13)
const FRIDGE_X = 7.14

// Îlot de préparation : 5 modules de comptoir et une extrémité de chaque côté.
const ISLAND_MODULES = 5
const islandModuleX = (index: number) => PREP_ISLAND.x + (index - (ISLAND_MODULES - 1) / 2) * MODULE_WIDTH
const ISLAND_HALF_WIDTH = (ISLAND_MODULES * MODULE_WIDTH) / 2

const FLAME_COLOR = '#ff7a1a'
// Gris chaud : visible sur le plan de travail clair, distinct du gris « libre ».
const SMOKE_COLOR = '#a8a29e'
const SMOKE_PUFFS = 3
const SMOKE_PERIOD_S = 2.4

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

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

function IslandFurniture() {
  return (
    <group>
      {Array.from({ length: ISLAND_MODULES }, (_, index) => (
        <KitModel key={index} name="kitchenBar" position={[islandModuleX(index), 0, PREP_ISLAND.z]} />
      ))}
      <KitModel
        name="kitchenBarEnd"
        position={[PREP_ISLAND.x - ISLAND_HALF_WIDTH - PASS_END_WIDTH / 2, 0, PREP_ISLAND.z]}
      />
      <KitModel
        name="kitchenBarEnd"
        position={[PREP_ISLAND.x + ISLAND_HALF_WIDTH + PASS_END_WIDTH / 2, 0, PREP_ISLAND.z]}
        rotation-y={Math.PI}
      />
    </group>
  )
}

// Feu d'un fourneau : éteint, ou flamme orange qui vacille et petite fumée qui monte.
// Sans animation (prefers-reduced-motion) : flamme fixe, pas de fumée.
function StoveFire({ x, lit }: { x: number; lit: boolean }) {
  const flameRef = useRef<Mesh>(null)
  const smokeRef = useRef<Group>(null)
  const invalidate = useThree((state) => state.invalidate)
  const animated = lit && !prefersReducedMotion()

  useFrame(() => {
    if (!animated) return
    const t = performance.now() / 1000
    const flame = flameRef.current
    if (flame) flame.scale.y = 1 + 0.25 * Math.sin(t * 13 + x) * Math.sin(t * 7.3)
    smokeRef.current?.children.forEach((puff, index) => {
      const phase = (((t / SMOKE_PERIOD_S + index / SMOKE_PUFFS) % 1) + 1) % 1
      puff.position.set(0.05 * Math.sin(t + index * 2), 0.15 + phase * 0.9, 0)
      puff.scale.setScalar(0.6 + phase * 0.9)
      const material = (puff as Mesh).material as { opacity: number }
      material.opacity = 0.6 * (1 - phase)
    })
    invalidate()
  })

  if (!lit) return null
  return (
    <group position={[x, COUNTER_HEIGHT + 0.02, KITCHEN_COUNTER_Z]}>
      <mesh ref={flameRef} position-y={0.06}>
        <coneGeometry args={[0.16, 0.14, 16]} />
        <meshStandardMaterial color={FLAME_COLOR} emissive={FLAME_COLOR} emissiveIntensity={0.9} />
      </mesh>
      {animated && (
        <group ref={smokeRef}>
          {Array.from({ length: SMOKE_PUFFS }, (_, index) => (
            <mesh key={index}>
              <sphereGeometry args={[0.09, 10, 8]} />
              <meshStandardMaterial color={SMOKE_COLOR} transparent opacity={0} depthWrite={false} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  )
}

type RoomProps = {
  kitchenTickets: Order[]
  passPlates: Order[]
}

/**
 * Décor de la salle et de la cuisine. La cuisine montre les commandes validées
 * ou en préparation (tickets au-dessus du passe, fourneaux allumés avec flamme et
 * fumée), l'îlot de préparation est au centre, le passe
 * les commandes prêtes (une assiette par commande).
 */
export function Room({ kitchenTickets, passPlates }: RoomProps) {
  const cookingCount = kitchenTickets.filter((order) => order.status === 'EN_PREPARATION').length

  return (
    <group>
      {/* Sol de la salle et de la cuisine */}
      <mesh rotation-x={-Math.PI / 2} position={[0, -0.01, ROOM.centerZ]}>
        <planeGeometry args={[ROOM.width, ROOM.depth]} />
        <meshStandardMaterial color="#e9dfcf" />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position={[KITCHEN.x, 0, KITCHEN.z]}>
        <planeGeometry args={[KITCHEN.width, KITCHEN.depth]} />
        <meshStandardMaterial color="#cfd8dc" />
      </mesh>

      {/* Murs du fond et de gauche, bas pour ne rien masquer en vue iso */}
      <mesh position={[0, WALL_HEIGHT / 2, ROOM.minZ - WALL_THICKNESS / 2]}>
        <boxGeometry args={[ROOM.width + WALL_THICKNESS * 2, WALL_HEIGHT, WALL_THICKNESS]} />
        <meshStandardMaterial color="#b0a597" />
      </mesh>
      <mesh position={[-ROOM.width / 2 - WALL_THICKNESS / 2, WALL_HEIGHT / 2, ROOM.centerZ]}>
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

      {/* Feux des fourneaux : un fourneau allumé par commande en préparation (trois au plus) */}
      {STOVES_X.map((x, index) => (
        <StoveFire key={x} x={x} lit={index < cookingCount} />
      ))}

      <WithFallback
        fallback={
          <mesh position={[PREP_ISLAND.x, PASS_HEIGHT / 2, PREP_ISLAND.z]}>
            <boxGeometry args={[PREP_ISLAND.width, PASS_HEIGHT, PREP_ISLAND.depth]} />
            <meshStandardMaterial color="#8d6e63" />
          </mesh>
        }
      >
        <IslandFurniture />
      </WithFallback>

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
          position={[PASS_COUNTER.x - PASS_COUNTER.width / 2 + 0.35 + index * 0.57, TICKET_RAIL_Y, TICKET_RAIL_Z]}
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
