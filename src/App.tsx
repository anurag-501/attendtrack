import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import {
  attendancePercent, calculateOverall, calculateProjection, countToTarget, correctEvent,
  createBackup, createId, deleteEvent, deleteSubject as removeSubjectData, eventsForDate, formatPercent,
  loadState, localDateString, markAttendance as recordAttendance, parseCount, saveState,
  subjectTotals, TARGET_PERCENT, toggleTheme as switchTheme, validateBackup,
  validateSubjectDraft, type AttendanceEvent, type StoredState, type Subject,
} from './model'

type Screen = 'dashboard' | 'whatif' | 'history'
type StagedBackup = { state: StoredState; subjectCount: number; eventCount: number }

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true as const }
  const paths: Record<string, ReactNode> = {
    plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
    moon: <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.6a8.6 8.6 0 1 0 11 10.9Z" />,
    sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42" /></>,
    check: <path d="m5 12 4 4L19 6" />,
    close: <><path d="m18 6-12 12" /><path d="m6 6 12 12" /></>,
    back: <><path d="m15 18-6-6 6-6" /><path d="M9 12h12" /></>,
    book: <><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5Z" /><path d="M4 5.5v16" /><path d="M8 7h8m-8 4h8" /></>,
    chart: <><path d="M4 19V5" /><path d="M4 19h17" /><path d="M8 15v-4m4 4V7m4 8v-6m4 6V4" /></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
    spark: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15Z" /></>,
    edit: <><path d="m12 20 8-8" /><path d="M16 4a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18" /><path d="M8 6V4h8v2m3 0-1 14H6L5 6" /><path d="M10 11v5m4-5v5" /></>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5" /><path d="M5 17v4h14v-4" /></>,
    upload: <><path d="M12 15V3m-5 5 5-5 5 5" /><path d="M5 17v4h14v-4" /></>,
    instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><path d="M17.5 6.5h.01" /></>,
    more: <><circle cx="5" cy="12" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /></>,
  }
  return <svg {...common}>{paths[name] ?? paths.chart}</svg>
}

function App() {
  const [saved, setSaved] = useState<StoredState>(loadState)
  const [storageAvailable, setStorageAvailable] = useState(true)
  const [screen, setScreen] = useState<Screen>('dashboard')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingSubjectId, setEditingSubjectId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [heldInput, setHeldInput] = useState('0')
  const [attendedInput, setAttendedInput] = useState('0')
  const [formError, setFormError] = useState('')
  const [historyDate, setHistoryDate] = useState(localDateString)
  const [selectedSubject, setSelectedSubject] = useState('')
  const [futureAttend, setFutureAttend] = useState('0')
  const [futureMiss, setFutureMiss] = useState('0')
  const [stagedBackup, setStagedBackup] = useState<StagedBackup | null>(null)
  const [backupError, setBackupError] = useState('')
  const [backupNotice, setBackupNotice] = useState('')
  const addButtonRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)
  const backupInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setStorageAvailable(saveState(saved))
  }, [saved])

  useEffect(() => {
    const dialog = dialogRef.current
    if (dialogOpen && dialog && !dialog.open) {
      dialog.showModal()
      requestAnimationFrame(() => nameInputRef.current?.focus())
    }
  }, [dialogOpen])

  useEffect(() => {
    if (!saved.subjects.some((subject) => subject.id === selectedSubject)) setSelectedSubject(saved.subjects[0]?.id ?? '')
  }, [saved.subjects, selectedSubject])

  const overall = calculateOverall(saved.subjects, saved.events)
  const selectedForWhatIf = saved.subjects.find((subject) => subject.id === selectedSubject) ?? saved.subjects[0]
  const futureAttendCount = parseCount(futureAttend)
  const futureMissCount = parseCount(futureMiss)
  const projection = selectedForWhatIf && Number.isSafeInteger(futureAttendCount) && Number.isSafeInteger(futureMissCount)
    ? calculateProjection(selectedForWhatIf, saved.events, futureAttendCount, futureMissCount) : null
  const historyEvents = eventsForDate(saved.events, historyDate)

  function updateSaved(updater: (current: StoredState) => StoredState) {
    setSaved((current) => updater(current))
  }

  function openSubjectDialog(subject?: Subject) {
    setEditingSubjectId(subject?.id ?? null)
    setName(subject?.name ?? '')
    setHeldInput(String(subject?.openingHeld ?? 0))
    setAttendedInput(String(subject?.openingAttended ?? 0))
    setFormError('')
    setDialogOpen(true)
  }

  function returnFocus() {
    requestAnimationFrame(() => addButtonRef.current?.focus())
  }

  function closeSubjectDialog() {
    if (dialogRef.current?.open) dialogRef.current.close()
    setDialogOpen(false)
    setEditingSubjectId(null)
    setFormError('')
    returnFocus()
  }

  function handleDialogClose() {
    setDialogOpen(false)
    setEditingSubjectId(null)
    returnFocus()
  }

  function submitSubject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const draft = validateSubjectDraft(name, heldInput, attendedInput)
    if ('error' in draft) {
      setFormError(draft.error)
      if (!name.trim()) nameInputRef.current?.focus()
      else if (!Number.isSafeInteger(parseCount(heldInput))) document.getElementById('total-held')?.focus()
      else document.getElementById('total-attended')?.focus()
      return
    }
    if (editingSubjectId) {
      updateSaved((current) => ({
        ...current,
        subjects: current.subjects.map((subject) => subject.id === editingSubjectId ? { ...subject, ...draft } : subject),
        events: current.events.map((record) => record.subjectId === editingSubjectId ? { ...record, subjectName: draft.name } : record),
      }))
    } else {
      const subject: Subject = { id: createId(), ...draft }
      updateSaved((current) => ({ ...current, subjects: [...current.subjects, subject] }))
      setSelectedSubject((current) => current || subject.id)
    }
    closeSubjectDialog()
  }

  function markAttendance(subject: Subject, status: Exclude<AttendanceEvent['status'], 'Unknown'>) {
    updateSaved((current) => recordAttendance(current, subject.id, status, localDateString(), createId()))
  }

  function removeSubject(subject: Subject) {
    const subjectEvents = saved.events.filter((event) => event.subjectId === subject.id).length
    const detail = subjectEvents ? ` Its ${subjectEvents} history ${subjectEvents === 1 ? 'entry will' : 'entries will'} also be removed.` : ''
    if (!window.confirm(`Delete “${subject.name}”?${detail}`)) return
    updateSaved((current) => removeSubjectData(current, subject.id))
  }

  function toggleTheme() { updateSaved(switchTheme) }

  function exportBackup() {
    try {
      const data = new Blob([JSON.stringify(createBackup(saved), null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(data)
      const link = document.createElement('a')
      link.href = url
      link.download = `attendtrack-backup-${localDateString()}.json`
      link.click()
      URL.revokeObjectURL(url)
      setBackupNotice('Backup downloaded.')
      setBackupError('')
    } catch {
      setBackupError('Could not create a backup file.')
    }
  }

  async function selectBackup(file?: File) {
    setStagedBackup(null)
    setBackupNotice('')
    setBackupError('')
    if (!file) return
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const result = validateBackup(parsed)
      if ('error' in result) setBackupError(result.error)
      else setStagedBackup(result)
    } catch {
      setBackupError('Could not read this backup file. Choose a valid AttendTrack JSON backup.')
    }
  }

  function replaceFromBackup() {
    if (!stagedBackup) return
    if (!window.confirm(`Replace all current data with this backup? It contains ${stagedBackup.subjectCount} subjects and ${stagedBackup.eventCount} history entries.`)) return
    setSaved(stagedBackup.state)
    setSelectedSubject(stagedBackup.state.subjects[0]?.id ?? '')
    setStagedBackup(null)
    setBackupNotice('Backup restored.')
    setBackupError('')
  }

  const isDark = saved.theme === 'dark'

  return (
    <div className={`app-shell ${isDark ? 'theme-dark' : 'theme-light'}`}>
      <header className="site-header">
        <div className="header-inner">
          <div className="brand-mark" aria-hidden="true"><Icon name="book" size={21} /></div>
          <div className="brand-copy"><div className="brand-name">AttendTrack</div><div className="brand-subtitle">Professional attendance tracking</div></div>
          <button className="theme-button" type="button" onClick={toggleTheme} aria-label={`Switch to ${isDark ? 'light' : 'dark'} theme`} title={`Switch to ${isDark ? 'light' : 'dark'} theme`}><Icon name={isDark ? 'sun' : 'moon'} size={19} /></button>
        </div>
      </header>

      {!storageAvailable && <aside className="storage-notice" role="status">Could not save to browser storage. Your changes will remain only until this tab closes.</aside>}

      <main className="main-column">
        {screen === 'dashboard' && <>
          {saved.subjects.length === 0 ? <section className="overview-card empty-overview" aria-label="Attendance overview"><div className="empty-chart-icon"><Icon name="chart" size={23} /></div><p>Add subjects to start tracking your attendance</p><div className="empty-chart-lines" aria-hidden="true"><span /><span /><span /><span /><span /></div></section> : <section className="overview-card filled-overview" aria-label="Overall attendance"><div className="overview-topline"><div><p className="eyebrow">OVERALL ATTENDANCE</p><div className="overall-stat">{formatPercent(overall.percentage)}</div></div><div className="overall-icon"><Icon name="chart" size={19} /></div></div><div className="progress-track"><span style={{ width: `${Math.min(overall.percentage, 100)}%` }} /></div><div className="overview-footer"><span>{overall.attended} of {overall.held} classes attended</span><span>Target {TARGET_PERCENT}%</span></div></section>}

          {saved.subjects.length === 0 ? <section className="empty-subject-card"><div className="empty-plus"><Icon name="plus" size={19} /></div><h1>No subjects added yet</h1><p>Add your first subject to start tracking attendance</p></section> : <section className="subject-section" aria-labelledby="subjects-heading"><div className="section-heading-row"><h1 id="subjects-heading">My Subjects</h1><span className="subject-count">{saved.subjects.length} {saved.subjects.length === 1 ? 'subject' : 'subjects'}</span></div><div className="subject-list">{saved.subjects.map((subject) => {
            const totals = subjectTotals(subject, saved.events)
            const percentage = attendancePercent(totals.attended, totals.held)
            const classesToTarget = countToTarget(totals.attended, totals.held)
            return <article className="subject-card" key={subject.id}>
              <div className="subject-card-heading"><div className="subject-symbol"><Icon name="book" size={18} /></div><div className="subject-title-wrap"><h2>{subject.name}</h2><p>{totals.attended} attended <span>·</span> {totals.held} held</p></div><div className={`subject-percent ${percentage >= TARGET_PERCENT && totals.held > 0 ? 'on-target' : ''}`}>{formatPercent(percentage)}</div><details className="subject-action-menu"><summary aria-label={`Actions for ${subject.name}`} title="Subject actions"><Icon name="more" size={19} /></summary><div className="subject-menu-popover"><button type="button" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); openSubjectDialog(subject) }}><Icon name="edit" size={14} /> Edit subject</button><button type="button" className="delete-action" onClick={(event) => { event.currentTarget.closest('details')?.removeAttribute('open'); removeSubject(subject) }}><Icon name="trash" size={14} /> Delete subject</button></div></details></div>
              <div className="progress-track subject-progress"><span style={{ width: `${Math.min(percentage, 100)}%` }} /></div>
              <div className="subject-insight">{totals.held === 0 ? 'No classes recorded yet' : percentage >= TARGET_PERCENT ? 'You are on track' : `Attend ${classesToTarget} ${classesToTarget === 1 ? 'class' : 'classes'} in a row to reach ${TARGET_PERCENT}%`}</div>
              <div className="mark-actions"><button className="mark-button present-button" type="button" onClick={() => markAttendance(subject, 'Present')}><Icon name="check" size={16} /> Present</button><button className="mark-button absent-button" type="button" onClick={() => markAttendance(subject, 'Absent')}><Icon name="close" size={16} /> Absent</button></div>
            </article>
          })}</div></section>}

          <section className="backup-card" aria-labelledby="backup-heading"><div><h2 id="backup-heading">Your data</h2><p>Export a backup or restore saved subjects and history.</p></div><div className="backup-actions"><button type="button" className="outline-action" onClick={exportBackup}><Icon name="download" size={15} /> Back up data</button><button type="button" className="outline-action" onClick={() => backupInputRef.current?.click()}><Icon name="upload" size={15} /> Restore backup</button><input ref={backupInputRef} className="visually-hidden" type="file" accept="application/json,.json" aria-label="Choose AttendTrack backup file" onChange={(event) => { void selectBackup(event.currentTarget.files?.[0]); event.currentTarget.value = '' }} /></div>
            {backupNotice && <p className="backup-success" role="status">{backupNotice}</p>}{backupError && <p className="form-error" role="alert">{backupError}</p>}
            {stagedBackup && <div className="backup-preview"><div><strong>Backup ready to restore</strong><span>{stagedBackup.subjectCount} subjects · {stagedBackup.eventCount} history entries · {stagedBackup.state.theme} theme</span></div><div className="backup-preview-actions"><button className="cancel-button" type="button" onClick={() => setStagedBackup(null)}>Cancel</button><button className="save-button" type="button" onClick={replaceFromBackup}>Replace data</button></div></div>}
          </section>
          <footer className="creator-credit"><a href="https://www.instagram.com/theanurag.saini/" target="_blank" rel="noreferrer" aria-label="Created by @theanurag.saini on Instagram"><Icon name="instagram" size={16} /><span>Created by @theanurag.saini</span></a></footer>
        </>}

        {screen === 'whatif' && <section className="page-section"><button type="button" className="back-button" onClick={() => setScreen('dashboard')}><Icon name="back" size={18} /> Back</button><div className="page-heading"><div className="page-heading-icon"><Icon name="spark" size={19} /></div><div><p className="eyebrow">PLAN AHEAD</p><h1>What If?</h1></div></div>
          {saved.subjects.length === 0 ? <div className="empty-state-card"><div className="empty-plus"><Icon name="book" size={19} /></div><h2>No subjects added yet</h2><p>Add subjects to use the What If calculator</p></div> : <><div className="calculator-card"><label className="field-label" htmlFor="whatif-subject">Choose a subject<select id="whatif-subject" value={selectedForWhatIf?.id ?? ''} onChange={(event) => setSelectedSubject(event.target.value)}>{saved.subjects.map((subject) => <option value={subject.id} key={subject.id}>{subject.name}</option>)}</select></label><p className="field-help">Current attendance: {selectedForWhatIf ? `${subjectTotals(selectedForWhatIf, saved.events).attended}/${subjectTotals(selectedForWhatIf, saved.events).held}` : '0/0'}</p><div className="future-input-grid"><label className="field-label" htmlFor="future-attend">Classes you’ll attend<input id="future-attend" type="number" min="0" step="1" inputMode="numeric" value={futureAttend} onChange={(event) => setFutureAttend(event.target.value)} /></label><label className="field-label" htmlFor="future-miss">Classes you’ll miss<input id="future-miss" type="number" min="0" step="1" inputMode="numeric" value={futureMiss} onChange={(event) => setFutureMiss(event.target.value)} /></label></div></div><div className="projection-card" aria-live="polite"><div className="projection-icon"><Icon name="chart" size={19} /></div><p className="eyebrow">PROJECTED ATTENDANCE</p><div className="projection-percent">{formatPercent(projection?.percentage ?? 0)}</div><p className="projection-fraction">{projection?.attended ?? 0} / {projection?.held ?? 0} classes attended</p><div className="progress-track"><span style={{ width: `${Math.min(projection?.percentage ?? 0, 100)}%` }} /></div><p className="projection-note">This is only a simulation. Your saved attendance stays the same.</p></div></>}
        </section>}

        {screen === 'history' && <section className="page-section"><button type="button" className="back-button" onClick={() => setScreen('dashboard')}><Icon name="back" size={18} /> Back</button><div className="page-heading"><div className="page-heading-icon"><Icon name="clock" size={19} /></div><div><p className="eyebrow">YOUR RECORDS</p><h1>History</h1></div></div><div className="date-picker-card"><label htmlFor="history-date"><Icon name="calendar" size={18} /> Select date</label><input id="history-date" type="date" value={historyDate} onChange={(event) => setHistoryDate(event.target.value)} /></div>
          {historyEvents.length === 0 ? <div className="empty-state-card history-empty"><div className="empty-plus"><Icon name="calendar" size={19} /></div><h2>No attendance records yet</h2><p>Start marking attendance to see your history</p></div> : <section className="history-list" aria-label="Attendance records">{historyEvents.map((event) => <article className="history-event" key={event.id}><div className={`event-mark ${event.status === 'Present' ? 'event-present' : event.status === 'Absent' ? 'event-absent' : ''}`}><Icon name={event.status === 'Present' ? 'check' : 'close'} size={17} /></div><div className="event-copy"><h2>{event.subjectName || 'Unknown subject'}</h2><p>Class marked {event.status === 'Unknown' ? 'Unverified' : event.status}</p></div><span className={`event-badge ${event.status === 'Present' ? 'badge-present' : event.status === 'Absent' ? 'badge-absent' : ''}`}>{event.status === 'Unknown' ? 'Unverified' : event.status}</span><div className="event-actions">{event.status !== 'Present' && <button type="button" className="text-action" onClick={() => updateSaved((current) => correctEvent(current, event.id, 'Present'))} aria-label={`Correct ${event.subjectName} to Present`}>Present</button>}{event.status !== 'Absent' && <button type="button" className="text-action" onClick={() => updateSaved((current) => correctEvent(current, event.id, 'Absent'))} aria-label={`Correct ${event.subjectName} to Absent`}>Absent</button>}<button type="button" className="text-action delete-action" onClick={() => updateSaved((current) => deleteEvent(current, event.id))} aria-label={`Delete ${event.subjectName} history entry`}><Icon name="trash" size={14} /> Delete</button></div></article>)}</section>}
        </section>}
      </main>

      {screen === 'dashboard' && <nav className="bottom-bar" aria-label="Main actions"><div className="bottom-bar-inner"><button ref={addButtonRef} className="add-subject-button" type="button" onClick={() => openSubjectDialog()}><Icon name="plus" size={18} /> Add Subject</button><button className="secondary-nav-button" type="button" onClick={() => setScreen('whatif')}><Icon name="spark" size={17} /><span>What If?</span></button><button className="secondary-nav-button" type="button" onClick={() => { setHistoryDate(localDateString()); setScreen('history') }}><Icon name="clock" size={17} /><span>History</span></button></div></nav>}

      <dialog ref={dialogRef} className="subject-dialog" aria-labelledby="dialog-title" onClose={handleDialogClose} onClick={(event) => { if (event.target === event.currentTarget) closeSubjectDialog() }}><div className="dialog-heading"><div className="dialog-icon"><Icon name={editingSubjectId ? 'edit' : 'plus'} size={20} /></div><div><p className="eyebrow">{editingSubjectId ? 'EDIT COURSE' : 'NEW COURSE'}</p><h2 id="dialog-title">{editingSubjectId ? 'Edit Subject' : 'Add New Subject'}</h2></div><button type="button" className="close-dialog-button" onClick={closeSubjectDialog} aria-label="Close dialog"><Icon name="close" size={19} /></button></div><form onSubmit={submitSubject} noValidate><label className="field-label" htmlFor="subject-name">Subject Name<input ref={nameInputRef} id="subject-name" type="text" placeholder="e.g. Mathematics" autoComplete="off" value={name} onChange={(event) => { setName(event.target.value); setFormError('') }} /></label>{editingSubjectId && <p className="field-help opening-count-help">Opening counts are your starting totals. New attendance marks add to them.</p>}<div className="dialog-count-grid"><label className="field-label" htmlFor="total-held">{editingSubjectId ? 'Opening classes held' : 'Total Classes Held'}<input id="total-held" type="number" min="0" step="1" inputMode="numeric" value={heldInput} onChange={(event) => { setHeldInput(event.target.value); setFormError('') }} /></label><label className="field-label" htmlFor="total-attended">{editingSubjectId ? 'Opening classes attended' : 'Classes Attended'}<input id="total-attended" type="number" min="0" step="1" inputMode="numeric" value={attendedInput} onChange={(event) => { setAttendedInput(event.target.value); setFormError('') }} /></label></div>{formError && <p className="form-error" role="alert">{formError}</p>}<div className="dialog-actions"><button className="cancel-button" type="button" onClick={closeSubjectDialog}>Cancel</button><button className="save-button" type="submit"><Icon name={editingSubjectId ? 'check' : 'plus'} size={17} /> {editingSubjectId ? 'Save Changes' : 'Add Subject'}</button></div></form></dialog>
    </div>
  )
}

export default App
