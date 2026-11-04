import {
  canRoleEditFloorPlan,
  type ChatAuthor,
  type FloorPlan,
  type Order,
  type OrderJournalEvent,
  type TableState,
  type TableStatusUpdatedEvent,
  type UserRole,
} from '@app/shared'
import { Canvas } from '@react-three/fiber'
import { ChefHatIcon, PencilIcon, Rotate3dIcon, ScanIcon } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { useNow } from '@/lib/use-now'
import type { ConnectionState } from '@/lib/use-realtime-socket'
import { Button } from '@/components/ui/button'
import { KITCHEN_LABEL_POSITION, PASS_LABEL_POSITION, STAFF_LABEL_Y } from './floor-plan-data'
import { EditorPanel } from './editor-panel'
import { buildScene, placeStaff, type StaffView } from './floor-scene-model'
import { admitEffect, effectOfEvent, effectOfTableEvent, type SceneEffect } from './order-effects'
import { LabelProjector, SceneLabel, type LabelAnchors } from './scene-labels'
import { TableLabel } from './table-label'
import { CameraRig, type CameraMode, type CameraShot, type PanelLayout } from './scene/camera-rig'
import { DiningTable } from './scene/dining-table'
import { EditorScene } from './scene/editor-scene'
import { Effects, type ActiveEffect } from './scene/effects'
import { Room } from './scene/room'
import { Staff, type StaffTrip } from './scene/staff'
import { destinationsOf, planTrip, positionAt } from './staff-routes'
import { useFloorEditor } from './use-floor-editor'

const CAMERA_MODE_STORAGE_KEY = 'floorPlan.cameraMode'

// Au-delà de ce déplacement (en pixels), le geste est un glissé de caméra, pas un clic dans le vide.
const CLICK_MAX_DRAG = 6

// Éléments flottants au-dessus de la scène (handoff § 3.4) : fond blanc, pilule, ombre portée.
const FLOATING = 'bg-background rounded-full shadow-[0_6px_18px_-8px_rgba(0,0,0,0.35)]'

// Place réservée à gauche de la vue de dessus pour le panneau de l'éditeur (w-72 et marges).
const EDITOR_PANEL_INSET = 312

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function readCameraMode(): CameraMode {
  try {
    return localStorage.getItem(CAMERA_MODE_STORAGE_KEY) === 'free' ? 'free' : 'iso'
  } catch {
    return 'iso'
  }
}

export type FloorPlan3DProps = {
  // Plan de salle (useFloorPlan) : null pendant le chargement.
  floorPlan: FloorPlan | null
  floorPlanError: Error | null
  onReloadFloorPlan: () => Promise<void>
  orders: Order[]
  // Occupation des tables, par numéro (useTablesRealtime).
  tableStates: Record<number, TableState>
  unread: Record<string, number>
  // Personnes connectées (présence du chat).
  online: ChatAuthor[]
  role: UserRole
  connection: ConnectionState
  // Table dont le panneau est ouvert : la caméra la centre à côté du panneau.
  selectedTable: number | null
  panel: PanelLayout
  onSelectTable: (tableNumber: number) => void
  // Clic dans le vide (pas un glissé) ou bouton de cadrage : le panneau se ferme.
  onDeselect: () => void
  // Le navigateur a retiré le contexte WebGL (onglet en arrière-plan, mémoire) :
  // la vue appelante repasse sur le kanban.
  onContextLost: () => void
  // Événements reçus en direct (pas ceux d'un rattrapage), pour les animations.
  subscribeToOrderEvents: (listener: (entry: OrderJournalEvent) => void) => () => void
  subscribeToTableEvents: (listener: (event: TableStatusUpdatedEvent) => void) => () => void
}

/**
 * Plan 3D de la salle (chargé à la demande : three pèse ~240 Ko gzip). Il ne
 * fait qu'afficher l'état d'OrderBoard ; les détails s'ouvrent dans un dialog HTML.
 * Rendu à la demande (`frameloop="demand"`) : rien n'est redessiné tant que
 * rien ne change, ce qui ménage la batterie sur mobile.
 */
export default function FloorPlan3D({
  floorPlan,
  floorPlanError,
  onReloadFloorPlan,
  orders,
  tableStates,
  unread,
  online,
  role,
  connection,
  selectedTable,
  panel,
  onSelectTable,
  onDeselect,
  onContextLost,
  subscribeToOrderEvents,
  subscribeToTableEvents,
}: FloorPlan3DProps) {
  const tables = floorPlan?.tables ?? null
  // Éditeur de plan (MANAGER) : un brouillon remplace les tables tant qu'il est ouvert.
  const editor = useFloorEditor(floorPlan, onReloadFloorPlan)
  const editing = editor.draft !== null
  const editingRef = useRef(editing)

  const scene = useMemo(
    () => buildScene(tables ?? [], orders, unread, role, tableStates),
    [tables, orders, unread, role, tableStates],
  )
  const now = useNow(15_000)
  const [cameraMode, setCameraMode] = useState<CameraMode>(readCameraMode)
  const [resetSignal, setResetSignal] = useState(0)
  // Cadrage de base, repris à la fermeture du panneau : la cuisine pour le cuisinier, la salle sinon.
  const [baseShot, setBaseShot] = useState<'room' | 'kitchen'>(role === 'COOK' ? 'kitchen' : 'room')
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
  const tablesRef = useRef(tables)
  const staffRef = useRef(staff)
  const recentEffectsRef = useRef<number[]>([])
  const nextEffectIdRef = useRef(0)

  useEffect(() => {
    ordersRef.current = orders
    tablesRef.current = tables
    staffRef.current = staff
    editingRef.current = editing
  }, [orders, tables, staff, editing])

  const playEffect = useCallback((effect: SceneEffect | null) => {
    if (!effect || editingRef.current || document.hidden || prefersReducedMotion()) return
    const admitted = admitEffect(recentEffectsRef.current, performance.now())
    if (!admitted) return
    recentEffectsRef.current = admitted
    const id = nextEffectIdRef.current++
    setEffects((current) => [...current, { ...effect, id }])
  }, [])

  // Déplacements du personnel : l'auteur d'un événement, s'il est connecté, va
  // sur place (table, fourneau, passe) puis revient à son poste. Un nouvel
  // événement repart de là où il se trouve.
  const [trips, setTrips] = useState<Record<string, StaffTrip>>({})
  const tripsRef = useRef(trips)

  useEffect(() => {
    tripsRef.current = trips
  }, [trips])

  const startTrip = useCallback((actorId: string, entry: OrderJournalEvent | TableStatusUpdatedEvent) => {
    if (editingRef.current || document.hidden || prefersReducedMotion()) return
    const member: StaffView | undefined = staffRef.current.find((candidate) => candidate.user.id === actorId)
    if (!member) return
    const destinations = destinationsOf(entry, member.user.role, tablesRef.current ?? [], ordersRef.current)
    if (destinations.length === 0) return
    const now = performance.now()
    const current = tripsRef.current[actorId]
    const from = current ? positionAt(current.waypoints, now - current.startedAt) : member
    const home = { x: member.x, z: member.z }
    setTrips((all) => ({ ...all, [actorId]: { waypoints: planTrip(from, destinations, home), startedAt: now } }))
  }, [])

  // Fin d'un trajet ; ignorée si un trajet plus récent l'a déjà remplacé.
  const endTrip = useCallback(
    (userId: string, startedAt: number) =>
      setTrips((all) => {
        if (all[userId]?.startedAt !== startedAt) return all
        const rest = { ...all }
        delete rest[userId]
        return rest
      }),
    [],
  )

  useEffect(
    () =>
      subscribeToOrderEvents((entry) => {
        playEffect(effectOfEvent(entry, tablesRef.current ?? [], ordersRef.current))
        startTrip(entry.type === 'order:created' ? entry.event.createdBy : entry.event.updatedBy, entry)
      }),
    [subscribeToOrderEvents, playEffect, startTrip],
  )

  useEffect(
    () =>
      subscribeToTableEvents((event) => {
        playEffect(effectOfTableEvent(event, tablesRef.current ?? []))
        startTrip(event.updatedBy, event)
      }),
    [subscribeToTableEvents, playEffect, startTrip],
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

  // En édition, la scène ne montre que le plan : on arrête animations et trajets en cours.
  const startEditing = () => {
    setEffects([])
    setTrips({})
    editor.start()
  }

  // Une table occupée ou avec des commandes visibles ne peut pas être retirée.
  const isInUse = (tableNumber: number) =>
    (tableStates[tableNumber] !== undefined && tableStates[tableNumber].status !== 'LIBRE') ||
    orders.some((order) => order.tableNumber === tableNumber)
  const selectedDraft = editor.draft?.find((table) => table.number === editor.selected) ?? null

  const selectedOnPlan = scene.tables.find((table) => table.number === selectedTable) ?? null
  const shot: CameraShot = selectedOnPlan
    ? { kind: 'table', x: selectedOnPlan.x, z: selectedOnPlan.z }
    : { kind: baseShot }

  const frame = (next: 'room' | 'kitchen') => {
    onDeselect()
    setBaseShot(next)
    setResetSignal((n) => n + 1)
  }

  // Clic dans le vide : ferme le panneau, sauf à la fin d'un glissé de caméra.
  const pointerDownRef = useRef<{ x: number; y: number } | null>(null)
  const handlePointerMissed = (event: MouseEvent) => {
    const down = pointerDownRef.current
    if (down && Math.hypot(event.clientX - down.x, event.clientY - down.y) > CLICK_MAX_DRAG) return
    if (selectedTable !== null) onDeselect()
  }

  const toggleCameraMode = () => {
    const next = cameraMode === 'iso' ? 'free' : 'iso'
    setCameraMode(next)
    try {
      localStorage.setItem(CAMERA_MODE_STORAGE_KEY, next)
    } catch {
      // Stockage indisponible (navigation privée) : le choix n'est simplement pas mémorisé.
    }
  }

  // Plan de salle indisponible : l'erreur remonte à ViewErrorBoundary, qui
  // repasse sur le kanban.
  if (floorPlanError) throw floorPlanError

  return (
    <div
      className="bg-muted absolute inset-0 overflow-hidden"
      onPointerDownCapture={(event) => {
        pointerDownRef.current = { x: event.clientX, y: event.clientY }
      }}
    >
      <Canvas
        orthographic
        camera={{ position: [30, 30, 30], zoom: 30, near: 0.1, far: 200 }}
        frameloop="demand"
        dpr={[1, 2]}
        className={cn('transition-[filter]', isOffline && 'grayscale')}
        style={{ touchAction: 'none' }}
        onCreated={({ gl }) => setGlCanvas(gl.domElement)}
        onPointerMissed={handlePointerMissed}
      >
        <ambientLight intensity={1.4} />
        <directionalLight position={[6, 12, 4]} intensity={1.8} />
        <CameraRig
          mode={editing ? 'top' : cameraMode}
          shot={shot}
          panel={panel}
          topInsetLeft={EDITOR_PANEL_INSET}
          resetSignal={resetSignal}
          enabled={!editing}
        />
        <Room kitchenTickets={scene.kitchenTickets} passPlates={scene.passPlates} />
        {editor.draft ? (
          <EditorScene
            tables={editor.draft}
            selected={editor.selected}
            faulty={editor.faulty}
            onSelect={editor.setSelected}
            onMove={editor.move}
          />
        ) : (
          <>
            {scene.tables.map((table) => (
              <DiningTable key={table.number} table={table} onSelect={onSelectTable} />
            ))}
            <Staff staff={staff} trips={trips} cookingCount={cookingCount} anchors={anchors} onTripDone={endTrip} />
            <Effects effects={effects} onDone={removeEffect} />
          </>
        )}
        <LabelProjector anchors={anchors} />
      </Canvas>

      {/* Étiquettes HTML, placées au-dessus des objets de la scène par LabelProjector */}
      <div
        ref={labelLayerRef}
        className={cn('pointer-events-none absolute inset-0 overflow-hidden', isOffline && 'grayscale')}
      >
        {editor.draft
          ? editor.draft.map((table) => (
              <SceneLabel
                key={table.number}
                anchors={anchors}
                id={`draft:${table.number}`}
                position={[table.x, 1, table.z]}
              >
                {/* Simple repère : l'appui doit atteindre la table dessous pour la glisser. */}
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-xs font-semibold shadow-sm',
                    editor.faulty.has(table.number) ? 'bg-red-600 text-white' : 'bg-background',
                  )}
                >
                  T{table.number}
                </span>
              </SceneLabel>
            ))
          : scene.tables.map((table) => (
              <SceneLabel
                key={table.number}
                anchors={anchors}
                id={`table:${table.number}`}
                position={[table.x, 1.6, table.z]}
              >
                <TableLabel table={table} now={now} role={role} onSelect={onSelectTable} />
              </SceneLabel>
            ))}
        <SceneLabel anchors={anchors} id="kitchen" position={KITCHEN_LABEL_POSITION}>
          <div className="bg-background/90 rounded-md px-2 py-1 text-xs whitespace-nowrap shadow-sm">
            <span className="font-semibold">Cuisine</span> · {cookingCount} en préparation · {validatedCount} validée
            {validatedCount > 1 ? 's' : ''}
          </div>
        </SceneLabel>
        {!editing &&
          staff.map(({ user, x, z }) => (
            <SceneLabel key={user.id} anchors={anchors} id={`staff:${user.id}`} position={[x, STAFF_LABEL_Y, z]}>
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

      {!editing && (
        <div
          role="group"
          aria-label="Cadrage du plan"
          className="absolute bottom-4 left-3 z-10 flex flex-wrap gap-2 sm:left-4"
        >
          <Button variant="ghost" className={FLOATING} onClick={() => frame('room')}>
            <ScanIcon />
            <span className="max-sm:sr-only">Voir toute la salle</span>
          </Button>
          <Button
            variant="ghost"
            className={cn(
              FLOATING,
              cameraMode === 'free' && 'bg-foreground text-background hover:bg-foreground/90 hover:text-background',
            )}
            onClick={toggleCameraMode}
            aria-pressed={cameraMode === 'free'}
          >
            <Rotate3dIcon />
            <span className="max-sm:sr-only">Caméra libre</span>
          </Button>
          <Button variant="ghost" className={FLOATING} onClick={() => frame('kitchen')}>
            <ChefHatIcon />
            <span className="max-sm:sr-only">Cuisine</span>
          </Button>
          {canRoleEditFloorPlan(role) && floorPlan && (
            <Button variant="ghost" className={FLOATING} onClick={startEditing}>
              <PencilIcon />
              <span className="max-sm:sr-only">Modifier le plan</span>
            </Button>
          )}
        </div>
      )}

      {editing && (
        <EditorPanel
          selected={selectedDraft}
          selectedInUse={selectedDraft !== null && isInUse(selectedDraft.number)}
          problems={editor.problems}
          hasChanges={editor.hasChanges}
          isSaving={editor.isSaving}
          onAdd={editor.add}
          onRemove={editor.remove}
          onRenumber={editor.renumber}
          onReshape={editor.reshape}
          onCancel={editor.cancel}
          onSave={() => void editor.save()}
        />
      )}

      {!editing && tables?.length === 0 && (
        <div className="bg-background/90 absolute top-20 left-3 max-w-xs rounded-2xl p-3 text-sm shadow-sm sm:left-4">
          Ce restaurant n'a pas encore de plan de salle : les commandes sont listées dans « Hors plan ».
        </div>
      )}

      {!editing && tables !== null && scene.offPlan.length > 0 && (
        <div className="bg-background/90 absolute top-20 left-3 flex max-w-[calc(100%-1.5rem)] flex-wrap items-center gap-2 rounded-2xl p-2 pl-3 text-xs shadow-sm sm:left-4">
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
