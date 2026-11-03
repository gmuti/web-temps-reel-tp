import { orderChatChannel, type FloorTable, type Order, type TableState } from '@app/shared'
import { describe, expect, it } from 'vitest'
import { buildScene, isLate, placeStaff } from './floor-scene-model'

const TABLES: FloorTable[] = [
  { number: 1, x: 0, z: 0, shape: 'small', seats: 2 },
  { number: 2, x: 2, z: 0, shape: 'long', seats: 4 },
]

let sequence = 0
function order(tableNumber: number, status: Order['status'], minutesAgo = 0): Order {
  sequence += 1
  const date = new Date(Date.UTC(2026, 10, 3, 12, 0) - minutesAgo * 60_000)
  return {
    id: `00000000-0000-4000-8000-${String(sequence).padStart(12, '0')}`,
    restaurantId: '00000000-0000-4000-8000-000000000000',
    tableNumber,
    items: [],
    comment: null,
    status,
    clientOrderId: null,
    waiterId: '00000000-0000-4000-8000-ffffffffffff',
    createdAt: date,
    updatedAt: date,
  }
}

describe('buildScene', () => {
  it('donne à une table la couleur de sa commande la plus urgente', () => {
    const scene = buildScene(
      TABLES,
      [order(1, 'EN_PREPARATION'), order(1, 'PRETE'), order(1, 'A_VALIDER')],
      {},
      'RESPONSABLE',
    )
    expect(scene.tables[0]).toMatchObject({ number: 1, state: 'ready' })
    expect(scene.tables[0].orders).toHaveLength(3)
  })

  it('préfère une commande à valider à une commande validée ou en préparation', () => {
    const scene = buildScene(TABLES, [order(2, 'VALIDEE'), order(2, 'A_VALIDER')], {}, 'RESPONSABLE')
    expect(scene.tables[1].state).toBe('to-validate')
  })

  it('date une table par la plus ancienne commande du statut le plus urgent', () => {
    const oldest = order(1, 'A_VALIDER', 12)
    const scene = buildScene(TABLES, [order(1, 'A_VALIDER', 3), oldest, order(1, 'VALIDEE', 30)], {}, 'RESPONSABLE')
    expect(scene.tables[0].since).toEqual(oldest.updatedAt)
  })

  it('distingue table libre et table inconnue selon le rôle', () => {
    expect(buildScene(TABLES, [], {}, 'RESPONSABLE').tables[0].state).toBe('free')
    // Un serveur ne voit que ses commandes : une table sans commande de sa part
    // peut être occupée par un collègue.
    expect(buildScene(TABLES, [], {}, 'WAITER').tables[0].state).toBe('unknown')
  })

  it('range à part les commandes dont la table est absente du plan', () => {
    const lost = order(42, 'A_VALIDER')
    const scene = buildScene(TABLES, [order(1, 'VALIDEE'), lost], {}, 'RESPONSABLE')
    expect(scene.offPlan).toEqual([lost])
  })

  it('répartit les commandes entre la cuisine et le passe', () => {
    const validated = order(1, 'VALIDEE', 5)
    const cooking = order(2, 'EN_PREPARATION', 10)
    const ready = order(2, 'PRETE')
    const scene = buildScene(TABLES, [validated, cooking, ready, order(1, 'A_VALIDER')], {}, 'COOK')
    expect(scene.kitchenTickets).toEqual([cooking, validated])
    expect(scene.passPlates).toEqual([ready])
  })

  it('ignore les commandes servies ou annulées', () => {
    const scene = buildScene(TABLES, [order(1, 'SERVIE'), order(2, 'ANNULEE')], {}, 'RESPONSABLE')
    expect(scene.tables.map((table) => table.state)).toEqual(['free', 'free'])
    expect(scene.offPlan).toEqual([])
  })

  it('additionne les messages non lus des discussions de la table', () => {
    const a = order(1, 'VALIDEE')
    const b = order(1, 'PRETE')
    const scene = buildScene(
      TABLES,
      [a, b],
      { [orderChatChannel(a.id)]: 2, [orderChatChannel(b.id)]: 1, general: 5 },
      'RESPONSABLE',
    )
    expect(scene.tables[0].unread).toBe(3)
  })
})

describe('isLate', () => {
  const now = new Date(Date.UTC(2026, 10, 3, 12, 0))
  const minutesAgo = (minutes: number) => new Date(now.getTime() - minutes * 60_000)

  it('signale une assiette prête qui attend depuis 3 minutes', () => {
    expect(isLate('ready', minutesAgo(2), now)).toBe(false)
    expect(isLate('ready', minutesAgo(3), now)).toBe(true)
  })

  it('laisse plus de temps à une préparation', () => {
    expect(isLate('cooking', minutesAgo(15), now)).toBe(false)
    expect(isLate('cooking', minutesAgo(20), now)).toBe(true)
  })

  it("ne signale jamais une table libre ou sans date d'entrée", () => {
    expect(isLate('free', minutesAgo(600), now)).toBe(false)
    expect(isLate('to-validate', null, now)).toBe(false)
  })
})

describe('placeStaff', () => {
  const person = (id: string, role: 'COOK' | 'WAITER' | 'RESPONSABLE' | 'MANAGER') => ({
    id: `00000000-0000-4000-8000-00000000000${id}`,
    name: `Personne ${id}`,
    role,
  })

  it('place chaque rôle dans sa zone, côte à côte', () => {
    const staff = placeStaff([person('1', 'COOK'), person('2', 'WAITER'), person('3', 'COOK'), person('4', 'MANAGER')])
    expect(staff.map((member) => member.zone)).toEqual(['kitchen', 'floor', 'kitchen', 'office'])
    const [firstCook, , secondCook] = staff
    expect(secondCook.z).toBe(firstCook.z)
    expect(secondCook.x).not.toBe(firstCook.x)
  })
})

describe("buildScene avec l'occupation des tables", () => {
  const occupancy = (number: number, status: TableState['status'], guests: number | null = null): TableState => ({
    number,
    status,
    guests,
    statusChangedAt: new Date(Date.UTC(2026, 10, 3, 11, 30)),
    version: 1,
  })

  it("montre l'occupation d'une table sans commande en cours", () => {
    const scene = buildScene(TABLES, [], {}, 'RESPONSABLE', {
      1: occupancy(1, 'OCCUPEE', 3),
      2: occupancy(2, 'A_DEBARRASSER'),
    })
    expect(scene.tables.map((table) => table.state)).toEqual(['occupied', 'to-clear'])
    expect(scene.tables[0].occupancy?.guests).toBe(3)
    expect(scene.tables[1].since).toEqual(new Date(Date.UTC(2026, 10, 3, 11, 30)))
  })

  it("fait passer les commandes avant l'occupation", () => {
    const scene = buildScene(TABLES, [order(1, 'PRETE')], {}, 'RESPONSABLE', { 1: occupancy(1, 'OCCUPEE') })
    expect(scene.tables[0].state).toBe('ready')
  })

  it('renseigne un serveur sur les tables de ses collègues, sans leurs commandes', () => {
    const scene = buildScene(TABLES, [], {}, 'WAITER', { 1: occupancy(1, 'OCCUPEE'), 2: occupancy(2, 'LIBRE') })
    expect(scene.tables.map((table) => table.state)).toEqual(['occupied', 'free'])
    expect(scene.tables[0].orders).toEqual([])
  })

  it('signale une table à débarrasser depuis plus de 5 minutes', () => {
    const now = new Date(Date.UTC(2026, 10, 3, 12, 0))
    expect(isLate('to-clear', new Date(now.getTime() - 4 * 60_000), now)).toBe(false)
    expect(isLate('to-clear', new Date(now.getTime() - 5 * 60_000), now)).toBe(true)
    expect(isLate('occupied', new Date(now.getTime() - 120 * 60_000), now)).toBe(false)
  })
})
