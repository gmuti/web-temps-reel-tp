import type { FloorTable, Order, OrderJournalEvent } from '@app/shared'
import { describe, expect, it } from 'vitest'
import { admitEffect, EFFECT_WINDOW_MS, effectOfEvent, MAX_EFFECTS_PER_WINDOW } from './order-effects'

const TABLES: FloorTable[] = [{ number: 4, x: 6, z: -1, shape: 'small', seats: 2 }]
const ORDER_ID = '00000000-0000-4000-8000-000000000001'
const USER_ID = '00000000-0000-4000-8000-0000000000ff'
const date = new Date(Date.UTC(2026, 10, 3, 12, 0))

function order(tableNumber: number, status: Order['status']): Order {
  return {
    id: ORDER_ID,
    restaurantId: '00000000-0000-4000-8000-000000000000',
    tableNumber,
    items: [],
    comment: null,
    status,
    clientOrderId: null,
    waiterId: USER_ID,
    createdAt: date,
    updatedAt: date,
  }
}

function statusUpdated(previousStatus: Order['status'], status: Order['status']): OrderJournalEvent {
  return {
    type: 'order:status-updated',
    event: { eventId: 2, orderId: ORDER_ID, previousStatus, status, updatedBy: USER_ID, updatedAt: date },
  }
}

describe('effectOfEvent', () => {
  it("fait pulser la table d'une nouvelle commande", () => {
    const created: OrderJournalEvent = {
      type: 'order:created',
      event: {
        eventId: 1,
        orderId: ORDER_ID,
        restaurantId: '00000000-0000-4000-8000-000000000000',
        tableNumber: 4,
        items: [],
        comment: null,
        status: 'A_VALIDER',
        createdBy: USER_ID,
        createdAt: date,
      },
    }
    expect(effectOfEvent(created, TABLES, [])).toMatchObject({ kind: 'pulse', at: [6, 0.02, -1] })
  })

  it("envoie le ticket d'une commande validée de la table vers la cuisine", () => {
    const effect = effectOfEvent(statusUpdated('A_VALIDER', 'VALIDEE'), TABLES, [order(4, 'A_VALIDER')])
    expect(effect).toMatchObject({ kind: 'arc', item: 'ticket', from: [6, 1.2, -1] })
  })

  it("apporte l'assiette d'une commande servie du passe à sa table", () => {
    // La commande servie a déjà quitté l'état : la table vient de l'état précédent.
    const effect = effectOfEvent(statusUpdated('PRETE', 'SERVIE'), TABLES, [order(4, 'PRETE')])
    expect(effect).toMatchObject({ kind: 'arc', item: 'plate', to: [6, 0.8, -1] })
  })

  it('fait disparaître le ticket rouge d’une commande annulée', () => {
    const effect = effectOfEvent(statusUpdated('VALIDEE', 'ANNULEE'), TABLES, [order(4, 'VALIDEE')])
    expect(effect).toMatchObject({ kind: 'arc', item: 'ticket', vanish: true })
  })

  it("n'anime pas une table absente du plan, sauf ce qui se passe en cuisine", () => {
    const before = [order(42, 'EN_PREPARATION')]
    expect(effectOfEvent(statusUpdated('VALIDEE', 'ANNULEE'), TABLES, [order(42, 'VALIDEE')])).toBeNull()
    expect(effectOfEvent(statusUpdated('EN_PREPARATION', 'PRETE'), TABLES, before)).toMatchObject({ item: 'plate' })
  })

  it("ignore un changement de statut d'une commande inconnue", () => {
    expect(effectOfEvent(statusUpdated('PRETE', 'SERVIE'), TABLES, [])).toBeNull()
  })
})

describe('admitEffect', () => {
  it("accepte des effets jusqu'à la limite, puis s'abstient pendant la rafale", () => {
    let recent: number[] = []
    for (let i = 0; i < MAX_EFFECTS_PER_WINDOW; i++) {
      const admitted = admitEffect(recent, 1000 + i * 10)
      expect(admitted).not.toBeNull()
      recent = admitted!
    }
    expect(admitEffect(recent, 1100)).toBeNull()
  })

  it('accepte de nouveau une fois la fenêtre passée', () => {
    const recent = Array.from({ length: MAX_EFFECTS_PER_WINDOW }, (_, i) => 1000 + i)
    expect(admitEffect(recent, 1000 + EFFECT_WINDOW_MS + MAX_EFFECTS_PER_WINDOW)).toHaveLength(1)
  })
})
