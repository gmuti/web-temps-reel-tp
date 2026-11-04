import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, Vector3 } from 'three'
import {
  centerOn,
  easeInOutCubic,
  fitBounds,
  ISO_DIRECTION,
  NO_INSETS,
  type Bounds,
  type CameraPose,
  type Insets,
} from '../camera-framing'
import { KITCHEN, PASS_COUNTER, ROOM, TICKET_RAIL_Y } from '../floor-plan-data'
import { SHEET_HEIGHT_RATIO, SIDE_PANEL_WIDTH, type PanelLayout } from '../panel-layout'

// `top` : vue de dessus de l'éditeur de plan (cuisine en haut de l'écran).
export type CameraMode = 'iso' | 'free' | 'top'

// Ce que la caméra cadre (handoff § 6.3) : toute la salle avec la cuisine, la cuisine
// seule, ou une table sélectionnée (centrée à côté du panneau et zoomée).
export type CameraShot = { kind: 'room' } | { kind: 'kitchen' } | { kind: 'table'; x: number; z: number }

export type { PanelLayout } from '../panel-layout'

const { ACTION } = CameraControlsImpl

// Distance de la caméra au point visé (sans effet sur l'image en orthographique).
const ISO_DISTANCE = 30 * Math.sqrt(3)
const WALL_HEIGHT = 1
const WALL_THICKNESS = 0.15

// Boîtes englobantes cadrées : la pièce entière (cuisine comprise, murs inclus) et la cuisine avec le passe.
const ROOM_BOUNDS: Bounds = {
  min: [-ROOM.width / 2 - WALL_THICKNESS, 0, ROOM.minZ - WALL_THICKNESS],
  max: [ROOM.width / 2, WALL_HEIGHT, ROOM.maxZ],
}
const KITCHEN_BOUNDS: Bounds = {
  min: [KITCHEN.x - KITCHEN.width / 2, 0, KITCHEN.z - KITCHEN.depth / 2 - WALL_THICKNESS],
  max: [KITCHEN.x + KITCHEN.width / 2, TICKET_RAIL_Y, PASS_COUNTER.z + PASS_COUNTER.depth / 2],
}

// Zoom sur une table : ×2,5 par rapport au cadrage de toute la salle, centré à hauteur de plateau.
const TABLE_ZOOM_FACTOR = 2.5
const TABLE_FOCUS_Y = 0.7
// Durée des mouvements de caméra (ouverture et fermeture du panneau, boutons de cadrage).
const TWEEN_MS = 600
// Vue de dessus : la pièce entière, avec une marge.
const TOP_MARGIN = 1.08
// Hauteur (px) de la barre flottante de l'app au-dessus de la scène : la vue de dessus cadre en dessous.
const TOP_HEADER_INSET = 72

// Le centre de vue reste près de la salle. La boîte a de la hauteur : un glissé
// vertical à l'écran déplace aussi le centre de vue en hauteur, et le bloquer à
// y = 0 désynchroniserait la salle et le curseur. La marge horizontale laisse
// décentrer une table de bord à côté du panneau.
const TARGET_BOUNDARY = new Box3(
  new Vector3(-ROOM.width / 2 - 4, -ROOM.depth, ROOM.minZ - 4),
  new Vector3(ROOM.width / 2 + 4, ROOM.depth, ROOM.maxZ + 4),
)

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

type Tween = {
  start: number
  fromTarget: Vector3
  fromOffset: Vector3
  fromZoom: number
  toTarget: Vector3
  toOffset: Vector3
  toZoom: number
}

type CameraRigProps = {
  mode: CameraMode
  shot: CameraShot
  panel: PanelLayout
  // Vue de dessus : largeur (px) réservée à gauche, sous le panneau de l'éditeur.
  topInsetLeft?: number
  // Incrémenté pour reprendre le cadrage courant (bouton de cadrage pressé à nouveau).
  resetSignal: number
  // Faux en édition : les gestes ne doivent pas bouger la vue de dessus.
  enabled: boolean
}

function insetsOf(panel: PanelLayout, height: number): Insets {
  if (panel === 'side') return { right: SIDE_PANEL_WIDTH, bottom: 0 }
  if (panel === 'sheet') return { right: 0, bottom: height * SHEET_HEIGHT_RATIO }
  return NO_INSETS
}

/**
 * Caméra orthographique : vue iso fixe (déplacement et zoom seulement), caméra
 * libre (rotation en plus) ou vue de dessus (éditeur). Les changements de cadrage
 * sont animés (600 ms, ease-in-out), sauf si l'utilisateur réduit les animations.
 */
export function CameraRig({ mode, shot, panel, topInsetLeft = 0, resetSignal, enabled }: CameraRigProps) {
  const controlsRef = useRef<CameraControlsImpl>(null)
  const size = useThree((state) => state.size)
  const camera = useThree((state) => state.camera)
  const invalidate = useThree((state) => state.invalidate)
  const roomZoom = fitBounds(ROOM_BOUNDS, size).zoom
  const tweenRef = useRef<Tween | null>(null)
  const placedRef = useRef(false)

  // Vue de dessus de l'éditeur. Sur un écran étroit, on ne réserve rien : le panneau recouvre un coin du plan.
  const topInset = size.width - topInsetLeft >= ROOM.width * 28 ? topInsetLeft : 0
  const topZoom = Math.min(
    (size.width - topInset) / (ROOM.width * TOP_MARGIN),
    (size.height - TOP_HEADER_INSET) / (ROOM.depth * TOP_MARGIN),
  )
  const topCenterX = -topInset / 2 / topZoom
  // Vers -z (le haut de l'écran) : la salle descend sous la barre flottante.
  const topCenterZ = ROOM.centerZ - TOP_HEADER_INSET / 2 / topZoom

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.setBoundary(TARGET_BOUNDARY)
    // La salle suit exactement le doigt ou la souris (2 par défaut).
    controls.truckSpeed = 1
    controls.minZoom = roomZoom * 0.5
    controls.maxZoom = roomZoom * 8
    // Pas sous le sol, ni à la verticale exacte (rotation instable), sauf en vue de dessus.
    controls.minPolarAngle = mode === 'top' ? 0 : 0.15
    controls.maxPolarAngle = Math.PI * 0.45
  }, [roomZoom, mode])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (mode !== 'free') {
      controls.mouseButtons.left = ACTION.TRUCK
      controls.mouseButtons.right = ACTION.TRUCK
      controls.mouseButtons.middle = ACTION.ZOOM
      controls.touches.one = ACTION.TOUCH_TRUCK
      controls.touches.two = ACTION.TOUCH_ZOOM_TRUCK
      controls.touches.three = ACTION.NONE
    } else {
      controls.mouseButtons.left = ACTION.ROTATE
      controls.mouseButtons.right = ACTION.TRUCK
      controls.mouseButtons.middle = ACTION.ZOOM
      controls.touches.one = ACTION.TOUCH_ROTATE
      controls.touches.two = ACTION.TOUCH_ZOOM_TRUCK
      controls.touches.three = ACTION.TOUCH_TRUCK
    }
    controls.mouseButtons.wheel = ACTION.ZOOM
  }, [mode])

  // Un geste de l'utilisateur interrompt le mouvement en cours.
  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const cancel = () => {
      tweenRef.current = null
    }
    controls.addEventListener('controlstart', cancel)
    return () => controls.removeEventListener('controlstart', cancel)
  }, [])

  useFrame(() => {
    const tween = tweenRef.current
    const controls = controlsRef.current
    if (!tween || !controls) return
    const progress = easeInOutCubic((performance.now() - tween.start) / TWEEN_MS)
    const target = tween.fromTarget.clone().lerp(tween.toTarget, progress)
    const length = tween.fromOffset.length() + (tween.toOffset.length() - tween.fromOffset.length()) * progress
    const offset = tween.fromOffset.clone().lerp(tween.toOffset, progress).setLength(length)
    void controls.setLookAt(
      target.x + offset.x,
      target.y + offset.y,
      target.z + offset.z,
      target.x,
      target.y,
      target.z,
      false,
    )
    void controls.zoomTo(tween.fromZoom + (tween.toZoom - tween.fromZoom) * progress, false)
    if (progress >= 1) tweenRef.current = null
    invalidate()
  })

  const shotKey = shot.kind === 'table' ? `table:${shot.x}:${shot.z}` : shot.kind
  const previousRef = useRef({ mode, shotKey, panel, resetSignal, width: size.width, height: size.height })

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    const previous = previousRef.current
    previousRef.current = { mode, shotKey, panel, resetSignal, width: size.width, height: size.height }
    const firstPlacement = !placedRef.current
    placedRef.current = true

    if (mode === 'top') {
      tweenRef.current = null
      // Très léger décalage en z : la cuisine (z < 0) reste en haut de l'écran.
      void controls.setLookAt(topCenterX, ISO_DISTANCE, topCenterZ + 0.001, topCenterX, 0, topCenterZ, !firstPlacement)
      void controls.zoomTo(topZoom, !firstPlacement)
      return
    }

    const resized = previous.width !== size.width || previous.height !== size.height
    const reframed =
      previous.shotKey !== shotKey ||
      previous.panel !== panel ||
      previous.resetSignal !== resetSignal ||
      // Retour en vue iso, ou sortie de l'éditeur : on reprend le cadrage.
      (previous.mode !== mode && mode === 'iso') ||
      previous.mode === 'top'
    // En caméra libre, seul un nouveau cadrage demandé bouge la caméra (pas un redimensionnement).
    if (!firstPlacement && !reframed && (!resized || mode === 'free')) return

    const viewport = { width: size.width, height: size.height }
    const insets = insetsOf(panel, size.height)
    const pose: CameraPose =
      shot.kind === 'table'
        ? centerOn([shot.x, TABLE_FOCUS_Y, shot.z], roomZoom * TABLE_ZOOM_FACTOR, insets)
        : fitBounds(shot.kind === 'kitchen' ? KITCHEN_BOUNDS : ROOM_BOUNDS, viewport, insets)
    const toTarget = new Vector3(...pose.target)
    const toOffset = new Vector3(...ISO_DIRECTION).multiplyScalar(ISO_DISTANCE)

    // Au montage, au redimensionnement et si l'utilisateur réduit les animations : sans transition.
    if (firstPlacement || (resized && !reframed) || prefersReducedMotion()) {
      tweenRef.current = null
      const position = toTarget.clone().add(toOffset)
      void controls.setLookAt(position.x, position.y, position.z, toTarget.x, toTarget.y, toTarget.z, false)
      void controls.zoomTo(pose.zoom, false)
      invalidate()
      return
    }

    const fromTarget = controls.getTarget(new Vector3())
    tweenRef.current = {
      start: performance.now(),
      fromTarget,
      fromOffset: controls.getPosition(new Vector3()).sub(fromTarget),
      fromZoom: camera.zoom,
      toTarget,
      toOffset,
      toZoom: pose.zoom,
    }
    invalidate()
  }, [
    mode,
    shot,
    shotKey,
    panel,
    resetSignal,
    size.width,
    size.height,
    roomZoom,
    topZoom,
    topCenterX,
    topCenterZ,
    camera,
    invalidate,
  ])

  return <CameraControls ref={controlsRef} makeDefault enabled={enabled} />
}
