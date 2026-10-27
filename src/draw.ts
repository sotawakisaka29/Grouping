import type { Assignment, Member, Team } from './types'

const factorial = (n: number): bigint => {
  let value = 1n
  for (let i = 2; i <= n; i += 1) value *= BigInt(i)
  return value
}

export const secureIntBelow = (limit: number): number => {
  if (!Number.isSafeInteger(limit) || limit <= 0 || limit > 0x100000000) {
    throw new Error('乱数の範囲が不正です。')
  }
  const max = 0x100000000
  const ceiling = max - (max % limit)
  const data = new Uint32Array(1)
  do crypto.getRandomValues(data)
  while (data[0] >= ceiling)
  return data[0] % limit
}

const randomBigIntBelow = (limit: bigint): bigint => {
  if (limit <= 0n) throw new Error('抽選の重みが不正です。')
  const bits = limit.toString(2).length
  const words = Math.ceil(bits / 32)
  const excess = BigInt(words * 32 - bits)
  const data = new Uint32Array(words)
  while (true) {
    crypto.getRandomValues(data)
    let value = 0n
    for (const word of data) value = (value << 32n) | BigInt(word)
    value >>= excess
    if (value < limit) return value
  }
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
    if (current.length === choose) {
      output.push(current)
      return
    }
    for (let i = start; i <= count - (choose - current.length); i += 1) {
      visit(i + 1, [...current, i])
    }
  }
  visit(0, [])
  return output
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
  if (members.some((member) => member.fixedTeamId && !validIds.has(member.fixedTeamId))) {
    return '存在しないチームへの固定割り当てがあります。設定し直してください。'
  }
  const base = Math.floor(members.length / teams.length)
  const largeCount = members.length % teams.length
  const fixed = teams.map((team) => members.filter((member) => member.fixedTeamId === team.id).length)
  const targetSets = combinations(teams.length, largeCount)
  const feasible = targetSets.some((largeTeams) => fixed.every((count, i) => count <= base + (largeTeams.includes(i) ? 1 : 0)))
  if (!feasible) {
    const crowded = fixed.map((count, i) => ({ count, name: teams[i].name })).sort((a, b) => b.count - a.count)[0]
    return `「${crowded.name}」の固定人数が多すぎるため、人数差を1人以内にできません。固定割り当てを減らしてください。`
  }
  return null
}

export const createDraw = (members: Member[], teams: Team[]): Assignment => {
  const error = validateSetup(members, teams)
  if (error) throw new Error(error)

  const fixedCounts = teams.map((team) => members.filter((member) => member.fixedTeamId === team.id).length)
  const randomMembers = members.filter((member) => !member.fixedTeamId)
  const base = Math.floor(members.length / teams.length)
  const largeCount = members.length % teams.length

  const candidates = combinations(teams.length, largeCount)
    .map((largeTeams) => {
      const targets = teams.map((_, i) => base + (largeTeams.includes(i) ? 1 : 0))
      const remaining = targets.map((target, i) => target - fixedCounts[i])
      if (remaining.some((slots) => slots < 0)) return null
      const weight = factorial(randomMembers.length) / remaining.reduce((product, slots) => product * factorial(slots), 1n)
      return { remaining, weight }
    })
    .filter((candidate): candidate is { remaining: number[]; weight: bigint } => candidate !== null)

  const totalWeight = candidates.reduce((sum, candidate) => sum + candidate.weight, 0n)
  let ticket = randomBigIntBelow(totalWeight)
  let selected = candidates[0]
  for (const candidate of candidates) {
    if (ticket < candidate.weight) {
      selected = candidate
      break
    }
    ticket -= candidate.weight
  }

  const assignments: Assignment = {}
  for (const member of members) {
    if (member.fixedTeamId) assignments[member.id] = member.fixedTeamId
  }
  const pool = shuffled(randomMembers)
  let offset = 0
  selected.remaining.forEach((slots, teamIndex) => {
    for (let i = 0; i < slots; i += 1) assignments[pool[offset + i].id] = teams[teamIndex].id
    offset += slots
  })
  return assignments
}
