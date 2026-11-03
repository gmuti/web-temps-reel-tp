import { FloorPlanErrorCode, floorPlanProblems, type FloorPlan, type FloorTable, type TableShape } from '@app/shared'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ApiError, saveFloorPlan } from '@/lib/api'
import { addTable, faultyTables, placeTable, withShape } from './floor-editor-model'

const sameTables = (a: readonly FloorTable[], b: readonly FloorTable[]) => {
  const key = (tables: readonly FloorTable[]) =>
    JSON.stringify([...tables].sort((first, second) => first.number - second.number))
  return key(a) === key(b)
}

/**
 * Éditeur de plan : un brouillon des tables, modifié localement puis enregistré
 * d'un bloc (PUT /floor-plan) sur la version du plan chargée. Si quelqu'un a
 * modifié le plan entre-temps, l'enregistrement est refusé : le plan est
 * rechargé et le brouillon abandonné.
 */
export function useFloorEditor(plan: FloorPlan | null, reloadPlan: () => Promise<void>) {
  // Brouillon : null hors édition.
  const [draft, setDraft] = useState<FloorTable[] | null>(null)
  const [selected, setSelected] = useState<number | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  // Version du plan sur laquelle le brouillon a été commencé.
  const [baseVersion, setBaseVersion] = useState(0)

  const problems = useMemo(() => (draft ? floorPlanProblems(draft) : []), [draft])
  const faulty = useMemo(() => (draft ? faultyTables(draft) : new Set<number>()), [draft])
  const hasChanges = draft !== null && plan !== null && !sameTables(draft, plan.tables)

  const update = (tableNumber: number, change: (table: FloorTable) => FloorTable) =>
    setDraft((current) => current && current.map((table) => (table.number === tableNumber ? change(table) : table)))

  const start = () => {
    if (!plan) return
    setDraft(plan.tables)
    setBaseVersion(plan.version)
    setSelected(null)
  }

  const cancel = () => {
    setDraft(null)
    setSelected(null)
  }

  const add = () => {
    if (!draft) return
    const table = addTable(draft)
    setDraft([...draft, table])
    setSelected(table.number)
  }

  const move = (tableNumber: number, x: number, z: number) => update(tableNumber, (table) => placeTable(table, x, z))

  const remove = (tableNumber: number) => {
    setDraft((current) => current && current.filter((table) => table.number !== tableNumber))
    setSelected(null)
  }

  const renumber = (tableNumber: number, nextNumber: number) => {
    update(tableNumber, (table) => ({ ...table, number: nextNumber }))
    setSelected(nextNumber)
  }

  const reshape = (tableNumber: number, shape: TableShape) => update(tableNumber, (table) => withShape(table, shape))

  const save = async () => {
    if (!draft) return
    setIsSaving(true)
    try {
      await saveFloorPlan({ expectedVersion: baseVersion, tables: draft })
      toast.success('Plan de salle enregistré.')
      cancel()
    } catch (err) {
      if (err instanceof ApiError && err.errorCode === FloorPlanErrorCode.FLOOR_PLAN_CONFLICT) {
        toast.warning(`${err.message} Plan rechargé : vos modifications sont abandonnées.`)
        cancel()
        await reloadPlan()
      } else {
        toast.error(err instanceof Error ? err.message : "Impossible d'enregistrer le plan.")
      }
    } finally {
      setIsSaving(false)
    }
  }

  return {
    draft,
    selected,
    problems,
    faulty,
    hasChanges,
    isSaving,
    setSelected,
    start,
    cancel,
    add,
    move,
    remove,
    renumber,
    reshape,
    save,
  }
}
