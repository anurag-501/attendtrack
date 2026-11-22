import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  attendancePercent, calculateOverall, calculateProjection, correctEvent, countToTarget,
  createBackup, deleteEvent, deleteSubject, eventsForDate, formatPercent, initialStoredState, loadState,
  markAttendance, saveState, STORAGE_KEY, subjectTotals, THEME_KEY, toggleTheme,
  validateBackup, validateSubjectDraft,
} from '../src/model.ts'

test('attendance marks, corrections, removal, edits, simulation and exact overall totals', () => {
  const draft = validateSubjectDraft(' Mathematics ', '10', '7')
  assert.equal('error' in draft, false)
  if ('error' in draft) return
  const math = { id: 'math', ...draft }
  let state = { ...initialStoredState, subjects: [math] }
  state = markAttendance(state, 'math', 'Present', '2026-11-22', 'present-1')
  assert.deepEqual(subjectTotals(math, state.events), { attended: 8, held: 11 })
  state = markAttendance(state, 'math', 'Absent', '2026-11-22', 'absent-1')
  assert.deepEqual(subjectTotals(math, state.events), { attended: 8, held: 12 })
  assert.equal(eventsForDate(state.events, '2026-11-22').length, 2)
  const physics = { id: 'physics', name: 'Physics', openingAttended: 1, openingHeld: 1 }
  const beforeCorrectionOverall = calculateOverall([math, physics], state.events)
  assert.deepEqual([beforeCorrectionOverall.attended, beforeCorrectionOverall.held], [9, 13])
  assert.equal(formatPercent(beforeCorrectionOverall.percentage), '69.2%')
  state = correctEvent(state, 'absent-1', 'Present')
  assert.deepEqual(subjectTotals(math, state.events), { attended: 9, held: 12 })
  assert.equal(state.events.length, 2)
  state = deleteEvent(state, 'absent-1')
  assert.deepEqual(subjectTotals(math, state.events), { attended: 8, held: 11 })
  state = { ...state, subjects: [{ ...state.subjects[0], name: 'Applied Mathematics', openingAttended: 6, openingHeld: 10 }], events: state.events.map((event) => ({ ...event, subjectName: 'Applied Mathematics' })) }
  assert.equal(state.events.length, 1)
  assert.deepEqual(subjectTotals(state.subjects[0], state.events), { attended: 7, held: 11 })
  const beforeSimulation = JSON.stringify(state)
  const projected = calculateProjection(state.subjects[0], state.events, 5, 0)
  assert.deepEqual(projected, { attended: 12, held: 16, percentage: 75 })
  assert.equal(formatPercent(projected.percentage), '75%')
  assert.equal(JSON.stringify(state), beforeSimulation)
  const other = { id: 'other', name: 'Physics', openingAttended: 1, openingHeld: 1 }
  const overall = calculateOverall([...state.subjects, other], state.events)
  assert.deepEqual([overall.attended, overall.held], [8, 12])
  assert.equal(formatPercent(overall.percentage), '66.7%')
})

test('deleting one subject removes its history without touching duplicate names', () => {
  const first = { id: 'subject-1', name: 'Physics', openingAttended: 0, openingHeld: 0 }
  const second = { id: 'subject-2', name: 'Physics', openingAttended: 1, openingHeld: 2 }
  const state = markAttendance({ ...initialStoredState, subjects: [first, second] }, first.id, 'Present', '2026-11-22', 'first-event')
  const remaining = deleteSubject(state, first.id)
  assert.deepEqual(remaining.subjects, [second])
  assert.deepEqual(remaining.events, [])
  assert.deepEqual(state.subjects, [first, second])
})

test('opening counts have no event; zero held is 0%; target uses exact counts', () => {
  const draft = validateSubjectDraft('Lab', '0', '0')
  assert.equal('error' in draft, false)
  assert.equal(initialStoredState.events.length, 0)
  assert.equal(attendancePercent(0, 0), 0)
  assert.equal(countToTarget(0, 0), 0)
  assert.equal(countToTarget(7, 10), 2)
  assert.equal(countToTarget(8, 12), 4)
})

test('subject draft validation rejects blank names and invalid counts', () => {
  assert.deepEqual(validateSubjectDraft('  ', '1', '0'), { error: 'Enter a subject name.' })
  assert.match(validateSubjectDraft('Math', '-1', '0').error, /whole, nonnegative/)
  assert.match(validateSubjectDraft('Math', '1.5', '1').error, /whole, nonnegative/)
  assert.match(validateSubjectDraft('Math', '', '0').error, /whole, nonnegative/)
  assert.match(validateSubjectDraft('Math', '1', '2').error, /cannot exceed/)
})

test('legacy migration preserves data and avoids ambiguous name guesses', () => {
  const values = new Map([[STORAGE_KEY, JSON.stringify({
    subjects: [{ name: 'Math', a: 8, h: 12 }, { name: 'Math', a: 1, h: 1 }],
    events: [{ date: '2026-11-22', name: 'Math', mark: 'Present' }],
  })], [THEME_KEY, 'dark']])
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  const migrated = loadState(storage)
  assert.equal(new Set(migrated.subjects.map((subject) => subject.id)).size, 2)
  assert.equal(migrated.events[0].subjectId, '')
  assert.deepEqual(migrated.subjects.map((subject) => subject.openingHeld), [12, 1])
  assert.equal(migrated.theme, 'dark')
  saveState(migrated, storage)
  assert.equal(JSON.parse(values.get(STORAGE_KEY)).events.length, 1)
  assert.equal(values.get(THEME_KEY), 'dark')
})

test('new-format state reloads with opening counts, history, and theme', () => {
  const math = { id: 'math', name: 'Mathematics', openingAttended: 7, openingHeld: 10 }
  const state = markAttendance({ ...initialStoredState, subjects: [math], theme: 'dark' }, 'math', 'Present', '2026-11-22', 'event-1')
  const values = new Map()
  const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) }
  assert.equal(saveState(state, storage), true)
  const restored = loadState(storage)
  assert.deepEqual(restored.subjects, state.subjects)
  assert.deepEqual(restored.events, state.events)
  assert.equal(restored.theme, 'dark')
  assert.equal(subjectTotals(restored.subjects[0], restored.events).attended, 8)
})

test('backup validation accepts a clean backup and rejects invalid data without mutation', () => {
  const state = { ...initialStoredState, subjects: [{ id: 'math', name: 'Mathematics', openingAttended: 7, openingHeld: 10 }] }
  const backup = createBackup(state, '2026-11-22T00:00:00.000Z')
  const valid = validateBackup(backup)
  assert.equal('error' in valid, false)
  assert.equal(valid.subjectCount, 1)
  const invalid = validateBackup({ ...backup, subjects: [{ ...backup.subjects[0], openingAttended: 11 }] })
  assert.equal('error' in invalid, true)
  assert.deepEqual(state.subjects[0], { id: 'math', name: 'Mathematics', openingAttended: 7, openingHeld: 10 })
})

test('theme toggles and storage failures are reported', () => {
  assert.equal(toggleTheme(initialStoredState).theme, 'dark')
  assert.equal(toggleTheme(toggleTheme(initialStoredState)).theme, 'light')
  const blockedStorage = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.deepEqual(loadState(blockedStorage), initialStoredState)
  assert.equal(saveState({ ...initialStoredState, theme: 'dark' }, blockedStorage), false)
})

test('layout keeps the action bar fixed and adapts to a 360px phone', () => {
  const css = readFileSync(new URL('../src/style.css', import.meta.url), 'utf8')
  assert.match(css, /@media\s*\(max-width:\s*380px\)/)
  assert.match(css, /\.bottom-bar\s*\{[^}]*position:\s*fixed/s)
  assert.match(css, /width:\s*min\(100%,\s*448px\)/)
  assert.match(css, /\.creator-credit\s*\{[^}]*justify-content:\s*center/s)
})
