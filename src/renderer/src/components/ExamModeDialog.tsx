import { useState } from 'react'
import { AppOptions, ExamLaunchOptions, ExamModeKind, VceFile } from '@shared/types'
import { Modal } from './dialogs'

export function ExamModeDialog({
  file,
  appOptions,
  onStart,
  onCancel
}: {
  file: VceFile
  appOptions: AppOptions
  onStart: (examIndex: number, options: ExamLaunchOptions) => void
  onCancel: () => void
}): JSX.Element {
  const [examIndex, setExamIndex] = useState(0)
  const exam = file.exams[examIndex]
  const [mode, setMode] = useState<ExamModeKind>('all')
  const [candidateName, setCandidateName] = useState(appOptions.defaultCandidateName)
  const [sections, setSections] = useState<number[]>(exam?.sections.map((s) => s.id) ?? [])
  const [questionCount, setQuestionCount] = useState(Math.min(10, exam?.questions.length ?? 0))
  const [rangeFrom, setRangeFrom] = useState(1)
  const [rangeTo, setRangeTo] = useState(exam?.questions.length ?? 1)
  const [incorrectAtLeast, setIncorrectAtLeast] = useState(1)
  const [trainingMode, setTrainingMode] = useState(false)
  const [timerOn, setTimerOn] = useState(file.timeLimit > 0)
  const [timeLimit, setTimeLimit] = useState(file.timeLimit || 60)

  const onExamChange = (index: number): void => {
    setExamIndex(index)
    const next = file.exams[index]
    setSections(next?.sections.map((s) => s.id) ?? [])
    setQuestionCount(Math.min(10, next?.questions.length ?? 0))
    setRangeTo(next?.questions.length ?? 1)
  }

  const start = (): void => {
    onStart(examIndex, {
      candidateName,
      mode,
      sectionIds: sections,
      questionCount,
      rangeFrom,
      rangeTo,
      incorrectAtLeast,
      trainingMode,
      timerOn,
      timeLimitMinutes: timeLimit,
      randomizeQuestions: appOptions.randomizeQuestions,
      randomizeChoices: appOptions.randomizeChoices,
      allowPrevious: appOptions.enablePrevious,
      enableCalculator: appOptions.enableCalculator,
      enablePause: appOptions.enablePause
    })
  }

  const radio = (kind: ExamModeKind, label: string, disabled?: boolean): JSX.Element => (
    <label
      className={`field row${disabled ? ' disabled' : ''}`}
      aria-disabled={disabled || undefined}
      title={disabled ? 'No sections are available in this exam.' : undefined}
    >
      <input
        type="radio"
        name="mode"
        checked={mode === kind}
        disabled={disabled}
        onChange={() => setMode(kind)}
      />
      <span>{label}</span>
      {disabled && <span className="hint disabled-reason">No sections available</span>}
    </label>
  )

  return (
    <Modal
      title="Exam Mode"
      onClose={onCancel}
      footer={
        <>
          <button className="btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="btn primary" onClick={start}>
            Start Exam
          </button>
        </>
      }
    >
      <label className="field">
        <span>Candidate name</span>
        <input
          type="text"
          value={candidateName}
          onChange={(e) => setCandidateName(e.target.value)}
          placeholder="Your name"
        />
      </label>

      {file.exams.length > 1 && (
        <label className="field">
          <span>Exam</span>
          <select value={examIndex} onChange={(e) => onExamChange(Number(e.target.value))}>
            {file.exams.map((e, i) => (
              <option value={i} key={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <fieldset style={{ border: '1px solid var(--border)', borderRadius: 8, margin: '8px 0' }}>
        <legend>Questions</legend>
        {radio('all', 'Take selected exam')}
        {radio('sections', 'Take questions from selected sections only', !exam?.sections.length)}
        {mode === 'sections' && exam?.sections.length > 0 && (
          <div style={{ marginLeft: 26, marginBottom: 8 }}>
            {exam.sections.map((section) => (
              <label className="field row" key={section.id}>
                <input
                  type="checkbox"
                  checked={sections.includes(section.id)}
                  onChange={(e) =>
                    setSections((prev) =>
                      e.target.checked ? [...prev, section.id] : prev.filter((id) => id !== section.id)
                    )
                  }
                />
                <span>{section.title || `Section ${section.id}`}</span>
              </label>
            ))}
          </div>
        )}
        <div className="field row">
          <input type="radio" name="mode" checked={mode === 'count'} onChange={() => setMode('count')} />
          <span>Take</span>
          <input
            type="number"
            min={1}
            style={{ width: 90 }}
            value={questionCount}
            onChange={(e) => setQuestionCount(Number(e.target.value))}
          />
          <span>questions from entire exam file</span>
        </div>
        <div className="field row">
          <input type="radio" name="mode" checked={mode === 'range'} onChange={() => setMode('range')} />
          <span>Take question range from</span>
          <input
            type="number"
            min={1}
            style={{ width: 80 }}
            value={rangeFrom}
            onChange={(e) => setRangeFrom(Number(e.target.value))}
          />
          <span>to</span>
          <input
            type="number"
            min={1}
            style={{ width: 80 }}
            value={rangeTo}
            onChange={(e) => setRangeTo(Number(e.target.value))}
          />
        </div>
        <div className="field row">
          <input type="radio" name="mode" checked={mode === 'incorrect'} onChange={() => setMode('incorrect')} />
          <span>Take questions answered incorrectly</span>
          <input
            type="number"
            min={1}
            style={{ width: 70 }}
            value={incorrectAtLeast}
            onChange={(e) => setIncorrectAtLeast(Number(e.target.value))}
          />
          <span>or more times</span>
        </div>
      </fieldset>

      <label className="field row">
        <input type="checkbox" checked={trainingMode} onChange={(e) => setTrainingMode(e.target.checked)} />
        <span>Training mode (show correct answer immediately)</span>
      </label>

      <div className="grid2">
        <label className="field row">
          <input
            type="checkbox"
            checked={timerOn}
            disabled={appOptions.disableTimerChange}
            onChange={(e) => setTimerOn(e.target.checked)}
          />
          <span>Timer on</span>
        </label>
        <label className="field">
          <span>Time limit (minutes)</span>
          <input
            type="number"
            min={1}
            value={timeLimit}
            disabled={appOptions.disableTimerChange || !timerOn}
            onChange={(e) => setTimeLimit(Number(e.target.value))}
          />
        </label>
      </div>
    </Modal>
  )
}
