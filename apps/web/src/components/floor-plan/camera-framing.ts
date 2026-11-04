// Cadrage de la caméra orthographique iso (handoff § 6.3), sans dépendance à three :
// calculs purs, testés dans camera-framing.test.ts.
//
// La caméra regarde selon la diagonale (-1, -1, -1). Un point du monde se projette
// à l'écran par ses coordonnées sur les axes « droite » et « haut » de la caméra ;
// le zoom orthographique convertit ces unités en pixels.

export type Vec3 = [number, number, number]
export type Bounds = { min: Vec3; max: Vec3 }
export type Viewport = { width: number; height: number }
// Bandes de l'écran recouvertes (panneau à droite, feuille en bas), en pixels.
export type Insets = { right: number; bottom: number }
// Point visé, posé au sol (y = 0), et zoom orthographique (pixels par mètre).
export type CameraPose = { target: Vec3; zoom: number }

export const NO_INSETS: Insets = { right: 0, bottom: 0 }

const INV_SQRT2 = 1 / Math.SQRT2
const INV_SQRT3 = 1 / Math.sqrt(3)
const INV_SQRT6 = 1 / Math.sqrt(6)

// Axes de la caméra iso : droite (1, 0, -1)/√2, haut (-1, 2, -1)/√6, visée (-1, -1, -1)/√3.
const RIGHT: Vec3 = [INV_SQRT2, 0, -INV_SQRT2]
const UP: Vec3 = [-INV_SQRT6, 2 * INV_SQRT6, -INV_SQRT6]
const VIEW: Vec3 = [-INV_SQRT3, -INV_SQRT3, -INV_SQRT3]

// Direction de la caméra depuis le point visé.
export const ISO_DIRECTION: Vec3 = [INV_SQRT3, INV_SQRT3, INV_SQRT3]

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]

function cornersOf({ min, max }: Bounds): Vec3[] {
  const corners: Vec3[] = []
  for (const x of [min[0], max[0]])
    for (const y of [min[1], max[1]]) for (const z of [min[2], max[2]]) corners.push([x, y, z])
  return corners
}

// Point au sol dont la projection à l'écran vaut (u, v) : on glisse le long de l'axe de visée.
function groundPointAt(u: number, v: number): Vec3 {
  const point: Vec3 = [u * RIGHT[0] + v * UP[0], u * RIGHT[1] + v * UP[1], u * RIGHT[2] + v * UP[2]]
  const s = -point[1] / VIEW[1]
  return [point[0] + s * VIEW[0], 0, point[2] + s * VIEW[2]]
}

// Point visé pour que (u, v) apparaisse au centre de la zone non recouverte.
function targetFor(u: number, v: number, zoom: number, insets: Insets): Vec3 {
  // Décalage (px) du centre de la zone visible par rapport au centre de l'écran (y vers le bas).
  const dx = -insets.right / 2
  const dy = -insets.bottom / 2
  return groundPointAt(u - dx / zoom, v + dy / zoom)
}

/** Position à l'écran (px, origine en haut à gauche) d'un point du monde pour une pose donnée. */
export function projectToScreen(point: Vec3, pose: CameraPose, viewport: Viewport): [number, number] {
  return [
    viewport.width / 2 + (dot(point, RIGHT) - dot(pose.target, RIGHT)) * pose.zoom,
    viewport.height / 2 - (dot(point, UP) - dot(pose.target, UP)) * pose.zoom,
  ]
}

/**
 * Pose qui fait tenir toute la boîte dans la zone visible, avec `margin` de marge
 * de chaque côté (5 % par défaut), quel que soit le ratio de l'écran.
 */
export function fitBounds(bounds: Bounds, viewport: Viewport, insets: Insets = NO_INSETS, margin = 0.05): CameraPose {
  const corners = cornersOf(bounds)
  const us = corners.map((corner) => dot(corner, RIGHT))
  const vs = corners.map((corner) => dot(corner, UP))
  const [uMin, uMax, vMin, vMax] = [Math.min(...us), Math.max(...us), Math.min(...vs), Math.max(...vs)]
  const visibleWidth = Math.max(1, viewport.width - insets.right)
  const visibleHeight = Math.max(1, viewport.height - insets.bottom)
  const zoom = Math.min(
    visibleWidth / ((uMax - uMin) * (1 + 2 * margin)),
    visibleHeight / ((vMax - vMin) * (1 + 2 * margin)),
  )
  return { target: targetFor((uMin + uMax) / 2, (vMin + vMax) / 2, zoom, insets), zoom }
}

/** Pose qui place `point` au centre de la zone visible, au zoom donné. */
export function centerOn(point: Vec3, zoom: number, insets: Insets = NO_INSETS): CameraPose {
  return { target: targetFor(dot(point, RIGHT), dot(point, UP), zoom, insets), zoom }
}

/** Interpolation ease-in-out (cubique) entre 0 et 1. */
export function easeInOutCubic(t: number): number {
  const x = Math.min(1, Math.max(0, t))
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}
