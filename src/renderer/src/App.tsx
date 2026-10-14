import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  AppData,
  AppOptions,
  DEFAULT_OPTIONS,
  ExamLaunchOptions,
  ExamListEntry,
  HistoryRecord,
  SavedSession,
  VceFile
} from '@shared/types'
import { buildExam, BuiltExam } from './state/exam-utils'
import ExamRunner from './components/ExamRunner'
import HistoryView from './views/HistoryView'
import { ChangeExamDialog, DecryptKeyDialog, OptionsDialog, PropertiesDialog } from './components/dialogs'
import { ExamModeDialog } from './components/ExamModeDialog'

type View = 'main' | 'history'

interface ActiveExam {
  file: VceFile
  examIndex: number
  options: ExamLaunchOptions
  built: BuiltExam
  resume?: SavedSession
}

const TEXT_SIZES: Record<AppOptions['textSize'], string> = {
  small: '12px',
  medium: '14px',
  large: '16px',
  xlarge: '18px'
}

function MenuBar({
  onAction,
  disabled
}: {
  onAction: (action: string) => void
  disabled: Record<string, boolean>
}): JSX.Element {
  const [open, setOpen] = useState<string | null>(null)
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  const menus: { name: string; items: { label: string; action: string; shortcut?: string; sep?: boolean }[] }[] = [
    {
      name: 'File',
      items: [
        { label: 'Add…', action: 'add', shortcut: 'Ins' },
        { label: 'Open with Decrypt Key…', action: 'openWithKey' },
        { label: 'Change…', action: 'change', shortcut: 'F2' },
        { label: 'Remove', action: 'remove', shortcut: 'Del' },
        { label: 'Properties', action: 'properties' },
        { label: '', action: 'sep1', sep: true },
        { label: 'Exit', action: 'exit', shortcut: 'Alt+F4' }
      ]
    },
    {
      name: 'Exam',
      items: [
        { label: 'Start…', action: 'start', shortcut: 'F5' },
        { label: 'Select All', action: 'selectAll', shortcut: 'Ctrl+A' },
        { label: '', action: 'sep2', sep: true },
        { label: 'History', action: 'history' },
        { label: 'Options…', action: 'options' }
      ]
    },
    {
      name: 'Help',
      items: [
        { label: 'Quick Start', action: 'helpQuickStart' },
        { label: 'VCE Player on the Web', action: 'helpWeb' },
        { label: '', action: 'sep3', sep: true },
        { label: 'About VCE Player', action: 'about' }
      ]
    }
  ]

  const menuNames = menus.map((m) => m.name)

  return (
    <div
      className="menubar"
      ref={ref}
      onKeyDown={(event) => {
        if (open === null) return
        const index = menuNames.indexOf(open)
        if (event.key === 'Escape') {
          setOpen(null)
          ;(event.target as HTMLElement).blur()
        } else if (event.key === 'ArrowRight') {
          event.preventDefault()
          setOpen(menuNames[(index + 1) % menuNames.length])
        } else if (event.key === 'ArrowLeft') {
          event.preventDefault()
          setOpen(menuNames[(index - 1 + menuNames.length) % menuNames.length])
        }
      }}
    >
      <div className="brand">
        <span className="logo">VCE</span>
        <span>VCE Player</span>
      </div>
      {menus.map((menu) => (
        <div
          className={`menu${open === menu.name ? ' open' : ''}`}
          key={menu.name}
          onMouseEnter={() => {
            if (open) setOpen(menu.name)
          }}
        >
          <button onClick={() => setOpen(open === menu.name ? null : menu.name)}>{menu.name}</button>
          {open === menu.name && (
            <div className="menu-popup">
              {menu.items.map((item) =>
                item.sep ? (
                  <div className="sep" key={item.action} />
                ) : (
                  <button
                    key={item.action}
                    disabled={disabled[item.action]}
                    onClick={() => {
                      setOpen(null)
                      onAction(item.action)
                    }}
                  >
                    <span>{item.label}</span>
                    <span className="hint">{item.shortcut}</span>
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  )
}

export default function App(): JSX.Element {
  const [data, setData] = useState<AppData | null>(null)
  const [view, setView] = useState<View>('main')
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  const setSelectedId = useCallback((id: string | null) => setSelectedIds(id ? [id] : []), [])
  const [dialog, setDialog] = useState<
    | null
    | { kind: 'options' }
    | { kind: 'properties'; file: VceFile }
    | { kind: 'change'; entry: ExamListEntry }
    | { kind: 'decryptKey'; filePath: string }
    | { kind: 'examMode'; entry: ExamListEntry }
    | { kind: 'message'; title: string; message: string }
    | { kind: 'password'; purpose: string; expected: string; onOk: () => void }
  >(null)
  const [active, setActive] = useState<ActiveExam | null>(null)
  const [busy, setBusy] = useState('')
  const parsedCache = useRef(new Map<string, VceFile>())

  const options = data?.options ?? DEFAULT_OPTIONS

  useEffect(() => {
    void window.api.getData().then((d) => {
      setData(d)
      if (d.examList.length) setSelectedId(d.examList[0].id)
    })
  }, [])

  // Apply theme + text size.
  useEffect(() => {
    const root = document.documentElement
    root.dataset.theme = options.colorScheme === 'default' ? '' : options.colorScheme
    root.style.setProperty('--font-size', TEXT_SIZES[options.textSize])
  }, [options.colorScheme, options.textSize])

  const selectedEntry = useMemo(
    () => data?.examList.find((e) => selectedIds.includes(e.id)) ?? null,
    [data, selectedIds]
  )
  const isSelected = (id: string): boolean => selectedIds.includes(id)

  const loadFile = useCallback(
    async (filePath: string, force = false): Promise<VceFile> => {
      const cached = parsedCache.current.get(filePath)
      if (cached && !force) return cached
      setBusy('Loading exam file…')
      const result = await window.api.parseExam(filePath)
      setBusy('')
      if (!result.file) throw new Error(result.error?.message ?? 'Unable to parse exam file')
      parsedCache.current.set(filePath, result.file)
      return result.file
    },
    []
  )

  const showMessage = (title: string, message: string): void => setDialog({ kind: 'message', title, message })

  // A .vce opened through the OS file association / command line.
  useEffect(() => {
    return window.api.onFileOpened((result) => {
      if (!result.file) {
        showMessage('Cannot open exam', result.error?.message ?? 'Unable to parse exam file')
        return
      }
      const file = result.file
      parsedCache.current.set(file.path, file)
      void window.api.addToList({ filePath: file.path, title: file.title || file.number || file.path }).then((d) => {
        setData(d)
        const entry = d.examList.find((e) => e.filePath === file.path)
        if (entry) setSelectedId(entry.id)
        if (file.hasDecryptionWarnings) {
          showMessage(
            'Decrypt key required',
            `${file.path}\n\nPart of this exam is protected with a key derived by the original player. Use File → “Open with Decrypt Key…” to read it fully.`
          )
        }
      })
    })
  }, [])

  const requirePassword = (purpose: string, onOk: () => void): void => {
    if (!options.adminPasswordEnabled) {
      onOk()
      return
    }
    const needs =
      (purpose === 'start' && options.requestPasswordToStartExam) ||
      (purpose === 'history' && options.requestPasswordToViewHistory)
    if (!needs) {
      onOk()
      return
    }
    setDialog({ kind: 'password', purpose, expected: options.adminPassword, onOk })
  }

  const addExams = async (): Promise<void> => {
    const { files, errors } = await window.api.openExamDialog()
    let next = data
    const needsKey: string[] = []
    for (const file of files) {
      parsedCache.current.set(file.path, file)
      if (file.hasDecryptionWarnings) needsKey.push(file.path)
      next = await window.api.addToList({
        filePath: file.path,
        title: file.title || file.number || file.path
      })
    }
    if (next) setData(next)
    if (files.length) {
      const first = files[0]
      const entry = next?.examList.find((e) => e.filePath === first.path)
      if (entry) setSelectedId(entry.id)
    }
    if (errors.length) {
      showMessage('Some files could not be opened', errors.map((e) => `${e.path}: ${e.message}`).join('\n\n'))
    } else if (needsKey.length) {
      showMessage(
        'Decrypt key required',
        'These exam files protect part of their content with a key derived by the original player:\n\n' +
          needsKey.join('\n') +
          '\n\nUse File → “Open with Decrypt Key…” and paste the base64 decrypt key to read them fully.'
      )
    }
  }

  const doStart = async (entry: ExamListEntry, retakeOptions?: ExamLaunchOptions): Promise<void> => {
    try {
      const file = await loadFile(entry.filePath, true)
      if (retakeOptions) {
        const exam = file.exams[0]
        const built = buildExam({ file, exam, options: retakeOptions, history: data?.history ?? [] })
        setActive({ file, examIndex: 0, options: retakeOptions, built })
        setView('main')
        return
      }
      setDialog({ kind: 'examMode', entry })
    } catch (error) {
      showMessage('Cannot open exam', (error as Error).message)
    }
  }

  const startWithOptions = async (entry: ExamListEntry, examIndex: number, opts: ExamLaunchOptions): Promise<void> => {
    try {
      const file = await loadFile(entry.filePath)
      const exam = file.exams[examIndex] ?? file.exams[0]
      const built = buildExam({ file, exam, options: opts, history: data?.history ?? [] })
      setDialog(null)
      setActive({ file, examIndex, options: opts, built })
      setView('main')
    } catch (error) {
      showMessage('Cannot start exam', (error as Error).message)
    }
  }

  const resumeSession = async (session: SavedSession): Promise<void> => {
    try {
      const file = await loadFile(session.examPath, true)
      const examIndex = Math.max(0, file.exams.findIndex((e) => e.name === session.examName))
      const exam = file.exams[examIndex] ?? file.exams[0]
      const built = buildExam({ file, exam, options: session.options, history: data?.history ?? [] })
      setDialog(null)
      setView('main')
      setActive({ file, examIndex, options: session.options, built, resume: session })
    } catch (error) {
      showMessage('Cannot resume session', (error as Error).message)
    }
  }

  const retakeRecord = async (record: HistoryRecord): Promise<void> => {
    const entry = data?.examList.find((e) => e.filePath === record.examPath)
    if (!entry) {
      showMessage('Exam file not found', `The exam file for this record is no longer in the list:\n${record.examPath}`)
      return
    }
    const retakeOptions: ExamLaunchOptions = {
      ...DEFAULT_OPTIONS_TO_LAUNCH(options),
      candidateName: record.candidateName,
      mode: 'all',
      trainingMode: record.trainingMode
    }
    await doStart(entry, retakeOptions)
  }

  const onMenuAction = (action: string): void => {
    const entry = selectedEntry
    switch (action) {
      case 'add':
        void addExams()
        break
      case 'openWithKey':
        void window.api.chooseFile().then((filePath) => {
          if (filePath) setDialog({ kind: 'decryptKey', filePath })
        })
        break
      case 'change':
        if (entry) setDialog({ kind: 'change', entry })
        break
      case 'remove':
        if (entry) {
          void window.api.removeFromList(entry.id).then((d) => {
            setData(d)
            setSelectedId(d.examList[0]?.id ?? null)
          })
        }
        break
      case 'properties':
        if (entry) {
          void loadFile(entry.filePath)
            .then((file) => setDialog({ kind: 'properties', file }))
            .catch((error) => showMessage('Properties', (error as Error).message))
        }
        break
      case 'start':
        if (entry) requirePassword('start', () => void doStart(entry))
        break
      case 'selectAll':
        setSelectedIds(data?.examList.map((e) => e.id) ?? [])
        break
      case 'history':
        requirePassword('history', () => setView('history'))
        break
      case 'options':
        setDialog({ kind: 'options' })
        break
      case 'exit':
        window.close()
        break
      case 'helpWeb':
        void window.api.openExternal('https://www.vceexam.com')
        break
      case 'about':
        showMessage('About VCE Player', 'VCE Exam Player (Electron)\n\nA TypeScript/React recreation of the VCE Player exam engine.')
        break
      case 'helpQuickStart':
        showMessage(
          'Quick Start',
          '1. Click Add and choose a .vce exam file.\n2. Select the exam and click Start.\n3. Set the exam mode and candidate name.\n4. Answer the questions and click End Exam to see the score report.'
        )
        break
      default:
        break
    }
  }

  // Menu keyboard shortcuts (mirrors the original Player menu bar).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const typing = Boolean(target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable))
      if (event.key === 'Insert') {
        event.preventDefault()
        onMenuAction('add')
      } else if (event.key === 'F2') {
        event.preventDefault()
        onMenuAction('change')
      } else if (event.key === 'Delete' && !typing) {
        onMenuAction('remove')
      } else if (event.key === 'F5') {
        event.preventDefault()
        onMenuAction('start')
      } else if (event.key === 'F1') {
        event.preventDefault()
        onMenuAction('helpQuickStart')
      } else if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a' && !typing) {
        event.preventDefault()
        onMenuAction('selectAll')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const busyToast = busy && <div className="toast spin">{busy}</div>

  if (active) {
    return (
      <>
        <ExamRunner
          file={active.file}
          exam={active.file.exams[active.examIndex]}
          built={active.built}
          options={active.options}
          resume={active.resume}
          onRecord={(record) => {
            void window.api.addHistory(record).then(setData)
          }}
          onSaveSession={(session) => {
            void window.api.saveSession(session).then(setData)
          }}
          onExit={() => setActive(null)}
          onRetake={() => {
            const entry = data?.examList.find((e) => e.filePath === active.file.path)
            setActive(null)
            if (entry) void doStart(entry)
          }}
        />
        {busyToast}
      </>
    )
  }

  return (
    <div className="app">
      <MenuBar
        onAction={onMenuAction}
        disabled={{
          change: !selectedEntry,
          remove: !selectedEntry || options.disableEditExamList,
          properties: !selectedEntry,
          start: !selectedEntry
        }}
      />
      {view === 'history' ? (
        <HistoryView
          records={data?.history ?? []}
          sessions={data?.sessions ?? []}
          disableClear={options.disableClearHistory}
          onClose={() => setView('main')}
          onResume={(session) => void resumeSession(session)}
          onRetake={(record) => void retakeRecord(record)}
        />
      ) : (
        <div className="window-main">
          <header className="window-header">
            <div>
              <h1>Exam Library</h1>
              <div className="subtitle">{data?.examList.length ?? 0} exam file(s) in your list</div>
            </div>
            <div className="window-actions">
              <button className="btn" onClick={() => setView('history')}>
                History
              </button>
              <button className="btn" onClick={() => setDialog({ kind: 'options' })}>
                Options
              </button>
              <button
                className="btn primary"
                disabled={!selectedEntry}
                onClick={() => selectedEntry && requirePassword('start', () => void doStart(selectedEntry))}
              >
                Start Exam
              </button>
            </div>
          </header>
          <div className="content">
            <section className="panel">
              <div className="panel-head">
                <span>Exams</span>
                <span className="badge accent">{data?.examList.length ?? 0}</span>
                <span className="spacer" />
                <button className="btn sm primary" onClick={() => void addExams()}>
                  Add Exam File
                </button>
                <button
                  className="btn sm"
                  disabled={!selectedEntry || options.disableEditExamList}
                  onClick={() => selectedEntry && setDialog({ kind: 'change', entry: selectedEntry })}
                >
                  Change
                </button>
                <button
                  className="btn sm danger"
                  disabled={!selectedEntry || options.disableEditExamList}
                  onClick={() =>
                    selectedEntry &&
                    void window.api.removeFromList(selectedEntry.id).then((d) => {
                      setData(d)
                      setSelectedId(d.examList[0]?.id ?? null)
                    })
                  }
                >
                  Remove
                </button>
                <button
                  className="btn sm"
                  disabled={!selectedEntry}
                  onClick={() =>
                    selectedEntry &&
                    void loadFile(selectedEntry.filePath)
                      .then((file) => setDialog({ kind: 'properties', file }))
                      .catch((error) => showMessage('Properties', (error as Error).message))
                  }
                >
                  Properties
                </button>
              </div>

          {data && data.examList.length === 0 ? (
            <div className="empty">
              <div className="empty-icon">📄</div>
              <h2>No exam files yet</h2>
              <p className="hint">Add a <code>.vce</code> exam file to start practising.</p>
              <button className="btn primary" onClick={() => void addExams()}>
                Add Exam File
              </button>
            </div>
          ) : (
            <table className="list">
              <thead>
                <tr>
                  <th>Title</th>
                  {options.showFilenameColumn && <th>Filename</th>}
                </tr>
              </thead>
              <tbody>
                {(data?.examList ?? []).map((entry) => (
                  <tr
                    key={entry.id}
                    className={isSelected(entry.id) ? 'selected' : ''}
                    onClick={(e) => {
                      if (e.ctrlKey || e.metaKey) {
                        setSelectedIds((prev) =>
                          prev.includes(entry.id) ? prev.filter((id) => id !== entry.id) : [...prev, entry.id]
                        )
                      } else {
                        setSelectedId(entry.id)
                      }
                    }}
                    onDoubleClick={() => requirePassword('start', () => void doStart(entry))}
                  >
                    <td>{entry.title}</td>
                    {options.showFilenameColumn && <td className="filename">{entry.filePath}</td>}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
          </div>
          <div className="statusbar">
            <span>{selectedEntry ? `Selected: ${selectedEntry.title}` : 'No exam selected'}</span>
            <span className="spacer" />
            <span>{data?.examList.length ?? 0} exam file(s)</span>
            <span>·</span>
            <span>{data?.history.length ?? 0} attempt(s)</span>
          </div>
        </div>
      )}

      {dialog?.kind === 'options' && (
        <OptionsDialog
          options={options}
          onCancel={() => setDialog(null)}
          onSave={(next) => {
            void window.api.setOptions(next).then(setData)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'properties' && <PropertiesDialog file={dialog.file} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'change' && (
        <ChangeExamDialog
          entry={dialog.entry}
          onCancel={() => setDialog(null)}
          onSave={(entry) => {
            void window.api.updateInList(entry).then(setData)
            setDialog(null)
          }}
        />
      )}
      {dialog?.kind === 'decryptKey' && (
        <DecryptKeyDialog
          filePath={dialog.filePath}
          onCancel={() => setDialog(null)}
          onSubmit={(key) => {
            void window.api.parseExam(dialog.filePath, key).then((result) => {
              if (!result.file) {
                showMessage('Cannot open exam', result.error?.message ?? 'Unable to parse exam file')
                return
              }
              const file = result.file
              parsedCache.current.set(file.path, file)
              void window.api
                .addToList({ filePath: file.path, title: file.title || file.number || file.path })
                .then((d) => {
                  setData(d)
                  const entry = d.examList.find((e) => e.filePath === file.path)
                  if (entry) setSelectedId(entry.id)
                  setDialog(null)
                })
            })
          }}
        />
      )}
      {dialog?.kind === 'examMode' && (
        <ExamModeDialog
          file={
            parsedCache.current.get(dialog.entry.filePath) ??
            ({ exams: [] } as unknown as VceFile)
          }
          appOptions={options}
          onCancel={() => setDialog(null)}
          onStart={(examIndex, opts) => void startWithOptions(dialog.entry, examIndex, opts)}        />
      )}
      {dialog?.kind === 'message' && (
        <div className="modal-backdrop" onClick={() => setDialog(null)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <header>{dialog.title}</header>
            <div className="body" style={{ whiteSpace: 'pre-wrap' }}>
              {dialog.message}
            </div>
            <footer>
              <button className="btn primary" onClick={() => setDialog(null)}>
                OK
              </button>
            </footer>
          </div>
        </div>
      )}
      {dialog?.kind === 'password' && (
        <PasswordPrompt
          onCancel={() => setDialog(null)}
          onSubmit={(value) => {
            if (value === dialog.expected) {
              setDialog(null)
              dialog.onOk()
            } else {
              showMessage('Incorrect password', 'The administrator password is incorrect.')
            }
          }}
        />
      )}
      {busyToast}
    </div>
  )
}

function DEFAULT_OPTIONS_TO_LAUNCH(options: AppOptions): ExamLaunchOptions {
  return {
    candidateName: options.defaultCandidateName,
    mode: 'all',
    sectionIds: [],
    questionCount: 0,
    rangeFrom: 1,
    rangeTo: 1,
    incorrectAtLeast: 1,
    trainingMode: false,
    timerOn: true,
    timeLimitMinutes: 0,
    randomizeQuestions: options.randomizeQuestions,
    randomizeChoices: options.randomizeChoices,
    allowPrevious: options.enablePrevious,
    enableCalculator: options.enableCalculator,
    enablePause: options.enablePause
  }
}

function PasswordPrompt({
  onCancel,
  onSubmit
}: {
  onCancel: () => void
  onSubmit: (value: string) => void
}): JSX.Element {
  const [value, setValue] = useState('')
  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal small" onClick={(e) => e.stopPropagation()}>
        <header>Administrator password required</header>
        <div className="body">
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={value}
              autoFocus
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && onSubmit(value)}
            />
          </label>
        </div>
        <footer>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSubmit(value)}>
            OK
          </button>
        </footer>
      </div>
    </div>
  )
}
