import { describe, expect, it } from 'vitest'
import type { TableVisualState } from './floor-scene-model'
import { blinksFor, TABLE_STATE_STYLES } from './table-states'

const ALL_STATES = Object.keys(TABLE_STATE_STYLES) as TableVisualState[]
const blinking = (role: Parameters<typeof blinksFor>[1]) => ALL_STATES.filter((state) => blinksFor(state, role))

describe('blinksFor', () => {
  it('fait clignoter pour le serveur ce qu’il doit valider ou servir', () => {
    expect(blinking('WAITER')).toEqual(['to-validate', 'ready'])
  })

  it('ne fait clignoter que les commandes prêtes pour le responsable', () => {
    expect(blinking('RESPONSABLE')).toEqual(['ready'])
  })

  it('ne fait rien clignoter en salle pour la cuisine ni pour le manager', () => {
    expect(blinking('COOK')).toEqual([])
    expect(blinking('MANAGER')).toEqual([])
  })

  it('ne fige plus le clignotement dans les styles', () => {
    expect(ALL_STATES.some((state) => TABLE_STATE_STYLES[state].badgeClass.includes('animate-pulse'))).toBe(false)
  })
})
