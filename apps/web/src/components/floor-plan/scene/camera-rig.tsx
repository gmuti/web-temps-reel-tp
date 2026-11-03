import { CameraControls, CameraControlsImpl } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { useEffect, useRef } from 'react'
import { Box3, Vector3 } from 'three'
import { ROOM } from '../floor-plan-data'

export type CameraMode = 'iso' | 'free'

const { ACTION } = CameraControlsImpl

// Isométrie vraie : la caméra regarde le centre de la salle selon la diagonale
// (1, 1, 1), soit un azimut de 45° et une élévation d'environ 35°.
const ISO_DISTANCE = 30

// Emprise de la salle à l'écran en vue iso, en unités de scène (marge comprise) :
// largeur (W + D) / √2, hauteur (W + D) / √6 plus la hauteur des murs.
const ISO_SCREEN_WIDTH = ((ROOM.width + ROOM.depth) / Math.SQRT2) * 1.1
const ISO_SCREEN_HEIGHT = ((ROOM.width + ROOM.depth) / Math.sqrt(6) + 1) * 1.1

// Zoom en dessous duquel tables et étiquettes se chevauchent. Sur un écran
// étroit, on cadre le centre de la salle à ce zoom et on la parcourt au doigt.
const READABLE_ZOOM = 28

// Le centre de vue reste au-dessus de la salle. La boîte a de la hauteur : un
// glissé vertical à l'écran déplace aussi le centre de vue en hauteur, et le
// bloquer à y = 0 désynchroniserait la salle et le curseur.
const TARGET_BOUNDARY = new Box3(
  new Vector3(-ROOM.width / 2, -ROOM.depth, -ROOM.depth / 2),
  new Vector3(ROOM.width / 2, ROOM.depth, ROOM.depth / 2),
)

// Partie de la salle cadrée par la vue de référence : point visé au sol (x, z)
// et zoom relatif au cadrage de toute la salle.
export type CameraFocus = { x: number; z: number; zoom: number }

const WHOLE_ROOM: CameraFocus = { x: 0, z: 0, zoom: 1 }

type CameraRigProps = {
  mode: CameraMode
  focus?: CameraFocus
  // Incrémenté pour revenir à la vue iso de référence.
  resetSignal: number
  // Faux quand un dialog recouvre la scène : les gestes ne doivent pas la bouger.
  enabled: boolean
}

/**
 * Caméra orthographique : vue iso fixe (déplacement et zoom seulement) ou
 * caméra libre (rotation en plus). Le passage en vue iso est animé.
 */
export function CameraRig({ mode, focus = WHOLE_ROOM, resetSignal, enabled }: CameraRigProps) {
  const controlsRef = useRef<CameraControlsImpl>(null)
  const size = useThree((state) => state.size)
  const wholeRoomZoom = Math.min(size.width / ISO_SCREEN_WIDTH, size.height / ISO_SCREEN_HEIGHT)
  const fitZoom = Math.max(wholeRoomZoom, READABLE_ZOOM)
  const placedRef = useRef(false)

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    controls.setBoundary(TARGET_BOUNDARY)
    // La salle suit exactement le doigt ou la souris (2 par défaut).
    controls.truckSpeed = 1
    // Le zoom arrière va jusqu'à voir toute la salle, même sur mobile.
    controls.minZoom = Math.min(fitZoom * 0.6, wholeRoomZoom)
    controls.maxZoom = fitZoom * 4
    // Pas sous le sol, ni à la verticale exacte (rotation instable).
    controls.minPolarAngle = 0.15
    controls.maxPolarAngle = Math.PI * 0.45
  }, [fitZoom, wholeRoomZoom])

  useEffect(() => {
    const controls = controlsRef.current
    if (!controls) return
    if (mode === 'iso') {
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

  // Pose de référence : au montage (sans animation, quel que soit le mode), au
  // retour en vue iso, sur demande (« Recentrer », dans les deux modes), et quand
  // la taille du canvas change en vue iso. Passer en caméra libre ne bouge pas la
  // caméra.
  const lastResetRef = useRef(resetSignal)
  useEffect(() => {
    const controls = controlsRef.current
    const resetRequested = lastResetRef.current !== resetSignal
    lastResetRef.current = resetSignal
    if (!controls || (mode !== 'iso' && !resetRequested && placedRef.current)) return
    const animate = placedRef.current
    placedRef.current = true
    void controls.setLookAt(focus.x + ISO_DISTANCE, ISO_DISTANCE, focus.z + ISO_DISTANCE, focus.x, 0, focus.z, animate)
    void controls.zoomTo(fitZoom * focus.zoom, animate)
  }, [mode, resetSignal, fitZoom, focus.x, focus.z, focus.zoom])

  return <CameraControls ref={controlsRef} makeDefault enabled={enabled} />
}
