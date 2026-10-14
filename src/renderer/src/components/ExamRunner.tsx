import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ExamLaunchOptions,
  HistoryRecord,
  SavedSession,
  SessionQuestionState,
  VceExam,
  VceFile,
  VceQuestion,
  VceQuestionType
} from '@shared/types'
import {
  BuiltExam,
  QUESTION_INSTRUCTIONS,
  choiceLetter,
  evaluate,
  formatDuration,
  isAnswered,
  printHtml,
  sortLetters
} from '../state/exam-utils'
import QuestionView from './QuestionView'
import Calculator from './Calculator'
import ScoreReport from './ScoreReport'

export interface ExamRunnerProps {
  file: VceFile
  exam: VceExam
  built: BuiltExam
  options: ExamLaunchOptions
  onRecord: (record: HistoryRecord) => void
  onSaveSession: (session: SavedSession) => void
  onExit: () => void
  onRetake: () => void
  resume?: SavedSession
}

type Phase = 'exam' | 'report' | 'review'

function newSessionId(): string {
  return `sess-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

export default function ExamRunner(props: ExamRunnerProps): JSX.Element {
  const { file, exam, built, options, resume } = props
  const orderedFlat = useMemo(() => {
    if (!resume?.questionOrder?.length) return built.flat
    const map = new Map(built.flat.map((f) => [f.question.id, f]))
    const ordered = resume.questionOrder
      .map((id) => map.get(id))
      .filter((f): f is (typeof built.flat)[number] => Boolean(f))
    const missing = built.flat.filter((f) => !resume.questionOrder.includes(f.question.id))
    return [...ordered, ...missing]
  }, [built.flat, resume?.questionOrder])
  const questions = orderedFlat.map((f) => f.question)

  const [phase, setPhase] = useState<Phase>('exam')
  const [index, setIndex] = useState(0)
  const [answers, setAnswers] = useState<Record<number, string>>(() => {
    const initial: Record<number, string> = {}
    for (const state of resume?.states ?? []) initial[state.questionId] = state.answer
    return initial
  })
  const [marked, setMarked] = useState<Set<number>>(
    () => new Set((resume?.states ?? []).filter((s) => s.marked).map((s) => s.questionId))
  )
  const [showAnswer, setShowAnswer] = useState(Boolean(options.trainingMode))
  const [paused, setPaused] = useState(false)
  const [remainingSec, setRemainingSec] = useState<number | null>(() => {
    if (!options.timerOn || options.timeLimitMinutes <= 0) return null
    return resume?.remainingSec ?? options.timeLimitMinutes * 60
  })
  const [showCalculator, setShowCalculator] = useState(false)
  const [showExhibits, setShowExhibits] = useState(false)
  const [showInstructions, setShowInstructions] = useState(false)
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incomplete' | 'marked'>('all')
  const [toast, setToast] = useState('')
  const [record, setRecord] = useState<HistoryRecord | null>(null)
  const finishedRef = useRef(false)
  const startedAt = useRef(resume?.startedAt ?? Date.now())

  const current = questions[index]
  const currentFlat = orderedFlat[index]

  // Randomised choice order per multiple-choice question.
  const choiceOrders = useMemo(() => {
    const map = new Map<number, number[]>()
    if (!options.randomizeChoices) return map
    for (const question of questions) {
      if (question.type === VceQuestionType.MultipleChoice) {
        const order = question.variants.map((_, i) => i)
        for (let i = order.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1))
          ;[order[i], order[j]] = [order[j], order[i]]
        }
        map.set(question.id, order)
      }
    }
    return map
  }, [questions, options.randomizeChoices])

  const showToast = (message: string): void => {
    setToast(message)
    window.setTimeout(() => setToast(''), 2600)
  }

  const finishExam = useCallback(() => {
    if (finishedRef.current) return
    finishedRef.current = true
    const elapsedSec = Math.floor((Date.now() - startedAt.current) / 1000)
    const answersDetail = questions.map((question) => {
      const given = answers[question.id] ?? ''
      const evaluation = evaluate(question, given)
      return {
        questionId: question.id,
        given,
        correct: question.answers,
        isCorrect: evaluation.correct,
        complete: evaluation.complete
      }
    })
    const correct = answersDetail.filter((a) => a.isCorrect).length
    const incomplete = answersDetail.filter((a) => !a.complete).length
    const markedCount = questions.filter((q) => marked.has(q.id)).length
    const candidateScore = questions.length ? Math.round((correct / questions.length) * 1000) : 0

    const sectionMap = new Map<string, { correct: number; total: number }>()
    orderedFlat.forEach((flat, i) => {
      if (flat.sectionId < 0) return
      const key = flat.sectionTitle || `Section ${flat.sectionId}`
      const entry = sectionMap.get(key) ?? { correct: 0, total: 0 }
      entry.total += 1
      if (answersDetail[i]?.isCorrect) entry.correct += 1
      sectionMap.set(key, entry)
    })

    const result: HistoryRecord = {
      id: `rec-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      examPath: file.path,
      examTitle: file.title || file.number,
      examName: exam.name,
      candidateName: options.candidateName,
      examDatetime: Date.now(),
      elapsedSec,
      passingScore: file.passingScore,
      candidateScore,
      passed: candidateScore >= file.passingScore,
      total: questions.length,
      correct,
      incorrect: questions.length - correct,
      incomplete,
      marked: markedCount,
      trainingMode: options.trainingMode,
      sections: [...sectionMap.entries()].map(([name, v]) => ({ name, ...v })),
      answers: answersDetail
    }
    setRecord(result)
    props.onRecord(result)
    setPhase('report')
  }, [answers, orderedFlat, exam, file, marked, options, props, questions])

  // Countdown timer.
  const finishRef = useRef(finishExam)
  finishRef.current = finishExam

  useEffect(() => {
    if (phase !== 'exam' || paused || remainingSec === null) return
    const id = window.setInterval(() => {
      setRemainingSec((value) => (value === null ? value : Math.max(0, value - 1)))
    }, 1000)
    return () => window.clearInterval(id)
  }, [phase, paused, remainingSec === null])

  useEffect(() => {
    if (phase === 'exam' && remainingSec === 0) finishRef.current()
  }, [phase, remainingSec])

  const setAnswer = (value: string): void => {
    if (!current || phase !== 'exam') return
    setAnswers((prev) => ({ ...prev, [current.id]: value }))
    if (options.trainingMode) {
      // Training mode reveals the answer and can auto-advance on a correct answer.
      if (evaluate(current, value).correct && index < questions.length - 1) {
        window.setTimeout(() => setIndex((i) => Math.min(questions.length - 1, i + 1)), 350)
      }
    }
  }

  const go = (delta: number): void => {
    setIndex((i) => Math.max(0, Math.min(questions.length - 1, i + delta)))
  }

  const toggleMark = (): void => {
    if (!current) return
    setMarked((prev) => {
      const next = new Set(prev)
      if (next.has(current.id)) next.delete(current.id)
      else next.add(current.id)
      return next
    })
  }

  const resetAnswer = (): void => {
    if (!current || phase !== 'exam') return
    setAnswers((prev) => ({ ...prev, [current.id]: '' }))
  }

  const saveSession = (): void => {
    const states: SessionQuestionState[] = questions.map((question) => ({
      questionId: question.id,
      answer: answers[question.id] ?? '',
      marked: marked.has(question.id),
      complete: isAnswered(question, answers[question.id]),
      timeSpentSec: 0
    }))
    props.onSaveSession({
      id: newSessionId(),
      examPath: file.path,
      examTitle: file.title || file.number,
      examName: exam.name,
      candidateName: options.candidateName,
      startedAt: startedAt.current,
      updatedAt: Date.now(),
      remainingSec,
      options,
      questionOrder: questions.map((q) => q.id),
      states
    })
    showToast('Session saved.')
  }

  // Keyboard shortcuts: ←/→ navigate, M marks, digits select a choice, Enter advances.
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      if (phase === 'report' || !current) return
      const choiceTypes = [VceQuestionType.SingleChoice, VceQuestionType.MultipleChoice, VceQuestionType.CaseStudy]
      if (event.key === 'ArrowRight') {
        event.preventDefault()
        go(1)
      } else if (event.key === 'ArrowLeft') {
        event.preventDefault()
        go(-1)
      } else if (event.key.toLowerCase() === 'm') {
        toggleMark()
      } else if (/^[1-9]$/.test(event.key) && choiceTypes.includes(current.type) && phase === 'exam') {
        const displayIndex = Number(event.key) - 1
        const order = choiceOrder ?? current.variants.map((_, i) => i)
        if (displayIndex < order.length) {
          const letter = choiceLetter(order[displayIndex])
          if (current.type === VceQuestionType.MultipleChoice) {
            const selected = new Set(sortLetters(answers[current.id] ?? '').split(''))
            if (selected.has(letter)) selected.delete(letter)
            else selected.add(letter)
            setAnswer([...selected].sort().join(''))
          } else {
            setAnswer(letter)
          }
        }
      } else if (event.key === 'Enter' && isAnswered(current, answers[current.id]) && index < questions.length - 1) {
        event.preventDefault()
        go(1)
      } else if (event.altKey) {
        const key = event.key.toLowerCase()
        if (key === 'm') toggleMark()
        else if (key === 'p') go(-1)
        else if (key === 'n') go(1)
        else if (key === 'e') finishExam()
        else if (key === 's') setPaused((v) => !v)
        else if (key === 'v') saveSession()
        else if (key === 'x') setShowExhibits((v) => !v)
        else if (key === 'i') setShowInstructions((v) => !v)
        else if (key === 'r') printItem()
      } else if (event.ctrlKey && event.key.toLowerCase() === 's') {
        event.preventDefault()
        setShowAnswer((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const printItem = (): void => {
    if (!current) return
    printHtml(
      `Question ${index + 1}`,
      `<h1>${file.title || file.number}</h1>` +
        `<h2>Question ${index + 1} of ${questions.length}</h2>` +
        current.question +
        (current.areaImage ?? '') +
        `<hr><p><b>Your answer:</b> ${given || '(not answered)'}</p>`
    )
  }

  const answeredCount = questions.filter((q) => isAnswered(q, answers[q.id])).length
  const isTraining = options.trainingMode
  const progressPct = questions.length ? Math.round((answeredCount / questions.length) * 100) : 0

  if (!current && questions.length === 0) {
    return (
      <div className="content">
        <p>This exam selection contains no questions.</p>
        <button className="btn" onClick={props.onExit}>
          Back
        </button>
      </div>
    )
  }

  if (phase === 'report' && record) {
    return (
      <ScoreReport
        record={record}
        onReview={() => setPhase('review')}
        onRetake={props.onRetake}
        onExit={props.onExit}
        disablePrint={false}
      />
    )
  }

  const choiceOrder = current ? choiceOrders.get(current.id) : undefined
  const given = current ? answers[current.id] ?? '' : ''
  const evaluation = current ? evaluate(current, given) : { correct: false, complete: false }

  return (
    <div className="exam-shell">
      <div className="exam-top">
        <span className="title">{file.title || file.number}</span>
        <span className="badge">
          {exam.name}
          {currentFlat?.sectionTitle ? ` › ${currentFlat.sectionTitle}` : ''}
        </span>
        <span className="spacer" style={{ flex: 1 }} />
        {remainingSec !== null && (
          <span className={`timer${remainingSec < 60 ? ' low' : ''}`}>
            {formatDuration(remainingSec)}
            {paused ? ' (paused)' : ''}
          </span>
        )}
        <span className="hint">
          {answeredCount}/{questions.length} answered
        </span>
        {phase === 'review' ? (
          <button className="btn primary" onClick={() => setPhase('report')}>
            Score Report
          </button>
        ) : (
          <button className="btn primary" onClick={finishExam}>
            End Exam
          </button>
        )}
        <button className="btn" onClick={props.onExit}>
          Exit
        </button>
      </div>

      <div className="question-wrap">
        <div className="question-main">
          <div className="progress" style={{ marginBottom: 14 }} role="progressbar" aria-valuenow={progressPct} aria-valuemin={0} aria-valuemax={100}>
            <span style={{ width: `${progressPct}%` }} />
          </div>
          {current && (
            <>
              <div className="q-headline">
                <span className="q-index">Question {index + 1} of {questions.length}</span>
                {currentFlat?.sectionTitle && <span className="badge">{currentFlat.sectionTitle}</span>}
                {marked.has(current.id) && <span className="badge warn">Flagged</span>}
                {current.complexity ? <span className="badge">Difficulty {current.complexity}</span> : null}
              </div>
              <QuestionView
                question={current}
                answer={given}
                onAnswer={setAnswer}
                choiceOrder={choiceOrder}
                readOnly={phase !== 'exam'}
                showAnswer={phase === 'review' || showAnswer}
                interactive={phase === 'exam'}
              />
              {isTraining && given && (
                <p className={evaluation.correct ? 'answer-state-ok' : 'answer-state-bad'} style={{ marginTop: 12 }}>
                  {evaluation.correct ? 'Correct' : 'Incorrect'}
                </p>
              )}
            </>
          )}
        </div>

        <div className="question-nav">
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <button className="btn sm" disabled={phase === 'review'} onClick={() => setShowAnswer((v) => !v)}>
              {showAnswer ? 'Hide Answer' : 'Show Answer'}
            </button>
          </div>

          {phase === 'review' && (
            <div className="tabs" style={{ marginBottom: 10 }}>
              {(['all', 'incomplete', 'marked'] as const).map((f) => (
                <button key={f} className={reviewFilter === f ? 'active' : ''} onClick={() => setReviewFilter(f)}>
                  {f === 'all' ? 'All' : f === 'incomplete' ? 'Incomplete' : 'Marked'}
                </button>
              ))}
            </div>
          )}

          <h3>Questions</h3>
          <div className="nav-grid" role="grid" aria-label="Question navigation">
            {questions.map((question, i) => {
              const complete = isAnswered(question, answers[question.id])
              const isMarked = marked.has(question.id)
              const isCorrect = phase === 'review' && evaluate(question, answers[question.id]).correct
              const isWrong = phase === 'review' && !isCorrect
              const dim =
                phase === 'review' &&
                ((reviewFilter === 'incomplete' && complete) || (reviewFilter === 'marked' && !isMarked))
              return (
                <button
                  key={question.id}
                  type="button"
                  role="gridcell"
                  aria-current={i === index}
                  aria-label={`Question ${i + 1}${complete ? ', answered' : ', unanswered'}${isMarked ? ', flagged' : ''}`}
                  className={`cell${i === index ? ' current' : ''}${complete ? ' answered' : ''}${isMarked ? ' flagged' : ''}${
                    isCorrect ? ' correct' : ''
                  }${isWrong ? ' wrong' : ''}${dim ? ' dim' : ''}`}
                  onClick={() => setIndex(i)}
                >
                  {i + 1}
                </button>
              )
            })}
          </div>

          <div className="nav-legend">
            <span>
              <i className="dot" style={{ background: 'var(--accent)' }} /> Current
            </span>
            <span>
              <i className="dot" style={{ background: 'var(--ok-soft)', borderColor: 'var(--ok)' }} /> Answered
            </span>
            <span>
              <i className="dot" style={{ background: 'var(--warn-soft)', borderColor: 'var(--warn)' }} /> Flagged
            </span>
            {phase === 'review' && (
              <>
                <span>
                  <i className="dot" style={{ background: 'var(--ok-soft)', borderColor: 'var(--ok)' }} /> Correct
                </span>
                <span>
                  <i className="dot" style={{ background: 'var(--bad-soft)', borderColor: 'var(--bad)' }} /> Incorrect
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="answer-bar">
        <button className="btn" disabled={!options.allowPrevious} onClick={() => go(-1)}>
          ← Previous
        </button>
        <button className="btn" onClick={toggleMark}>
          {marked.has(current?.id ?? -1) ? 'Unmark' : 'Mark'}
        </button>
        <button className="btn" disabled={phase !== 'exam'} onClick={resetAnswer}>
          Reset
        </button>
        <button className="btn" onClick={() => setShowExhibits(true)} disabled={!current?.reference && !current?.areaImage}>
          Exhibits
        </button>
        <button className="btn" onClick={() => setShowInstructions(true)}>
          Instructions
        </button>
        <button className="btn" onClick={printItem} disabled={!current}>
          Print Item
        </button>
        {options.enableCalculator && (
          <button className="btn" onClick={() => setShowCalculator((v) => !v)}>
            Calculator
          </button>
        )}
        {options.enablePause && remainingSec !== null && phase === 'exam' && (
          <button className="btn" onClick={() => setPaused((v) => !v)}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        )}
        <button className="btn" onClick={saveSession}>
          Save Session
        </button>
        {phase === 'exam' && (
          <button className="btn" onClick={() => setPhase('review')}>
            Review
          </button>
        )}
        <span className="spacer" />
        <button className="btn primary" onClick={() => go(1)} disabled={index >= questions.length - 1}>
          Next →
        </button>
      </div>

      {showCalculator && <Calculator onClose={() => setShowCalculator(false)} />}

      {showExhibits && current && (
        <div className="modal-backdrop" onClick={() => setShowExhibits(false)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <header>
              Exhibit — question {index + 1}
              <span className="spacer" style={{ flex: 1 }} />
              <button className="btn ghost" onClick={() => setShowExhibits(false)}>
                Close
              </button>
            </header>
            <div className="body">
              {current.areaImage ? (
                <img className="exhibit-image" src={current.areaImage} alt="exhibit" />
              ) : (
                <div dangerouslySetInnerHTML={{ __html: current.reference }} />
              )}
            </div>
          </div>
        </div>
      )}

      {showInstructions && (
        <div className="modal-backdrop" onClick={() => setShowInstructions(false)}>
          <div className="modal small" onClick={(e) => e.stopPropagation()}>
            <header>How to answer</header>
            <div className="body">
              <p>{QUESTION_INSTRUCTIONS[current?.type ?? -1] ?? 'Answer the question as instructed.'}</p>
            </div>
            <footer>
              <button className="btn primary" onClick={() => setShowInstructions(false)}>
                OK
              </button>
            </footer>
          </div>
        </div>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  )
}
