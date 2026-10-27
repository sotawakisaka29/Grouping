import type { SavedState } from './types'

const KEY = 'team-draw-state-v1'

export const loadState = (fallback: SavedState): SavedState => {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || (parsed as Partial<SavedState>).version !== 1) return fallback
    const value = parsed as SavedState
    if (!Array.isArray(value.members) || !Array.isArray(value.teams)) return fallback
    return value
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
