import { describe, expect, it } from 'vitest'
import { orderStatusToast, tableStatusToast } from './order-status'

describe('textes des toasts', () => {
  it('annonce la validation avec le feu vert', () => {
    expect(orderStatusToast(5, 'VALIDEE')).toBe('Feu vert, T5 part en cuisine.')
  })

  it('reste sobre pour les autres statuts', () => {
    expect(orderStatusToast(2, 'SERVIE')).toBe('T2 servie.')
    expect(orderStatusToast(3, 'PRETE')).toBe('T3 prête.')
  })

  it('décrit l’occupation des tables', () => {
    expect(tableStatusToast(4, 'A_DEBARRASSER')).toBe('T4 à débarrasser.')
    expect(tableStatusToast(1, 'OCCUPEE')).toBe('T1 occupée.')
  })
})
