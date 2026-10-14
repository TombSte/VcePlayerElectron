import Store from 'electron-store'
import { app } from 'electron'
import { mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { AppData, AppOptions, DEFAULT_OPTIONS, ExamListEntry, HistoryRecord, SavedSession } from '@shared/types'

/**
 * Persisted application state. Modelled after the original `player.db` tables:
 * exam_list, options, score history and saved sessions.
 */
// Honour an explicit isolated profile before storage and the single-instance lock
// are created. Useful for portable profiles and packaged-app smoke verification.
const profileArg = process.argv.find((arg) => arg.startsWith('--user-data-dir='))
if (profileArg) {
  const profilePath = resolve(profileArg.slice('--user-data-dir='.length))
  mkdirSync(profilePath, { recursive: true })
  app.setPath('userData', profilePath)
}

const store = new Store<AppData>({
  name: 'vce-player',
  defaults: {
    examList: [],
    options: DEFAULT_OPTIONS,
    history: [],
    sessions: []
  }
})

export function getData(): AppData {
  const options = { ...DEFAULT_OPTIONS, ...(store.get('options') ?? {}) }
  return {
    examList: store.get('examList') ?? [],
    options,
    history: store.get('history') ?? [],
    sessions: store.get('sessions') ?? []
  }
}

export function setOptions(options: AppOptions): AppData {
  store.set('options', options)
  return getData()
}

export function addExam(entry: ExamListEntry): AppData {
  const list = store.get('examList') ?? []
  const existing = list.find((e) => e.filePath === entry.filePath)
  if (existing) {
    existing.title = entry.title
    existing.trainingMode = entry.trainingMode
  } else {
    list.push(entry)
  }
  store.set('examList', list)
  return getData()
}

export function updateExam(entry: ExamListEntry): AppData {
  const list = store.get('examList') ?? []
  const index = list.findIndex((e) => e.id === entry.id)
  if (index >= 0) list[index] = entry
  store.set('examList', list)
  return getData()
}

export function removeExam(id: string): AppData {
  store.set(
    'examList',
    (store.get('examList') ?? []).filter((e) => e.id !== id)
  )
  return getData()
}

export function addHistoryRecord(record: HistoryRecord): AppData {
  const history = store.get('history') ?? []
  history.unshift(record)
  store.set('history', history)
  return getData()
}

export function clearHistory(): AppData {
  store.set('history', [])
  return getData()
}

export function saveSession(session: SavedSession): AppData {
  const sessions = store.get('sessions') ?? []
  const index = sessions.findIndex((s) => s.id === session.id)
  if (index >= 0) sessions[index] = session
  else sessions.unshift(session)
  store.set('sessions', sessions)
  return getData()
}

export function deleteSession(id: string): AppData {
  store.set(
    'sessions',
    (store.get('sessions') ?? []).filter((s) => s.id !== id)
  )
  return getData()
}

export function clearSessions(): AppData {
  store.set('sessions', [])
  return getData()
}
