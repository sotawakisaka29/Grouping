export type Member = { id: string; name: string; allowedTeamIds: string[] | null }
export type Team = { id: string; name: string; color: string }
export type Assignment = Record<string, string>
export type Draw = {
  assignments: Assignment
  revealedIds: string[]
  displayOrder: string[]
}
export type SavedState = {
  version: 2
  members: Member[]
  teams: Team[]
  draw: Draw | null
  showRevealedTeams: boolean
  screen: 'settings' | 'reveal' | 'results'
}
