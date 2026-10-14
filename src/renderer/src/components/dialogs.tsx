import { useState } from 'react'
import { AppOptions, ExamListEntry, VceFile } from '@shared/types'
import { formatDateTime } from '../state/exam-utils'

function Modal({
  title,
  children,
  onClose,
  footer,
  small
}: {
  title: string
  children: React.ReactNode
  onClose: () => void
  footer?: React.ReactNode
  small?: boolean
}): JSX.Element {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className={`modal${small ? ' small' : ''}`} onClick={(e) => e.stopPropagation()}>
        <header>{title}</header>
        <div className="body">{children}</div>
        {footer && <footer>{footer}</footer>}
      </div>
    </div>
  )
}

export function OptionsDialog({
  options,
  onSave,
  onCancel
}: {
  options: AppOptions
  onSave: (options: AppOptions) => void
  onCancel: () => void
}): JSX.Element {
  const [draft, setDraft] = useState<AppOptions>({ ...options })
  const [tab, setTab] = useState<'general' | 'admin' | 'password'>('general')

  const set = <K extends keyof AppOptions>(key: K, value: AppOptions[K]): void =>
    setDraft((current) => ({ ...current, [key]: value }))

  const check = (key: keyof AppOptions, label: string): JSX.Element => (
    <label className="field row">
      <input type="checkbox" checked={Boolean(draft[key])} onChange={(e) => set(key, e.target.checked as never)} />
      <span>{label}</span>
    </label>
  )

  return (
    <Modal
      title="Options"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSave(draft)}>
            OK
          </button>
        </>
      }
    >
      <div className="tabs">
        <button className={tab === 'general' ? 'active' : ''} onClick={() => setTab('general')}>
          General
        </button>
        <button className={tab === 'admin' ? 'active' : ''} onClick={() => setTab('admin')}>
          Administrative
        </button>
        <button className={tab === 'password' ? 'active' : ''} onClick={() => setTab('password')}>
          Password
        </button>
      </div>

      {tab === 'general' && (
        <div>
          {check('randomizeQuestions', 'Randomize questions')}
          {check('randomizeChoices', 'Randomize choices where enabled')}
          {check('enablePrevious', 'Enable Previous and Review buttons')}
          {check('enableShowAnswer', 'Enable Show Answer button')}
          {check('enablePause', 'Enable Pause button')}
          {check('enableViewAnswers', 'Enable View Answers button after an exam')}
          {check('enableCalculator', 'Enable Calculator button')}
          <div className="grid2">
            <label className="field">
              <span>Text size</span>
              <select value={draft.textSize} onChange={(e) => set('textSize', e.target.value as AppOptions['textSize'])}>
                <option value="small">Small</option>
                <option value="medium">Medium</option>
                <option value="large">Large</option>
                <option value="xlarge">Extra large</option>
              </select>
            </label>
            <label className="field">
              <span>Color scheme</span>
              <select
                value={draft.colorScheme}
                onChange={(e) => set('colorScheme', e.target.value as AppOptions['colorScheme'])}
              >
                <option value="default">Default</option>
                <option value="dark">Dark</option>
                <option value="high-contrast">High contrast</option>
              </select>
            </label>
          </div>
          {check('scanFolderOnStartup', 'At startup, add all .vce files in the specified folder to the exam list')}
        </div>
      )}

      {tab === 'admin' && (
        <div>
          {check('showFilenameColumn', 'Show Filename column in exam list')}
          {check('showExamAndQuestionNumber', 'Show real exam and question number')}
          {check('disableClearHistory', 'Disable clearing of score history')}
          {check('disableEditExamList', 'Disable adding, changing and removing items from exam list')}
          {check('disableExamMode', 'Disable selecting exam mode')}
          {check('disableTimerChange', 'Disable turning off exam timer and setting custom time limit')}
          {check('disableFileProperties', 'Disable viewing file properties')}
          {check('disablePrintReport', 'Disable printing score report')}
          <label className="field row">
            <input
              type="checkbox"
              checked={draft.resetCandidateName}
              onChange={(e) => set('resetCandidateName', e.target.checked)}
            />
            <span>Reset Candidate Name to default each time exam is started</span>
          </label>
          <label className="field">
            <span>Default Candidate Name</span>
            <input
              type="text"
              value={draft.defaultCandidateName}
              onChange={(e) => set('defaultCandidateName', e.target.value)}
            />
          </label>
        </div>
      )}

      {tab === 'password' && (
        <div>
          <label className="field row">
            <input
              type="checkbox"
              checked={draft.adminPasswordEnabled}
              onChange={(e) => set('adminPasswordEnabled', e.target.checked)}
            />
            <span>Use administrator password</span>
          </label>
          <div className="grid2">
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={draft.adminPassword}
                disabled={!draft.adminPasswordEnabled}
                onChange={(e) => set('adminPassword', e.target.value)}
              />
            </label>
          </div>
          <label className="field row">
            <input
              type="checkbox"
              checked={draft.requestPasswordToStartExam}
              disabled={!draft.adminPasswordEnabled}
              onChange={(e) => set('requestPasswordToStartExam', e.target.checked)}
            />
            <span>Request the password to start exam</span>
          </label>
          <label className="field row">
            <input
              type="checkbox"
              checked={draft.requestPasswordToViewHistory}
              disabled={!draft.adminPasswordEnabled}
              onChange={(e) => set('requestPasswordToViewHistory', e.target.checked)}
            />
            <span>Request the password to view score history</span>
          </label>
        </div>
      )}
    </Modal>
  )
}

export function PropertiesDialog({
  file,
  onClose
}: {
  file: VceFile
  onClose: () => void
}): JSX.Element {
  const total = file.exams.reduce((n, e) => n + e.questions.length, 0)
  return (
    <Modal
      title="Properties"
      onClose={onClose}
      footer={
        <button className="btn primary" onClick={onClose}>
          Close
        </button>
      }
    >
      <table className="list">
        <tbody>
          <tr>
            <th>Filename</th>
            <td>{file.path}</td>
          </tr>
          <tr>
            <th>Title</th>
            <td>{file.title}</td>
          </tr>
          <tr>
            <th>Number</th>
            <td>{file.number}</td>
          </tr>
          <tr>
            <th>Exam type</th>
            <td>{file.exams.length > 1 ? 'Standard / sectioned' : 'Standard'}</td>
          </tr>
          <tr>
            <th>Time limit (min)</th>
            <td>{file.timeLimit}</td>
          </tr>
          <tr>
            <th>Passing score</th>
            <td>{file.passingScore}</td>
          </tr>
          <tr>
            <th>File version</th>
            <td>
              {file.fileVersion || '(unknown)'} (format v{file.version})
            </td>
          </tr>
          <tr>
            <th>Size</th>
            <td>{file.sizeBytes.toLocaleString()} bytes</td>
          </tr>
          {file.created && (
            <tr>
              <th>Created</th>
              <td>{formatDateTime(file.created)}</td>
            </tr>
          )}
          {file.modified && (
            <tr>
              <th>Modified</th>
              <td>{formatDateTime(file.modified)}</td>
            </tr>
          )}
          <tr>
            <th>Exams</th>
            <td>{file.exams.length}</td>
          </tr>
          <tr>
            <th>Sections</th>
            <td>{file.sections.length}</td>
          </tr>
          <tr>
            <th>Questions</th>
            <td>{total}</td>
          </tr>
        </tbody>
      </table>
    </Modal>
  )
}

export function ChangeExamDialog({
  entry,
  onSave,
  onCancel
}: {
  entry: ExamListEntry
  onSave: (entry: ExamListEntry) => void
  onCancel: () => void
}): JSX.Element {
  const [title, setTitle] = useState(entry.title)
  const [filePath, setFilePath] = useState(entry.filePath)

  const browse = async (): Promise<void> => {
    const chosen = await window.api.chooseFile(filePath)
    if (chosen) setFilePath(chosen)
  }

  return (
    <Modal
      title="Change Exam List Item"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSave({ ...entry, title, filePath })}>
            OK
          </button>
        </>
      }
    >
      <label className="field">
        <span>Title</span>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span>File</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <input type="text" value={filePath} onChange={(e) => setFilePath(e.target.value)} />
          <button className="btn" onClick={browse}>
            Browse…
          </button>
        </div>
      </label>
    </Modal>
  )
}

export function DecryptKeyDialog({
  filePath,
  onCancel,
  onSubmit
}: {
  filePath: string
  onCancel: () => void
  onSubmit: (keyBase64: string) => void
}): JSX.Element {
  const [key, setKey] = useState('')
  return (
    <Modal
      title="Open with Decrypt Key"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={() => onSubmit(key)}>
            Open
          </button>
        </>
      }
    >
      <p className="hint">
        Some exam files protect their content with an extra key derived by the original player. Paste the base64
        <code> decryptKeys </code> blob to open this file.
      </p>
      <div className="hint" style={{ marginBottom: 8 }}>
        {filePath}
      </div>
      <label className="field">
        <span>Decrypt key (base64)</span>
        <textarea rows={5} value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
    </Modal>
  )
}

export { Modal }
