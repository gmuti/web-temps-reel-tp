import { orderChatChannel, type Order } from '@app/shared'
import { describe, expect, it } from 'vitest'
import type { FloorTable } from './floor-plan-data'
import { buildScene } from './floor-scene-model'

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
