import { describe, expect, it } from 'vitest'
import { centerOn, easeInOutCubic, fitBounds, projectToScreen, type Bounds, type Vec3 } from './camera-framing'

const ROOM_BOUNDS: Bounds = { min: [-8, 0, -6], max: [8, 1, 6] }

function corners({ min, max }: Bounds): Vec3[] {
  return [min[0], max[0]].flatMap((x) => [min[1], max[1]].flatMap((y) => [min[2], max[2]].map((z): Vec3 => [x, y, z])))
}

describe('fitBounds', () => {
  for (const [label, viewport] of [
    ['16/9', { width: 1600, height: 900 }],
    ['4/3', { width: 1024, height: 768 }],
    ['portrait', { width: 390, height: 844 }],
  ] as const) {
    it(`fait tenir toute la boîte avec 5 % de marge (${label})`, () => {
      const pose = fitBounds(ROOM_BOUNDS, viewport)
      const points = corners(ROOM_BOUNDS).map((corner) => projectToScreen(corner, pose, viewport))
      const xs = points.map(([x]) => x)
      const ys = points.map(([, y]) => y)
      const width = Math.max(...xs) - Math.min(...xs)
      const height = Math.max(...ys) - Math.min(...ys)
      // Tout est visible, et la boîte touche la marge sur au moins un axe.
      expect(Math.min(...xs)).toBeGreaterThanOrEqual(-1e-6)
      expect(Math.max(...xs)).toBeLessThanOrEqual(viewport.width + 1e-6)
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(-1e-6)
      expect(Math.max(...ys)).toBeLessThanOrEqual(viewport.height + 1e-6)
      const fill = Math.max(width / viewport.width, height / viewport.height)
      expect(fill).toBeCloseTo(1 / 1.1, 5)
      // La boîte est centrée.
      expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo(viewport.width / 2, 5)
      expect((Math.min(...ys) + Math.max(...ys)) / 2).toBeCloseTo(viewport.height / 2, 5)
    })
  }

  it('pose le point visé au sol', () => {
    expect(fitBounds(ROOM_BOUNDS, { width: 1600, height: 900 }).target[1]).toBe(0)
  })

  it('cadre dans la zone laissée libre par un panneau à droite', () => {
    const viewport = { width: 1600, height: 900 }
    const pose = fitBounds(ROOM_BOUNDS, viewport, { right: 440, bottom: 0 })
    const xs = corners(ROOM_BOUNDS).map((corner) => projectToScreen(corner, pose, viewport)[0])
    expect(Math.max(...xs)).toBeLessThanOrEqual(1600 - 440 + 1e-6)
    expect((Math.min(...xs) + Math.max(...xs)) / 2).toBeCloseTo((1600 - 440) / 2, 5)
  })
})

describe('centerOn', () => {
  it('centre une table à gauche du panneau latéral', () => {
    const viewport = { width: 1600, height: 900 }
    const table: Vec3 = [3, 0.7, 2]
    const [x, y] = projectToScreen(table, centerOn(table, 60, { right: 440, bottom: 0 }), viewport)
    expect(x).toBeCloseTo((1600 - 440) / 2, 5)
    expect(y).toBeCloseTo(450, 5)
  })

  it('centre une table dans la partie haute au-dessus de la feuille mobile', () => {
    const viewport = { width: 390, height: 844 }
    const table: Vec3 = [-4, 0.7, 3]
    const sheet = 844 * 0.6
    const [x, y] = projectToScreen(table, centerOn(table, 40, { right: 0, bottom: sheet }), viewport)
    expect(x).toBeCloseTo(195, 5)
    expect(y).toBeCloseTo((844 - sheet) / 2, 5)
  })
})

describe('easeInOutCubic', () => {
  it('part de 0, passe par 0,5 au milieu et arrive à 1', () => {
    expect(easeInOutCubic(0)).toBe(0)
    expect(easeInOutCubic(0.5)).toBe(0.5)
    expect(easeInOutCubic(1)).toBe(1)
    expect(easeInOutCubic(1.4)).toBe(1)
  })
})
