import { DINING_AREA, floorPlanProblems, isInsideDiningArea, type FloorTable } from '@app/shared'
import { describe, expect, it } from 'vitest'
import { addTable, faultyTables, GRID_STEP, placeTable, snap, withShape } from './floor-editor-model'

const small = (number: number, x: number, z: number): FloorTable => ({ number, x, z, shape: 'small', seats: 2 })
const long = (number: number, x: number, z: number): FloorTable => ({ number, x, z, shape: 'long', seats: 4 })

describe('placeTable', () => {
  it('accroche la position à la grille', () => {
    expect(snap(1.12)).toBe(1)
    expect(snap(1.13)).toBe(1.25)
    expect(placeTable(small(1, 0, 0), 1.13, -0.4)).toMatchObject({ x: 1.25, z: -0.5 })
  })

  it('garde toute la table dans la salle, même tirée contre un mur', () => {
    const placed = placeTable(long(1, 0, 0), 100, -100)
    expect(isInsideDiningArea(placed)).toBe(true)
    expect(placed.x % GRID_STEP).toBe(0)
    expect(placed.z).toBeGreaterThan(DINING_AREA.minZ)
  })
})

describe('withShape', () => {
  it('ajuste les places et recale une table qui déborderait', () => {
    const atWall = placeTable(small(1, 0, 0), 100, 0)
    const reshaped = withShape(atWall, 'long')
    expect(reshaped.seats).toBe(4)
    expect(isInsideDiningArea(reshaped)).toBe(true)
  })
})

describe('addTable', () => {
  it('numérote après la plus grande table et choisit une place libre', () => {
    const tables = [long(3, 0, 0), small(7, -5, 2)]
    const added = addTable(tables)
    expect(added.number).toBe(8)
    expect(floorPlanProblems([...tables, added])).toEqual([])
  })

  it('commence à 1 dans une salle vide', () => {
    expect(addTable([]).number).toBe(1)
  })
})

describe('faultyTables', () => {
  it('signale les tables qui se chevauchent et les numéros en double', () => {
    expect(faultyTables([long(1, 0, 0), long(2, 1, 0), small(3, 5, 4)])).toEqual(new Set([1, 2]))
    expect(faultyTables([small(4, -5, 0), small(4, 5, 0)])).toEqual(new Set([4]))
    expect(faultyTables([small(1, -5, 0), small(2, 5, 0)])).toEqual(new Set())
  })
})
