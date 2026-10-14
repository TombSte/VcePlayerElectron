import {
  ExamLaunchOptions,
  HistoryRecord,
  VceExam,
  VceFile,
  VceQuestion,
  VceQuestionType,
  isPlacementType
} from '../../../shared/types'

export const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'

export function choiceLetter(index: number): string {
  return LETTERS[index] ?? String(index + 1)
}

export function choiceIndex(letter: string): number {
  return LETTERS.indexOf(letter.toUpperCase())
}

export function sortLetters(value: string): string {
  return value
    .toUpperCase()
    .split('')
    .filter((c) => LETTERS.includes(c))
    .sort()
    .join('')
}

export function parseNumberSet(value: string): number[] {
  return value
    .split(',')
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b)
}

/** Like {@link parseNumberSet} but keeps the given order (for reorder/placement answers). */
export function parseNumberSequence(value: string): number[] {
  return value
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0)
    .map((v) => Number(v))
    .filter((v) => Number.isFinite(v))
}

export function isAnswered(question: VceQuestion, answer: string | undefined): boolean {
  if (!answer) return false
  return answer.trim().length > 0
}

export function isCorrect(question: VceQuestion, answer: string | undefined): boolean {
  if (!answer) return false
  const given = answer.trim()
  const correct = (question.answers || '').trim()

  // Area-selection types: the set of selected elements matters, not the order.
  if (question.type === VceQuestionType.HotArea || question.type === VceQuestionType.PointAndShoot) {
    const a = parseNumberSet(given).join(',')
    const b = parseNumberSet(correct).join(',')
    return a === b && a.length > 0
  }

  // Placement / reorder types: every slot must hold the correct item, in order.
  if (isPlacementType(question.type)) {
    const a = parseNumberSequence(given)
    const b = parseNumberSequence(correct)
    return a.length > 0 && a.length === b.length && a.every((value, index) => value === b[index])
  }

  switch (question.type) {
    case VceQuestionType.SingleChoice:
      return given.toUpperCase() === correct.toUpperCase()
    case VceQuestionType.MultipleChoice:
      return sortLetters(given) === sortLetters(correct)
    case VceQuestionType.FillInTheBlank: {
      const acceptable = question.blockAnswers.length ? question.blockAnswers : [correct]
      return acceptable.some((candidate) => candidate.trim().toLowerCase() === given.toLowerCase())
    }
    default:
      return given.toUpperCase() === correct.toUpperCase()
  }
}

export interface FlatQuestion {
  question: VceQuestion
  sectionId: number
  sectionTitle: string
}

/** Flattens an exam into questions, resolving testlet/question-set section titles. */
export function flattenExam(exam: VceExam): FlatQuestion[] {
  const titles = new Map<number, string>()
  for (const section of exam.sections) {
    titles.set(section.id, section.title || 'Question Set')
  }
  return exam.questions.map((question) => ({
    question,
    sectionId: question.examSectionId,
    sectionTitle: question.examSectionId >= 0 ? titles.get(question.examSectionId) ?? '' : ''
  }))
}

function shuffle<T>(items: T[]): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export interface BuildContext {
  file: VceFile
  exam: VceExam
  options: ExamLaunchOptions
  history: HistoryRecord[]
}

export interface BuiltExam {
  exam: VceExam
  flat: FlatQuestion[]
}

export function buildExam(context: BuildContext): BuiltExam {
  const { exam, options, history } = context
  const all = flattenExam(exam)
  let selected: FlatQuestion[]

  switch (options.mode) {
    case 'sections': {
      const set = new Set(options.sectionIds)
      selected = all.filter((f) => set.has(f.sectionId))
      break
    }
    case 'count': {
      const pool = options.randomizeQuestions ? shuffle(all) : all
      selected = pool.slice(0, Math.max(0, Math.min(options.questionCount, all.length)))
      break
    }
    case 'range': {
      const from = Math.max(1, options.rangeFrom)
      const to = Math.max(from, options.rangeTo)
      selected = all.slice(from - 1, to)
      break
    }
    case 'incorrect': {
      const counts = new Map<number, number>()
      for (const record of history) {
        for (const ans of record.answers) {
          if (!ans.isCorrect) counts.set(ans.questionId, (counts.get(ans.questionId) ?? 0) + 1)
        }
      }
      selected = all.filter((f) => (counts.get(f.question.id) ?? 0) >= options.incorrectAtLeast)
      break
    }
    default:
      selected = all
  }

  if (options.randomizeQuestions && options.mode !== 'count') {
    selected = shuffle(selected)
  }

  return {
    exam,
    flat: selected
  }
}

export function totalQuestionCount(file: VceFile): number {
  return file.exams.reduce((n, exam) => n + exam.questions.length, 0)
}

export interface AnswerEvaluation {
  correct: boolean
  complete: boolean
}

export function evaluate(
  question: VceQuestion,
  answer: string | undefined
): AnswerEvaluation {
  return {
    correct: isCorrect(question, answer),
    complete: isAnswered(question, answer)
  }
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  const pad = (n: number): string => String(n).padStart(2, '0')
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`
}

export function formatDateTime(ms: number): string {
  const d = new Date(ms)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`
}

/** Answering instructions shown by the examination window ("Instructions" button). */
export const QUESTION_INSTRUCTIONS: Record<number, string> = {
  [VceQuestionType.SingleChoice]:
    'Select one answer. Click the option button, click the answer text, or type the letter of the answer.',
  [VceQuestionType.MultipleChoice]:
    'Select one or more answers. Click the check boxes or the answer texts, or type the letters of the answers.',
  [VceQuestionType.FillInTheBlank]: 'Type your answer in the text box. Type only one answer.',
  [VceQuestionType.DragAndDrop]:
    'Select an object, then click the location where it belongs, or drag it there. Click Reset to undo all changes.',
  [VceQuestionType.PointAndShoot]:
    'Click the graphic to move the target icon to the correct position. Click Reset to restore the default position.',
  [VceQuestionType.HotArea]:
    'Click the selectable elements inside the graphic. Click an element again to deselect it. Click Reset to remove all selections.',
  [VceQuestionType.CreateATree]:
    'Drag items from the list of choices onto the tree nodes, or select a node and an item and click Move. Click Reset to remove every item you added.',
  [VceQuestionType.BuildListAndReorder]:
    'Build the answer list and arrange the items in the required order. Drag an item, double-click it, or select it and click Move. Click Reset to start over.',
  [VceQuestionType.DropAndConnect]:
    'Drag connectors between the source and target items until every connection is made. Click Reset to remove all connections.'
}

/**
 * Prints the given HTML using an offscreen iframe so the print dialog shows
 * only the requested content (used by "Print Item" and the score report).
 */
export function printHtml(title: string, bodyHtml: string): void {
  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentWindow?.document
  if (!doc) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title>` +
      '<style>body{font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;padding:24px;color:#111827;line-height:1.5}' +
      'h1{font-size:18px}h2{font-size:15px}img{max-width:100%}hr{border:none;border-top:1px solid #d1d5db;margin:16px 0}</style>' +
      `</head><body>${bodyHtml}</body></html>`
  )
  doc.close()
  setTimeout(() => {
    frame.contentWindow?.focus()
    frame.contentWindow?.print()
    setTimeout(() => frame.remove(), 2000)
  }, 250)
}
