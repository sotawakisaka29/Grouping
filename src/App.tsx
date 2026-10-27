import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronLeft, Copy, Expand, Eye, EyeOff, Maximize2, Pencil, Plus, RotateCcw, Shuffle, Trash2, X } from 'lucide-react'
import { createDraw, shuffled, validateSetup } from './draw'
import { loadState, saveState } from './storage'
import type { Draw, Member, SavedState, Team } from './types'

const colors = ['#FF6B61', '#4D96FF', '#52C788', '#FFB84D', '#9B7BFF', '#35B9C7', '#F16FA3', '#697386']
const teamLetter = (index: number) => String.fromCharCode(65 + index)
const makeId = () => crypto.randomUUID()

const initialTeams: Team[] = [
  { id: makeId(), name: 'チームA', color: colors[0] },
  { id: makeId(), name: 'チームB', color: colors[1] },
]

const fallback: SavedState = {
  version: 2,
  members: [],
  teams: initialTeams,
  draw: null,
  showRevealedTeams: true,
  screen: 'settings',
}

function App() {
  const [state, setState] = useState<SavedState>(() => loadState(fallback))
  const [notice, setNotice] = useState('')

  useEffect(() => saveState(state), [state])

  const update = (patch: Partial<SavedState>) => setState((current) => ({ ...current, ...patch }))

  const startDraw = () => {
    const error = validateSetup(state.members, state.teams)
    if (error) return setNotice(error)
    try {
      const assignments = createDraw(state.members, state.teams)
      update({
        draw: { assignments, revealedIds: [], displayOrder: shuffled(state.members.map((member) => member.id)) },
        screen: 'reveal',
      })
      setNotice('')
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '抽選処理に失敗しました。もう一度お試しください。')
    }
  }

  const discardAndEdit = () => {
    if (state.draw && !window.confirm('現在の抽選結果を破棄して設定画面に戻りますか？')) return
    update({ draw: null, screen: 'settings' })
  }

  const redraw = () => {
    if (!window.confirm('現在の結果を破棄して、同じ設定でもう一度抽選しますか？')) return
    try {
      update({
        draw: { assignments: createDraw(state.members, state.teams), revealedIds: [], displayOrder: shuffled(state.members.map((m) => m.id)) },
        screen: 'reveal',
      })
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '再抽選に失敗しました。')
    }
  }

  if (state.screen === 'settings' || !state.draw) {
    return <SettingsScreen state={state} update={update} notice={notice} setNotice={setNotice} onStart={startDraw} />
  }
  if (state.screen === 'results') {
    return <ResultsScreen state={state} onRedraw={redraw} onEdit={discardAndEdit} />
  }
  return <RevealScreen state={state} update={update} onRedraw={redraw} onEdit={discardAndEdit} />
}

type SettingsProps = {
  state: SavedState
  update: (patch: Partial<SavedState>) => void
  notice: string
  setNotice: (value: string) => void
  onStart: () => void
}

function SettingsScreen({ state, update, notice, setNotice, onStart }: SettingsProps) {
  const [name, setName] = useState('')
  const [bulk, setBulk] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const addNames = (values: string[]) => {
    const cleaned = values.map((value) => value.trim()).filter(Boolean)
    const known = new Set(state.members.map((member) => member.name.toLocaleLowerCase('ja')))
    const accepted: string[] = []
    const skipped: string[] = []
    for (const candidate of cleaned) {
      const key = candidate.toLocaleLowerCase('ja')
      if (known.has(key)) skipped.push(candidate)
      else {
        known.add(key)
        accepted.push(candidate)
      }
    }
    if (!accepted.length) {
      setNotice(cleaned.length ? '入力された名前はすでに登録されています。' : '名前を入力してください。')
      return
    }
    update({ members: [...state.members, ...accepted.map((memberName) => ({ id: makeId(), name: memberName, allowedTeamIds: null }))] })
    setNotice(skipped.length ? `${accepted.length}人を追加しました。重複していた${skipped.length}件は追加していません。` : '')
  }

  const setTeamCount = (count: number) => {
    const safe = Math.max(2, Math.min(12, count || 2))
    if (safe > state.teams.length) {
      const additions = Array.from({ length: safe - state.teams.length }, (_, offset) => {
        const index = state.teams.length + offset
        return { id: makeId(), name: `チーム${teamLetter(index)}`, color: colors[index % colors.length] }
      })
      update({ teams: [...state.teams, ...additions] })
    } else if (safe < state.teams.length) {
      const remainingTeams = state.teams.slice(0, safe)
      const remainingIds = new Set(remainingTeams.map((team) => team.id))
      update({
        teams: remainingTeams,
        members: state.members.map((member) => {
          if (member.allowedTeamIds === null) return member
          const allowedTeamIds = member.allowedTeamIds.filter((id) => remainingIds.has(id))
          return { ...member, allowedTeamIds: allowedTeamIds.length === 0 || allowedTeamIds.length === remainingTeams.length ? null : allowedTeamIds }
        }),
      })
    }
  }

  const toggleCandidate = (member: Member, teamId: string, checked: boolean) => {
    const current = member.allowedTeamIds ?? state.teams.map((team) => team.id)
    const next = checked ? [...new Set([...current, teamId])] : current.filter((id) => id !== teamId)
    if (next.length === 0) {
      setNotice(`${member.name}さんの候補チームを1つ以上残してください。`)
      return
    }
    const allowedTeamIds = next.length === state.teams.length ? null : next
    update({ members: state.members.map((item) => item.id === member.id ? { ...item, allowedTeamIds } : item) })
    setNotice('')
  }

  const candidateSummary = (member: Member) => {
    if (member.allowedTeamIds === null || member.allowedTeamIds.length === state.teams.length) return 'すべて（ランダム）'
    const names = state.teams.filter((team) => member.allowedTeamIds?.includes(team.id)).map((team) => team.name)
    return names.length === 1 ? `${names[0]}に確定` : names.join('・')
  }

  const saveMemberName = (id: string) => {
    const nextName = editingName.trim()
    if (!nextName) return setNotice('名前を空欄にはできません。')
    if (state.members.some((member) => member.id !== id && member.name.toLocaleLowerCase('ja') === nextName.toLocaleLowerCase('ja'))) {
      return setNotice('同じ名前のメンバーがすでに登録されています。')
    }
    update({ members: state.members.map((member) => member.id === id ? { ...member, name: nextName } : member) })
    setEditingId(null)
    setNotice('')
  }

  return (
    <div className="app-shell">
      <header className="topbar"><Brand /><span className="status-pill">設定</span></header>
      <main className="settings-page">
        <section className="intro">
          <p className="eyebrow">TEAM DRAW</p>
          <h1>チーム分け</h1>
          <p>メンバーとチームを設定して、ひとりずつ結果を公開します。</p>
        </section>

        {notice && <div className="notice" role="alert">{notice}<button onClick={() => setNotice('')} aria-label="閉じる"><X size={16} /></button></div>}

        <div className="settings-grid">
          <section className="panel member-panel">
            <SectionTitle number="01" title="メンバー" detail={`${state.members.length}人`} />
            <form className="inline-form" onSubmit={(event) => { event.preventDefault(); addNames([name]); setName('') }}>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="名前を入力" aria-label="追加するメンバー名" />
              <button className="secondary-button" type="submit"><Plus size={17} />追加</button>
            </form>
            <details className="bulk-box">
              <summary>複数人をまとめて追加</summary>
              <textarea value={bulk} onChange={(event) => setBulk(event.target.value)} placeholder={'1行に1人ずつ入力\n田中\n佐藤\n鈴木'} />
              <button className="text-button" aria-label="入力した名前を追加" onClick={() => { addNames(bulk.split(/\r?\n/)); setBulk('') }}>入力した名前を追加</button>
            </details>
            <div className="member-list">
              {state.members.length === 0 && <Empty text="まだメンバーがいません" />}
              {state.members.map((member, index) => (
                <div className="member-row" key={member.id}>
                  <span className="row-index">{String(index + 1).padStart(2, '0')}</span>
                  {editingId === member.id ? (
                    <form className="edit-form" onSubmit={(event) => { event.preventDefault(); saveMemberName(member.id) }}>
                      <input autoFocus value={editingName} onChange={(event) => setEditingName(event.target.value)} />
                      <button aria-label="保存"><Check size={17} /></button>
                      <button type="button" aria-label="キャンセル" onClick={() => setEditingId(null)}><X size={17} /></button>
                    </form>
                  ) : <span className="member-name">{member.name}</span>}
                  {editingId !== member.id && <div className="row-actions">
                    <button aria-label={`${member.name}を編集`} onClick={() => { setEditingId(member.id); setEditingName(member.name) }}><Pencil size={16} /></button>
                    <button className="danger-icon" aria-label={`${member.name}を削除`} onClick={() => update({ members: state.members.filter((item) => item.id !== member.id) })}><Trash2 size={16} /></button>
                  </div>}
                </div>
              ))}
            </div>
          </section>

          <div className="right-stack">
            <section className="panel">
              <SectionTitle number="02" title="チーム設定" detail={`${state.teams.length}チーム`} />
              <label className="field-label" htmlFor="team-count">チーム数</label>
              <div className="stepper">
                <button onClick={() => setTeamCount(state.teams.length - 1)} aria-label="チームを減らす">−</button>
                <input id="team-count" type="number" min="2" max="12" value={state.teams.length} onChange={(event) => setTeamCount(Number(event.target.value))} />
                <button onClick={() => setTeamCount(state.teams.length + 1)} aria-label="チームを増やす">＋</button>
              </div>
              <div className="team-editor">
                {state.teams.map((team) => (
                  <div className="team-edit-row" key={team.id}>
                    <label className="color-swatch" style={{ backgroundColor: team.color }}>
                      <input type="color" value={team.color} aria-label={`${team.name}の色`} onChange={(event) => update({ teams: state.teams.map((item) => item.id === team.id ? { ...item, color: event.target.value } : item) })} />
                    </label>
                    <input value={team.name} aria-label="チーム名" onChange={(event) => update({ teams: state.teams.map((item) => item.id === team.id ? { ...item, name: event.target.value } : item) })} />
                  </div>
                ))}
              </div>
            </section>

            <section className="panel">
              <SectionTitle number="03" title="参加候補チーム" detail="任意" />
              <p className="section-help">入れるチームを絞り込めます。候補が少ない人から優先して抽選します。</p>
              <div className="assignment-list">
                {state.members.length === 0 && <Empty text="メンバーを追加すると設定できます" />}
                {state.members.map((member) => (
                  <details className="candidate-row" key={member.id}>
                    <summary><span>{member.name}</span><small>{candidateSummary(member)}</small></summary>
                    <div className="candidate-options">
                      <button type="button" className="all-teams-option" onClick={() => update({ members: state.members.map((item) => item.id === member.id ? { ...item, allowedTeamIds: null } : item) })}>すべて選択</button>
                      <div className="team-checkboxes">
                        {state.teams.map((team) => {
                          const checked = member.allowedTeamIds === null || member.allowedTeamIds.includes(team.id)
                          return <label key={team.id} className={checked ? 'is-checked' : ''}>
                            <input type="checkbox" checked={checked} onChange={(event) => toggleCandidate(member, team.id, event.target.checked)} />
                            <i style={{ backgroundColor: team.color }} />
                            <span>{team.name}</span>
                          </label>
                        })}
                      </div>
                    </div>
                  </details>
                ))}
              </div>
            </section>
          </div>
        </div>

        <section className="start-bar">
          <div><span>{state.members.length}</span> 人を <span>{state.teams.length}</span> チームに分けます</div>
          <button className="primary-button" onClick={onStart}>抽選開始 <span>→</span></button>
        </section>
      </main>
    </div>
  )
}

type RevealProps = {
  state: SavedState
  update: (patch: Partial<SavedState>) => void
  onRedraw: () => void
  onEdit: () => void
}

function RevealScreen({ state, update, onRedraw, onEdit }: RevealProps) {
  const draw = state.draw as Draw
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [flipped, setFlipped] = useState(false)
  const revealed = new Set(draw.revealedIds)
  const selected = state.members.find((member) => member.id === selectedId)
  const selectedTeam = selected ? state.teams.find((team) => team.id === draw.assignments[selected.id]) : undefined

  const openCard = (id: string) => {
    setSelectedId(id)
    setFlipped(revealed.has(id))
  }
  const reveal = () => {
    if (!selectedId || flipped) return
    setFlipped(true)
    if (!revealed.has(selectedId)) update({ draw: { ...draw, revealedIds: [...draw.revealedIds, selectedId] } })
  }
  const close = () => {
    const completed = draw.revealedIds.length + (selectedId && !revealed.has(selectedId) && flipped ? 1 : 0) === state.members.length
    setSelectedId(null)
    setFlipped(false)
    if (completed) update({ screen: 'results' })
  }

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && selectedId) close()
      if (event.key === 'Enter' && selectedId) reveal()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const visibleDraw = state.draw as Draw
  const visibleRevealed = new Set(visibleDraw.revealedIds)

  return (
    <div className="app-shell reveal-shell">
      <header className="topbar reveal-topbar">
        <Brand />
        <div className="header-actions">
          <button className="quiet-button" onClick={() => document.documentElement.requestFullscreen?.()}><Maximize2 size={16} />全画面</button>
          <button className="quiet-button" onClick={onEdit}><ChevronLeft size={16} />設定に戻る</button>
        </div>
      </header>
      <main className="reveal-page">
        <div className="reveal-heading">
          <div><p className="eyebrow">REVEAL</p><h1>結果を公開</h1><p>好きな順番でカードを選んでください。</p></div>
          <div className="progress-block"><strong>{visibleDraw.revealedIds.length}</strong><span>/ {state.members.length} 人公開済み</span><div className="progress-track"><i style={{ width: `${state.members.length ? visibleDraw.revealedIds.length / state.members.length * 100 : 0}%` }} /></div></div>
        </div>
        <div className="reveal-toolbar">
          <button className="quiet-button" onClick={() => update({ draw: { ...visibleDraw, displayOrder: shuffled(visibleDraw.displayOrder) } })}><Shuffle size={16} />表示順をシャッフル</button>
          <button className="quiet-button" onClick={() => update({ showRevealedTeams: !state.showRevealedTeams })}>{state.showRevealedTeams ? <Eye size={16} /> : <EyeOff size={16} />}公開済みの結果</button>
          <button className="quiet-button" onClick={onRedraw}><RotateCcw size={16} />再抽選</button>
        </div>
        <div className="card-grid">
          {visibleDraw.displayOrder.map((id) => {
            const member = state.members.find((item) => item.id === id)
            if (!member) return null
            const team = state.teams.find((item) => item.id === visibleDraw.assignments[id])
            const isRevealed = visibleRevealed.has(id)
            const showTeam = isRevealed && state.showRevealedTeams
            return <button key={id} className={`member-card ${isRevealed ? 'is-revealed' : ''}`} style={showTeam ? { borderColor: team?.color, '--team-color': team?.color } as React.CSSProperties : undefined} onClick={() => openCard(id)}>
              <span className="card-state">{isRevealed ? '公開済み' : '未公開'}</span>
              <strong>{member.name}</strong>
              {showTeam && <span className="card-team"><i style={{ backgroundColor: team?.color }} />{team?.name}</span>}
              {!showTeam && <span className="card-prompt">選択する <span>→</span></span>}
            </button>
          })}
        </div>
      </main>

      {selected && selectedTeam && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) close() }}>
        <div className="reveal-modal" role="dialog" aria-modal="true" aria-label={`${selected.name}の抽選結果`}>
          <button className="modal-close" onClick={close} aria-label="閉じる"><X size={20} /></button>
          <p className="modal-label">抽選結果</p>
          <div className={`flip-card ${flipped ? 'flipped' : ''}`}>
            <div className="flip-inner">
              <div className="flip-face flip-front" aria-hidden={flipped}><span>MEMBER</span><strong>{selected.name}</strong><small>結果はまだ公開されていません</small></div>
              <div className="flip-face flip-back" aria-hidden={!flipped} style={{ '--team-color': selectedTeam.color } as React.CSSProperties}><span>TEAM</span><strong>{selectedTeam.name}</strong><small>{selected.name}</small></div>
            </div>
          </div>
          {!flipped ? <button className="primary-button modal-action" onClick={reveal}>結果を見る</button> : <button className="secondary-button modal-action" onClick={close}>{visibleDraw.revealedIds.length === state.members.length ? '結果一覧へ' : '一覧に戻る'}</button>}
          <p className="keyboard-hint">Enterで公開 ・ Escで閉じる</p>
        </div>
      </div>}
    </div>
  )
}

function ResultsScreen({ state, onRedraw, onEdit }: { state: SavedState; onRedraw: () => void; onEdit: () => void }) {
  const [copied, setCopied] = useState(false)
  const draw = state.draw as Draw
  const grouped = useMemo(() => state.teams.map((team) => ({ team, members: state.members.filter((member) => draw.assignments[member.id] === team.id) })), [state.teams, state.members, draw.assignments])
  const copy = async () => {
    const text = grouped.map(({ team, members }) => `${team.name}（${members.length}人）\n${members.map((member) => member.name).join('、')}`).join('\n\n')
    await navigator.clipboard.writeText(text)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1800)
  }
  return <div className="app-shell">
    <header className="topbar"><Brand /><span className="status-pill">完了</span></header>
    <main className="results-page">
      <div className="results-heading"><p className="eyebrow">RESULT</p><h1>結果一覧</h1><p>{state.members.length}人のチーム分けが完了しました。</p></div>
      <div className="result-grid">
        {grouped.map(({ team, members }) => <section className="result-team" key={team.id} style={{ '--team-color': team.color } as React.CSSProperties}>
          <div className="result-team-head"><i /><div><h2>{team.name}</h2><p>{members.length}人</p></div></div>
          <ol>{members.map((member, index) => <li key={member.id}><span>{String(index + 1).padStart(2, '0')}</span>{member.name}</li>)}</ol>
        </section>)}
      </div>
      <div className="result-actions">
        <button className="secondary-button" onClick={copy}>{copied ? <Check size={17} /> : <Copy size={17} />}{copied ? 'コピーしました' : '結果をコピー'}</button>
        <button className="secondary-button" onClick={onRedraw}><RotateCcw size={17} />もう一度抽選</button>
        <button className="primary-button" onClick={onEdit}>設定を変更</button>
      </div>
    </main>
  </div>
}

function Brand() {
  return <div className="brand"><span className="brand-mark"><i /><i /><i /></span><strong>チーム分け</strong></div>
}

function SectionTitle({ number, title, detail }: { number: string; title: string; detail: string }) {
  return <div className="section-title"><span>{number}</span><h2>{title}</h2><small>{detail}</small></div>
}

function Empty({ text }: { text: string }) {
  return <div className="empty">{text}</div>
}

export default App
