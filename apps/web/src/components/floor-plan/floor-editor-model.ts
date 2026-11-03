import {
  DINING_AREA,
  isInsideDiningArea,
  TABLE_FOOTPRINT,
  TABLE_SEATS_MAX,
  tablesOverlap,
  type FloorTable,
  type TableShape,
} from '@app/shared'

// Pas de la grille d'accrochage de l'éditeur, en mètres.
export const GRID_STEP = 0.25

export const snap = (value: number) => Math.round(value / GRID_STEP) * GRID_STEP

// Plage des positions accrochées à la grille pour lesquelles une emprise de
// `size` reste dans [min, max] (arrondie vers l'intérieur).
function gridRange(min: number, max: number, size: number): [number, number] {
  return [Math.ceil((min + size / 2) / GRID_STEP) * GRID_STEP, Math.floor((max - size / 2) / GRID_STEP) * GRID_STEP]
}

const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value))

/** Position accrochée à la grille, emprise de la table gardée dans la salle. */
export function placeTable(table: FloorTable, x: number, z: number): FloorTable {
  const [width, depth] = TABLE_FOOTPRINT[table.shape]
  return {
    ...table,
    x: clamp(snap(x), gridRange(DINING_AREA.minX, DINING_AREA.maxX, width)),
    z: clamp(snap(z), gridRange(DINING_AREA.minZ, DINING_AREA.maxZ, depth)),
  }
}

export function withShape(table: FloorTable, shape: TableShape): FloorTable {
  // Changer de forme peut faire déborder une table posée contre un mur : on la recale.
  const reshaped = { ...table, shape, seats: TABLE_SEATS_MAX[shape] }
  return placeTable(reshaped, reshaped.x, reshaped.z)
}

/**
 * Nouvelle table (petite) au premier emplacement libre, en parcourant la salle
 * depuis l'avant ; au centre s'il n'y en a plus (le chevauchement sera signalé).
 */
export function addTable(tables: readonly FloorTable[]): FloorTable {
  const number = Math.max(0, ...tables.map((table) => table.number)) + 1
  const base: FloorTable = { number, x: 0, z: 0, shape: 'small', seats: TABLE_SEATS_MAX.small }
  const [width, depth] = TABLE_FOOTPRINT.small
  for (let z = DINING_AREA.minZ + depth / 2; z <= DINING_AREA.maxZ - depth / 2; z += GRID_STEP) {
    for (let x = DINING_AREA.minX + width / 2; x <= DINING_AREA.maxX - width / 2; x += GRID_STEP) {
      const candidate = placeTable(base, x, z)
      if (tables.every((table) => !tablesOverlap(candidate, table))) return candidate
    }
  }
  return placeTable(base, 0, (DINING_AREA.minZ + DINING_AREA.maxZ) / 2)
}

/** Numéros des tables en défaut (doublon, hors de la salle, chevauchement). */
export function faultyTables(tables: readonly FloorTable[]): Set<number> {
  const faulty = new Set<number>()
  tables.forEach((table, index) => {
    if (!isInsideDiningArea(table) || table.seats > TABLE_SEATS_MAX[table.shape]) faulty.add(table.number)
    tables.slice(index + 1).forEach((other) => {
      if (other.number === table.number || tablesOverlap(table, other)) {
        faulty.add(table.number)
        faulty.add(other.number)
      }
    })
  })
  return faulty
}
