import type { Assignment, Member, Team } from './types'

export const secureIntBelow = (limit: number): number => {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 0x100000000) throw new Error('乱数の範囲が不正です。')
  const max = 0x100000000
  const ceiling = max - (max % limit)
  const data = new Uint32Array(1)
  do crypto.getRandomValues(data)
  while (data[0] >= ceiling)
  return data[0] % limit
}

export const shuffled = <T,>(items: readonly T[]): T[] => {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i -= 1) {
    const j = secureIntBelow(i + 1)
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

const combinations = (count: number, choose: number): number[][] => {
  const output: number[][] = []
  const visit = (start: number, current: number[]) => {
    if (current.length === choose) return void output.push(current)
    for (let i = start; i <= count - (choose - current.length); i += 1) visit(i + 1, [...current, i])
  }
  visit(0, [])
  return output
}

const memberChoices = (member: Member, teams: Team[]): number[] => {
  if (member.allowedTeamIds === null) return teams.map((_, index) => index)
  const allowed = new Set(member.allowedTeamIds)
  return teams.flatMap((team, index) => allowed.has(team.id) ? [index] : [])
}

/** Checks the remaining assignment as a capacity-constrained bipartite matching. */
const canFit = (members: Member[], teams: Team[], capacities: number[]): boolean => {
  if (capacities.reduce((sum, value) => sum + value, 0) !== members.length) return false
  const source = 0
  const memberStart = 1
  const teamStart = memberStart + members.length
  const sink = teamStart + teams.length
  const graph: Array<Array<{ to: number; reverse: number; capacity: number }>> = Array.from({ length: sink + 1 }, () => [])
  const addEdge = (from: number, to: number, capacity: number) => {
    const forward = { to, reverse: graph[to].length, capacity }
    const backward = { to: from, reverse: graph[from].length, capacity: 0 }
    graph[from].push(forward)
    graph[to].push(backward)
  }
  members.forEach((member, memberIndex) => {
    addEdge(source, memberStart + memberIndex, 1)
    memberChoices(member, teams).forEach((teamIndex) => addEdge(memberStart + memberIndex, teamStart + teamIndex, 1))
  })
  capacities.forEach((capacity, teamIndex) => addEdge(teamStart + teamIndex, sink, capacity))

  let flow = 0
  while (true) {
    const parents: Array<{ node: number; edge: number } | null> = Array(sink + 1).fill(null)
    const queue = [source]
    parents[source] = { node: -1, edge: -1 }
    for (let offset = 0; offset < queue.length && !parents[sink]; offset += 1) {
      const node = queue[offset]
      graph[node].forEach((edge, edgeIndex) => {
        if (edge.capacity > 0 && !parents[edge.to]) {
          parents[edge.to] = { node, edge: edgeIndex }
          queue.push(edge.to)
        }
      })
    }
    if (!parents[sink]) break
    let node = sink
    while (node !== source) {
      const parent = parents[node] as { node: number; edge: number }
      const edge = graph[parent.node][parent.edge]
      edge.capacity -= 1
      graph[node][edge.reverse].capacity += 1
      node = parent.node
    }
    flow += 1
  }
  return flow === members.length
}

const targetCapacities = (memberCount: number, teamCount: number): number[][] => {
  const base = Math.floor(memberCount / teamCount)
  const largeCount = memberCount % teamCount
  return combinations(teamCount, largeCount).map((largeTeams) =>
    Array.from({ length: teamCount }, (_, index) => base + (largeTeams.includes(index) ? 1 : 0)),
  )
}

export const validateSetup = (members: Member[], teams: Team[]): string | null => {
  if (members.length === 0) return 'メンバーを1人以上登録してください。'
  if (teams.length < 2) return 'チームは2つ以上にしてください。'
  if (teams.length > members.length) return 'チーム数をメンバー数以下にしてください。'
  if (members.some((member) => !member.name.trim())) return '空欄のメンバー名を修正してください。'
  const normalizedNames = members.map((member) => member.name.trim().toLocaleLowerCase('ja'))
  if (new Set(normalizedNames).size !== normalizedNames.length) return '同じ名前のメンバーがいます。名前を変更してください。'
  if (teams.some((team) => !team.name.trim())) return '空欄のチーム名を修正してください。'
  const validIds = new Set(teams.map((team) => team.id))
  if (members.some((member) => member.allowedTeamIds !== null && member.allowedTeamIds.length === 0)) return '参加できるチームが1つもないメンバーがいます。候補を1つ以上選んでください。'
  if (members.some((member) => member.allowedTeamIds?.some((id) => !validIds.has(id)))) return '存在しないチームが候補に含まれています。設定し直してください。'

  const maxSize = Math.ceil(members.length / teams.length)
  const fixedCounts = teams.map((team) => members.filter((member) => member.allowedTeamIds?.length === 1 && member.allowedTeamIds[0] === team.id).length)
  const crowdedIndex = fixedCounts.findIndex((count) => count > maxSize)
  if (crowdedIndex >= 0) return `「${teams[crowdedIndex].name}」に確定した人数が多すぎるため、人数差を1人以内にできません。候補チームを増やしてください。`

  const feasible = targetCapacities(members.length, teams.length).some((capacities) => canFit(members, teams, capacities))
  if (!feasible) return '指定された候補では、チームの人数差を1人以内にできません。いずれかのメンバーの候補チームを増やしてください。'
  return null
}

export const createDraw = (members: Member[], teams: Team[]): Assignment => {
  const error = validateSetup(members, teams)
  if (error) throw new Error(error)
  const feasibleTargets = targetCapacities(members.length, teams.length).filter((capacities) => canFit(members, teams, capacities))
  const capacities = shuffled(feasibleTargets)[0]
  const remaining = [...members]
  const assignments: Assignment = {}

  while (remaining.length > 0) {
    // Fewer candidates means higher priority; ties remain random.
    const prioritized = shuffled(remaining).sort((a, b) => {
      const aCount = memberChoices(a, teams).filter((index) => capacities[index] > 0).length
      const bCount = memberChoices(b, teams).filter((index) => capacities[index] > 0).length
      return aCount - bCount
    })
    const member = prioritized[0]
    const rest = remaining.filter((item) => item.id !== member.id)
    const feasibleChoices = shuffled(memberChoices(member, teams).filter((teamIndex) => capacities[teamIndex] > 0)).filter((teamIndex) => {
      const nextCapacities = [...capacities]
      nextCapacities[teamIndex] -= 1
      return canFit(rest, teams, nextCapacities)
    })
    const teamIndex = feasibleChoices[secureIntBelow(feasibleChoices.length)]
    assignments[member.id] = teams[teamIndex].id
    capacities[teamIndex] -= 1
    remaining.splice(remaining.findIndex((item) => item.id === member.id), 1)
  }
  return assignments
}
