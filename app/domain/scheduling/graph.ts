import type { Dependency, Id, Stage } from '../models/types'

export interface GraphValidation {
  valid: boolean
  reason?: string
}

export function successorsOf(stageId: Id, dependencies: Dependency[]): Id[] {
  return dependencies
    .filter(dependency => dependency.predecessorStageId === stageId)
    .map(dependency => dependency.successorStageId)
    .sort()
}

export function transitiveSuccessors(stageIds: Iterable<Id>, dependencies: Dependency[]): Set<Id> {
  const result = new Set<Id>()
  const outgoing = new Map<Id, Id[]>()
  for (const dependency of dependencies) {
    const values = outgoing.get(dependency.predecessorStageId)
    if (values) values.push(dependency.successorStageId)
    else outgoing.set(dependency.predecessorStageId, [dependency.successorStageId])
  }
  for (const values of outgoing.values()) values.sort()
  const queue = [...stageIds].sort()
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!
    for (const successor of outgoing.get(current) ?? []) {
      if (!result.has(successor)) {
        result.add(successor)
        queue.push(successor)
      }
    }
  }
  return result
}

export function topologicalSort(stageIds: Iterable<Id>, dependencies: Dependency[]): Id[] {
  const ids = [...new Set(stageIds)].sort()
  const idSet = new Set(ids)
  const indegree = new Map(ids.map(id => [id, 0]))
  const outgoing = new Map(ids.map(id => [id, [] as Id[]]))
  for (const dependency of dependencies) {
    if (!idSet.has(dependency.predecessorStageId) || !idSet.has(dependency.successorStageId)) continue
    indegree.set(dependency.successorStageId, (indegree.get(dependency.successorStageId) ?? 0) + 1)
    outgoing.get(dependency.predecessorStageId)!.push(dependency.successorStageId)
  }
  for (const values of outgoing.values()) values.sort()
  const queue = ids.filter(id => indegree.get(id) === 0)
  const result: Id[] = []
  while (queue.length > 0) {
    const current = queue.shift()!
    result.push(current)
    for (const successor of outgoing.get(current) ?? []) {
      const next = (indegree.get(successor) ?? 0) - 1
      indegree.set(successor, next)
      if (next === 0) {
        queue.push(successor)
        queue.sort()
      }
    }
  }
  if (result.length !== ids.length) throw new Error('Граф зависимостей содержит цикл')
  return result
}

export function validateNewDependency(
  candidate: Pick<Dependency, 'predecessorStageId' | 'successorStageId' | 'epicId'>,
  stages: Stage[],
  dependencies: Dependency[],
): GraphValidation {
  if (candidate.predecessorStageId === candidate.successorStageId) {
    return { valid: false, reason: 'Этап не может зависеть от самого себя' }
  }
  const predecessor = stages.find(stage => stage.id === candidate.predecessorStageId)
  const successor = stages.find(stage => stage.id === candidate.successorStageId)
  if (!predecessor || !successor) return { valid: false, reason: 'Один из этапов не найден' }
  if (predecessor.epicId !== successor.epicId || predecessor.epicId !== candidate.epicId) {
    return { valid: false, reason: 'Межэпиковые зависимости не поддерживаются' }
  }
  if (dependencies.some(dependency => dependency.predecessorStageId === candidate.predecessorStageId && dependency.successorStageId === candidate.successorStageId)) {
    return { valid: false, reason: 'Такая зависимость уже существует' }
  }
  const hypothetical = [...dependencies, { ...candidate, id: 'candidate' } as Dependency]
  try {
    topologicalSort(stages.map(stage => stage.id), hypothetical)
    return { valid: true }
  } catch {
    return { valid: false, reason: 'Зависимость создаёт цикл' }
  }
}
