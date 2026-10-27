import type { Member, SavedState } from './types'

const KEY = 'team-draw-state-v1'

export const loadState = (fallback: SavedState): SavedState => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return fallback
    const stored = parsed as Record<string, unknown>
    if (stored.version !== 1 && stored.version !== 2) return fallback
    const value = stored as unknown as SavedState
    if (!Array.isArray(value.members) || !Array.isArray(value.teams)) return fallback
    if (stored.version === 1) {
      return {
        ...value,
        version: 2,
        members: (value.members as unknown as Array<Member & { fixedTeamId?: string | null }>).map((member) => ({
          id: member.id,
          name: member.name,
          allowedTeamIds: member.fixedTeamId ? [member.fixedTeamId] : null,
        })),
      }
    }
    return {
      ...value,
      members: value.members.map((member) => ({
        ...member,
        allowedTeamIds: Array.isArray(member.allowedTeamIds) ? member.allowedTeamIds : null,
      })),
    }
  } catch {
    return fallback
  }
}

export const saveState = (state: SavedState): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify(state))
  } catch {
    // The app remains usable when storage is unavailable.
  }
}
