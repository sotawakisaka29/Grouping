import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createDraw, validateSetup } from './draw'
import type { Member, Team } from './types'

const teams = (count: number): Team[] => Array.from({ length: count }, (_, i) => ({ id: `t${i}`, name: `チーム${i}`, color: '#000000' }))
const members = (count: number): Member[] => Array.from({ length: count }, (_, i) => ({ id: `m${i}`, name: `メンバー${i}`, fixedTeamId: null }))

beforeEach(() => {
  let seed = 1
  vi.stubGlobal('crypto', { getRandomValues: (values: Uint32Array) => { for (let i = 0; i < values.length; i += 1) values[i] = (seed++ * 2654435761) >>> 0; return values } })
})

describe('createDraw', () => {
  it('8人を2チームに4人ずつ割り当てる', () => {
    const ts = teams(2)
    const result = createDraw(members(8), ts)
    expect(ts.map((team) => Object.values(result).filter((id) => id === team.id).length)).toEqual([4, 4])
  })

  it('10人を3チームに4・3・3人で割り当てる', () => {
    const ts = teams(3)
    const result = createDraw(members(10), ts)
    const sizes = ts.map((team) => Object.values(result).filter((id) => id === team.id).length).sort((a, b) => b - a)
    expect(sizes).toEqual([4, 3, 3])
  })

  it('固定割り当てを守る', () => {
    const ts = teams(2)
    const ms = members(8)
    ms[0].fixedTeamId = ts[1].id
    ms[1].fixedTeamId = ts[0].id
    const result = createDraw(ms, ts)
    expect(result[ms[0].id]).toBe(ts[1].id)
    expect(result[ms[1].id]).toBe(ts[0].id)
  })

  it('実行不可能な固定設定を説明する', () => {
    const ts = teams(2)
    const ms = members(6)
    ms.slice(0, 4).forEach((member) => { member.fixedTeamId = ts[0].id })
    expect(validateSetup(ms, ts)).toContain('固定人数が多すぎる')
  })
})
