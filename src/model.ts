export type Theme = 'light' | 'dark'
export type MarkStatus = 'Present' | 'Absent' | 'Unknown'

export type Subject = {
  id: string
  name: string
  openingAttended: number
  openingHeld: number
}

export type AttendanceEvent = {
  id: string
  subjectId: string
  subjectName: string
  status: MarkStatus
  date: string
}

export type StoredState = { subjects: Subject[]; events: AttendanceEvent[]; theme: Theme }
export type SubjectTotals = { attended: number; held: number }
export type BackupFile = { format: 'attendtrack-backup'; version: 1; exportedAt: string; settings: { theme: Theme }; subjects: Subject[]; events: AttendanceEvent[] }

export const STORAGE_KEY = 'attendtrack.v1'
export const THEME_KEY = 'attendtrack.theme'
const PREVIOUS_STORAGE_KEY = 'attendtrack:v1'
export const TARGET_PERCENT = 75

export const initialStoredState: StoredState = { subjects: [], events: [], theme: 'light' }

export function createId(): string {
  return globalThis.crypto?.randomUUID?.() ?? `att-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

export function localDateString(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function attendancePercent(attended: number, held: number): number {
  return held <= 0 ? 0 : 100 * attended / held
}

export function formatPercent(value: number): string {
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`
}

export function subjectTotals(subject: Subject, events: AttendanceEvent[]): SubjectTotals {
  const relevant = events.filter((event) => event.subjectId === subject.id)
  return {
    attended: subject.openingAttended + relevant.filter((event) => event.status === 'Present').length,
    held: subject.openingHeld + relevant.filter((event) => event.status === 'Present' || event.status === 'Absent').length,
  }
}

export function calculateOverall(subjects: Subject[], events: AttendanceEvent[] = []): SubjectTotals & { percentage: number } {
  const totals = subjects.reduce((sum, subject) => {
    const current = subjectTotals(subject, events)
    return { attended: sum.attended + current.attended, held: sum.held + current.held }
  }, { attended: 0, held: 0 })
  return { ...totals, percentage: attendancePercent(totals.attended, totals.held) }
}

export function countToTarget(attended: number, held: number): number {
  return Math.max(0, 3 * held - 4 * attended)
}

export function calculateProjection(subject: Subject, events: AttendanceEvent[], futureAttend: number, futureMiss: number) {
  const current = subjectTotals(subject, events)
  const attended = current.attended + Math.max(0, futureAttend)
  const held = current.held + Math.max(0, futureAttend) + Math.max(0, futureMiss)
  return { attended, held, percentage: attendancePercent(attended, held) }
}

export function parseCount(value: string): number {
  if (!/^\d+$/.test(value.trim())) return Number.NaN
  const count = Number(value)
  return Number.isSafeInteger(count) ? count : Number.NaN
}

export function validateSubjectDraft(name: string, heldText: string, attendedText: string): Omit<Subject, 'id'> | { error: string } {
  if (!name.trim()) return { error: 'Enter a subject name.' }
  const held = parseCount(heldText)
  const attended = parseCount(attendedText)
  if (!Number.isSafeInteger(held) || !Number.isSafeInteger(attended) || held < 0 || attended < 0) {
    return { error: 'Counts must be whole, nonnegative numbers.' }
  }
  if (attended > held) return { error: 'Classes attended cannot exceed total classes held.' }
  return { name: name.trim(), openingHeld: held, openingAttended: attended }
}

export function markAttendance(state: StoredState, subjectId: string, status: Exclude<MarkStatus, 'Unknown'>, date: string, eventId: string): StoredState {
  const subject = state.subjects.find((candidate) => candidate.id === subjectId)
  if (!subject) return state
  return { ...state, events: [{ id: eventId, subjectId, subjectName: subject.name, status, date }, ...state.events] }
}

export function correctEvent(state: StoredState, eventId: string, status: Exclude<MarkStatus, 'Unknown'>): StoredState {
  return { ...state, events: state.events.map((event) => event.id === eventId ? { ...event, status } : event) }
}

export function deleteEvent(state: StoredState, eventId: string): StoredState {
  return { ...state, events: state.events.filter((event) => event.id !== eventId) }
}

export function deleteSubject(state: StoredState, subjectId: string): StoredState {
  return {
    ...state,
    subjects: state.subjects.filter((subject) => subject.id !== subjectId),
    events: state.events.filter((event) => event.subjectId !== subjectId),
  }
}

export function eventsForDate(events: AttendanceEvent[], date: string): AttendanceEvent[] {
  return events.filter((event) => event.date === date).slice().sort((a, b) => a.id.localeCompare(b.id))
}

export function toggleTheme(state: StoredState): StoredState {
  return { ...state, theme: state.theme === 'dark' ? 'light' : 'dark' }
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>

function validCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function validDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, month - 1, day)
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
}

function parseStatus(value: unknown): MarkStatus {
  if (value === 'Present' || value === 'present') return 'Present'
  if (value === 'Absent' || value === 'absent') return 'Absent'
  return 'Unknown'
}

function asObject(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function normalizeCurrent(raw: unknown, themeOverride: unknown): StoredState | null {
  const root = asObject(raw)
  if (!root || !Array.isArray(root.subjects) || !Array.isArray(root.events)) return null
  const subjects: Subject[] = []
  for (const item of root.subjects) {
    const value = asObject(item)
    const id = typeof value?.id === 'string' ? value.id : ''
    const name = typeof value?.name === 'string' ? value.name.trim() : ''
    const openingHeld = value?.openingHeld
    const openingAttended = value?.openingAttended
    if (!id || !name || !validCount(openingHeld) || !validCount(openingAttended) || openingAttended > openingHeld || subjects.some((subject) => subject.id === id)) return null
    subjects.push({ id, name, openingHeld, openingAttended })
  }
  const subjectIds = new Set(subjects.map((subject) => subject.id))
  const events: AttendanceEvent[] = []
  for (const item of root.events) {
    const value = asObject(item)
    const id = typeof value?.id === 'string' ? value.id : ''
    const subjectId = typeof value?.subjectId === 'string' ? value.subjectId : ''
    const subjectName = typeof value?.subjectName === 'string' ? value.subjectName : ''
    if (!id || events.some((event) => event.id === id) || (subjectId && !subjectIds.has(subjectId)) || !validDate(value?.date)) return null
    events.push({ id, subjectId, subjectName, status: parseStatus(value?.status), date: value.date })
  }
  const theme = themeOverride === 'dark' || root.theme === 'dark' ? 'dark' : 'light'
  return { subjects, events, theme }
}

function migrateLegacy(raw: unknown, themeOverride: unknown): StoredState | null {
  const root = asObject(raw)
  if (!root || !Array.isArray(root.subjects)) return null
  const rawSubjects = root.subjects.map(asObject)
  if (rawSubjects.some((subject) => !subject)) return null
  const subjects: Subject[] = []
  const subjectIds = new Set<string>()
  rawSubjects.forEach((value, index) => {
    const requestedId = typeof value?.id === 'string' && value.id ? value.id : `legacy-subject-${index + 1}`
    let id = requestedId
    let duplicateSuffix = 1
    while (subjectIds.has(id)) id = `${requestedId}-${++duplicateSuffix}`
    subjectIds.add(id)
    subjects.push({
      id,
      name: typeof value?.name === 'string' && value.name.trim() ? value.name.trim() : `Untitled subject ${index + 1}`,
      openingAttended: validCount(value?.a) ? value.a : validCount(value?.attended) ? value.attended : 0,
      openingHeld: validCount(value?.h) ? value.h : validCount(value?.held) ? value.held : 0,
    })
  })
  const names = new Map<string, Subject[]>()
  for (const subject of subjects) names.set(subject.name, [...(names.get(subject.name) ?? []), subject])
  const rawIdCounts = new Map<string, number>()
  rawSubjects.forEach((subject) => {
    if (typeof subject?.id === 'string' && subject.id) rawIdCounts.set(subject.id, (rawIdCounts.get(subject.id) ?? 0) + 1)
  })
  const eventValues = Array.isArray(root.events) ? root.events.map(asObject) : []
  const eventIds = new Set<string>()
  const events: AttendanceEvent[] = eventValues.map((value, index) => {
    const name = typeof value?.subjectName === 'string' ? value.subjectName : typeof value?.name === 'string' ? value.name : ''
    const idRef = typeof value?.subjectId === 'string' ? value.subjectId : ''
    const resolvedById = rawIdCounts.get(idRef) === 1 ? subjects.find((_subject, subjectIndex) => rawSubjects[subjectIndex]?.id === idRef)?.id : undefined
    const resolvedId = resolvedById ?? (names.get(name)?.length === 1 ? names.get(name)![0].id : '')
    const date = validDate(value?.date) ? value.date : '1970-01-01'
    const requestedEventId = typeof value?.id === 'string' && value.id ? value.id : `legacy-event-${index + 1}`
    let eventId = requestedEventId
    let duplicateSuffix = 1
    while (eventIds.has(eventId)) eventId = `${requestedEventId}-${++duplicateSuffix}`
    eventIds.add(eventId)
    return {
      id: eventId,
      subjectId: resolvedId,
      subjectName: name,
      status: parseStatus(value?.status ?? value?.mark),
      date,
    }
  })

  // Recover opening counts only if the old saved totals are consistent with every
  // dated event. Duplicate names and inconsistent legacy records stay unlinked.
  for (const subject of subjects) {
    const related = events.filter((event) => event.subjectId === subject.id)
    const rawSubject = rawSubjects[subjects.indexOf(subject)]!
    const totalAttended = validCount(rawSubject.a) ? rawSubject.a : validCount(rawSubject.attended) ? rawSubject.attended : subject.openingAttended
    const totalHeld = validCount(rawSubject.h) ? rawSubject.h : validCount(rawSubject.held) ? rawSubject.held : subject.openingHeld
    const eventHeld = related.filter((event) => event.status === 'Present' || event.status === 'Absent').length
    const eventAttended = related.filter((event) => event.status === 'Present').length
    if (related.length && related.every((event) => event.status !== 'Unknown') && totalAttended >= eventAttended && totalHeld >= eventHeld && totalAttended - eventAttended <= totalHeld - eventHeld) {
      subject.openingAttended = totalAttended - eventAttended
      subject.openingHeld = totalHeld - eventHeld
    } else if (related.length) {
      for (const event of related) event.subjectId = ''
    }
  }
  return { subjects, events, theme: themeOverride === 'dark' || root.theme === 'dark' ? 'dark' : 'light' }
}

export function loadState(storage: StorageLike | null = typeof localStorage === 'undefined' ? null : localStorage): StoredState {
  if (!storage) return initialStoredState
  try {
    const theme = storage.getItem(THEME_KEY)
    const current = storage.getItem(STORAGE_KEY)
    if (current) {
      const parsed: unknown = JSON.parse(current)
      const normalized = normalizeCurrent(parsed, theme)
      if (normalized) return normalized
      const migrated = migrateLegacy(parsed, theme)
      if (migrated) return migrated
    }
    const previous = storage.getItem(PREVIOUS_STORAGE_KEY)
    if (previous) return migrateLegacy(JSON.parse(previous), theme) ?? initialStoredState
    return { ...initialStoredState, theme: theme === 'dark' ? 'dark' : 'light' }
  } catch {
    return initialStoredState
  }
}

export function saveState(state: StoredState, storage: StorageLike | null = typeof localStorage === 'undefined' ? null : localStorage): boolean {
  if (!storage) return false
  try {
    const subjects = state.subjects.map((subject) => {
      const total = subjectTotals(subject, state.events)
      return { ...subject, attended: total.attended, held: total.held, a: total.attended, h: total.held }
    })
    storage.setItem(STORAGE_KEY, JSON.stringify({ subjects, events: state.events, theme: state.theme }))
    storage.setItem(THEME_KEY, state.theme)
    return true
  } catch {
    return false
  }
}

export function createBackup(state: StoredState, exportedAt = new Date().toISOString()): BackupFile {
  return { format: 'attendtrack-backup', version: 1, exportedAt, settings: { theme: state.theme }, subjects: state.subjects, events: state.events }
}

export function validateBackup(raw: unknown): { state: StoredState; subjectCount: number; eventCount: number } | { error: string } {
  const root = asObject(raw)
  if (!root || root.format !== 'attendtrack-backup' || root.version !== 1 || !Array.isArray(root.subjects) || !Array.isArray(root.events)) {
    return { error: 'This file is not a supported AttendTrack backup.' }
  }
  const settings = asObject(root.settings)
  if (!settings || (settings.theme !== 'light' && settings.theme !== 'dark')) return { error: 'Backup settings are invalid.' }
  const normalized = normalizeCurrent({ subjects: root.subjects, events: root.events, theme: settings.theme }, settings.theme)
  if (!normalized) return { error: 'Backup data is invalid. Check subject counts, IDs, dates, and event references.' }
  return { state: normalized, subjectCount: normalized.subjects.length, eventCount: normalized.events.length }
}
