import type { ChatAuthor, Order, OrderJournalEvent, UserRole } from '@app/shared'
import { Canvas } from '@react-three/fiber'
import { LocateFixedIcon, Rotate3dIcon, ScanIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useNow } from '@/lib/use-now'
import type { ConnectionState } from '@/lib/use-realtime-socket'
import { Button } from '@/components/ui/button'
import {
  FLOOR_TABLES,
  KITCHEN_COUNTER_Z,
  KITCHEN_LABEL_POSITION,
  PASS_COUNTER,
  PASS_LABEL_POSITION,
} from './floor-plan-data'
import { buildScene, placeStaff } from './floor-scene-model'
import { admitEffect, effectOfEvent } from './order-effects'
import { LabelProjector, SceneLabel, type LabelAnchors } from './scene-labels'
import { TableLabel } from './table-label'
import { CameraRig, type CameraFocus, type CameraMode } from './scene/camera-rig'
import { DiningTable } from './scene/dining-table'
import { Effects, type ActiveEffect } from './scene/effects'
import { Room } from './scene/room'
import { Staff } from './scene/staff'

const CAMERA_MODE_STORAGE_KEY = 'floorPlan.cameraMode'

// La cuisine voit d'abord sa zone : plan de travail, rail à tickets et passe.
const KITCHEN_FOCUS: CameraFocus = { x: 0, z: (KITCHEN_COUNTER_Z + PASS_COUNTER.z) / 2, zoom: 1.8 }

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function readCameraMode(): CameraMode {
  try {
    return localStorage.getItem(CAMERA_MODE_STORAGE_KEY) === 'free' ? 'free' : 'iso'
  } catch {
    return 'iso'
  }
}

export type FloorPlan3DProps = {
  orders: Order[]
  unread: Record<string, number>
  // Personnes connectées (présence du chat).
  online: ChatAuthor[]
  role: UserRole
  connection: ConnectionState
  // Faux quand un dialog recouvre la scène.
  interactive: boolean
  onSelectTable: (tableNumber: number) => void
  // Le navigateur a retiré le contexte WebGL (onglet en arrière-plan, mémoire) :
  // la vue appelante repasse sur le kanban.
  onContextLost: () => void
  // Événements reçus en direct (pas ceux d'un rattrapage), pour les animations.
  subscribeToOrderEvents: (listener: (entry: OrderJournalEvent) => void) => () => void
}

/**
 * Plan 3D de la salle (chargé à la demande : three pèse ~240 Ko gzip). Il ne
 * fait qu'afficher l'état d'OrderBoard ; les détails s'ouvrent dans un dialog HTML.
 * Rendu à la demande (`frameloop="demand"`) : rien n'est redessiné tant que
 * rien ne change, ce qui ménage la batterie sur mobile.
 */
export default function FloorPlan3D({
  orders,
  unread,
  online,
  role,
  connection,
  interactive,
  onSelectTable,
  onContextLost,
  subscribeToOrderEvents,
}: FloorPlan3DProps) {
  const scene = useMemo(() => buildScene(FLOOR_TABLES, orders, unread, role), [orders, unread, role])
  const now = useNow(15_000)
  const [cameraMode, setCameraMode] = useState<CameraMode>(readCameraMode)
  const [resetSignal, setResetSignal] = useState(0)
  const isOffline = connection !== 'connected'
  const [anchors] = useState<LabelAnchors>(() => new Map())
  const cookingCount = scene.kitchenTickets.filter((order) => order.status === 'EN_PREPARATION').length
  const validatedCount = scene.kitchenTickets.length - cookingCount
  const [glCanvas, setGlCanvas] = useState<HTMLCanvasElement | null>(null)
  const staff = useMemo(() => placeStaff(online), [online])

  // Animations des événements en direct. L'état avant l'événement donne la
  // table d'une commande (un changement de statut ne la porte pas, et une
  // commande servie a déjà quitté l'état suivant).
  const [effects, setEffects] = useState<ActiveEffect[]>([])
  const ordersRef = useRef(orders)
  const recentEffectsRef = useRef<number[]>([])
  const nextEffectIdRef = useRef(0)

  useEffect(() => {
    ordersRef.current = orders
  }, [orders])

  useEffect(
    () =>
      subscribeToOrderEvents((entry) => {
        if (document.hidden || prefersReducedMotion()) return
        const effect = effectOfEvent(entry, FLOOR_TABLES, ordersRef.current)
        if (!effect) return
        const admitted = admitEffect(recentEffectsRef.current, performance.now())
        if (!admitted) return
        recentEffectsRef.current = admitted
        const id = nextEffectIdRef.current++
        setEffects((current) => [...current, { ...effect, id }])
      }),
    [subscribeToOrderEvents],
  )

  const removeEffect = useCallback((id: number) => setEffects((current) => current.filter((e) => e.id !== id)), [])

  // Perte du contexte WebGL pendant que le plan est affiché. L'écouteur est
  // retiré au démontage : React Three Fiber libère alors lui-même le contexte,
  // ce qui n'est pas une panne.
  useEffect(() => {
    if (!glCanvas) return
    const handleContextLost = (event: Event) => {
      event.preventDefault()
      onContextLost()
    }
    glCanvas.addEventListener('webglcontextlost', handleContextLost)
    return () => glCanvas.removeEventListener('webglcontextlost', handleContextLost)
  }, [glCanvas, onContextLost])

  // Les étiquettes sont au-dessus du canvas : sans relais, la molette y ferait
  // défiler la page au lieu de zoomer sur le plan.
  const labelLayerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const layer = labelLayerRef.current
    if (!layer || !glCanvas) return
    const forwardWheel = (event: WheelEvent) => {
      event.preventDefault()
      glCanvas.dispatchEvent(new WheelEvent('wheel', event))
    }
    layer.addEventListener('wheel', forwardWheel, { passive: false })
    return () => layer.removeEventListener('wheel', forwardWheel)
  }, [glCanvas])

  const toggleCameraMode = () => {
    const next = cameraMode === 'iso' ? 'free' : 'iso'
    setCameraMode(next)
    try {
      localStorage.setItem(CAMERA_MODE_STORAGE_KEY, next)
    } catch {
      // Stockage indisponible (navigation privée) : le choix n'est simplement pas mémorisé.
    }
  }

  return (
    <div className="bg-muted/50 relative h-[min(72svh,720px)] min-h-[420px] min-w-0 overflow-hidden rounded-lg">
      <Canvas
        orthographic
        camera={{ position: [30, 30, 30], zoom: 30, near: 0.1, far: 200 }}
        frameloop="demand"
        dpr={[1, 2]}
        className={cn('transition-[filter]', isOffline && 'grayscale')}
        style={{ touchAction: 'none' }}
        onCreated={({ gl }) => setGlCanvas(gl.domElement)}
      >
        <ambientLight intensity={1.4} />
        <directionalLight position={[6, 12, 4]} intensity={1.8} />
        <CameraRig
          mode={cameraMode}
          focus={role === 'COOK' ? KITCHEN_FOCUS : undefined}
          resetSignal={resetSignal}
          enabled={interactive}
        />
        <Room kitchenTickets={scene.kitchenTickets} passPlates={scene.passPlates} />
        {scene.tables.map((table) => (
          <DiningTable key={table.number} table={table} onSelect={onSelectTable} />
        ))}
        <Staff staff={staff} />
        <Effects effects={effects} onDone={removeEffect} />
        <LabelProjector anchors={anchors} />
      </Canvas>

      {/* Étiquettes HTML, placées au-dessus des objets de la scène par LabelProjector */}
      <div
        ref={labelLayerRef}
        className={cn('pointer-events-none absolute inset-0 overflow-hidden', isOffline && 'grayscale')}
      >
        {scene.tables.map((table) => (
          <SceneLabel
            key={table.number}
            anchors={anchors}
            id={`table:${table.number}`}
            position={[table.x, 1.6, table.z]}
          >
            <TableLabel table={table} now={now} onSelect={onSelectTable} />
          </SceneLabel>
        ))}
        <SceneLabel anchors={anchors} id="kitchen" position={KITCHEN_LABEL_POSITION}>
          <div className="bg-background/90 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-sm">
            <span className="font-semibold">Cuisine</span> · {cookingCount} en préparation · {validatedCount} validée
            {validatedCount > 1 ? 's' : ''}
          </div>
        </SceneLabel>
        {staff.map(({ user, x, z }) => (
          <SceneLabel key={user.id} anchors={anchors} id={`staff:${user.id}`} position={[x, 1.75, z]}>
            <span className="bg-background/80 rounded px-1 text-[10px] whitespace-nowrap">
              {user.name.split(' ')[0]}
            </span>
          </SceneLabel>
        ))}
        <SceneLabel anchors={anchors} id="pass" position={PASS_LABEL_POSITION}>
          <div className="bg-background/90 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-sm">
            <span className="font-semibold">Passe</span> ·{' '}
            {scene.passPlates.length === 0
              ? 'rien à servir'
              : `à servir : ${scene.passPlates.map((order) => `T${order.tableNumber}`).join(', ')}`}
          </div>
        </SceneLabel>
      </div>

      <div className="absolute top-3 right-3 flex gap-2">
        <Button size="sm" variant="outline" onClick={toggleCameraMode} aria-pressed={cameraMode === 'free'}>
          {cameraMode === 'iso' ? <Rotate3dIcon /> : <ScanIcon />}
          {cameraMode === 'iso' ? 'Caméra libre' : 'Vue iso'}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setResetSignal((n) => n + 1)} aria-label="Recentrer la vue">
          <LocateFixedIcon />
          <span className="hidden sm:inline">Recentrer</span>
        </Button>
      </div>

      {scene.offPlan.length > 0 && (
        <div className="bg-background/90 absolute bottom-3 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-lg p-2 text-xs shadow-sm">
          <span className="font-semibold">Hors plan</span>
          {[...new Set(scene.offPlan.map((order) => order.tableNumber))].map((tableNumber) => (
            <Button key={tableNumber} size="xs" variant="outline" onClick={() => onSelectTable(tableNumber)}>
              Table {tableNumber}
            </Button>
          ))}
        </div>
      )}

      {isOffline && (
        <div className="bg-background/40 absolute inset-0 flex items-center justify-center">
          <span className="bg-background rounded-md px-3 py-1.5 text-sm font-medium shadow-sm">
            {connection === 'offline' ? 'Déconnecté' : 'Reconnexion…'}
          </span>
        </div>
      )}
    </div>
  )
}
