import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ExamLaunchOptions, HistoryRecord, VceExam, VceExamType, VceFile, VceQuestion, VceQuestionType } from '../src/shared/types'
import { buildExam } from '../src/renderer/src/state/exam-utils'

function question(id: number, examSectionId = -1): VceQuestion {
  return {
    id,
    examSectionId,
    type: VceQuestionType.SingleChoice,
    rawType: 0,
    sectionId: 0,
    complexity: 0,
    question: `Q${id}`,
    reference: '',
    variants: ['a', 'b'],
    variantsCount: 2,
    answers: 'A',
    hotAreas: [],
    dndTypes: [],
    dragAreas: [],
    dropAreas: [],
    blockAnswers: [],
    blockAnswersCount: 0,
    trusted: true
  }
}

const exam: VceExam = {
  id: 1,
  type: VceExamType.Section,
  name: 'Exam A',
  sections: [
    { id: 1, type: 0, timeLimit: 0, title: 'Domain 1' },
    { id: 2, type: 0, timeLimit: 0, title: 'Domain 2' }
  ],
  questions: [question(1, 1), question(2, 1), question(3, 2), question(4, 2), question(5, -1)]
}

const file: VceFile = {
  path: 'x.vce',
  version: 60,
  number: 'X',
  title: 'X',
  passingScore: 700,
  timeLimit: 0,
  fileVersion: '1',
  style: '',
  description: '',
  sections: [],
  exams: [exam],
  sizeBytes: 0,
  hasDecryptionWarnings: false
}

function options(partial: Partial<ExamLaunchOptions>): ExamLaunchOptions {
  return {
    candidateName: 'Jane',
    mode: 'all',
    sectionIds: [],
    questionCount: 0,
    rangeFrom: 1,
    rangeTo: 1,
    incorrectAtLeast: 1,
    trainingMode: false,
    timerOn: false,
    timeLimitMinutes: 0,
    randomizeQuestions: false,
    randomizeChoices: false,
    allowPrevious: true,
    enableCalculator: true,
    enablePause: true,
    ...partial
  }
}

const build = (opts: Partial<ExamLaunchOptions>, history: HistoryRecord[] = []) =>
  buildExam({ file, exam, options: options(opts), history }).flat.map((f) => f.question.id)

test('mode "all" takes every question', () => {
  assert.deepEqual(build({ mode: 'all' }), [1, 2, 3, 4, 5])
})

test('mode "sections" takes only the selected sections', () => {
  assert.deepEqual(build({ mode: 'sections', sectionIds: [1] }), [1, 2])
  assert.deepEqual(build({ mode: 'sections', sectionIds: [2] }), [3, 4])
})

test('mode "count" takes the first N questions', () => {
  assert.deepEqual(build({ mode: 'count', questionCount: 2 }), [1, 2])
  assert.deepEqual(build({ mode: 'count', questionCount: 99 }), [1, 2, 3, 4, 5])
})

test('mode "range" takes an inclusive slice', () => {
  assert.deepEqual(build({ mode: 'range', rangeFrom: 2, rangeTo: 4 }), [2, 3, 4])
  assert.deepEqual(build({ mode: 'range', rangeFrom: 3, rangeTo: 3 }), [3])
})

test('mode "incorrect" takes questions missed often enough', () => {
  const history: HistoryRecord[] = [
    {
      id: 'h1',
      examPath: 'x.vce',
      examTitle: 'X',
      examName: 'Exam A',
      candidateName: 'Jane',
      examDatetime: 0,
      elapsedSec: 0,
      passingScore: 700,
      candidateScore: 0,
      passed: false,
      total: 5,
      correct: 0,
      incorrect: 5,
      incomplete: 0,
      marked: 0,
      trainingMode: false,
      sections: [],
      answers: [
        { questionId: 2, given: 'B', correct: 'A', isCorrect: false, complete: true },
        { questionId: 3, given: 'B', correct: 'A', isCorrect: false, complete: true }
      ]
    },
    {
      id: 'h2',
      examPath: 'x.vce',
      examTitle: 'X',
      examName: 'Exam A',
      candidateName: 'Jane',
      examDatetime: 0,
      elapsedSec: 0,
      passingScore: 700,
      candidateScore: 0,
      passed: false,
      total: 5,
      correct: 0,
      incorrect: 5,
      incomplete: 0,
      marked: 0,
      trainingMode: false,
      sections: [],
      answers: [{ questionId: 2, given: 'B', correct: 'A', isCorrect: false, complete: true }]
    }
  ]
  assert.deepEqual(build({ mode: 'incorrect', incorrectAtLeast: 2 }, history), [2])
  assert.deepEqual(build({ mode: 'incorrect', incorrectAtLeast: 1 }, history).sort(), [2, 3])
})

test('randomizeQuestions keeps the same set', () => {
  const ids = build({ mode: 'all', randomizeQuestions: true })
  assert.deepEqual([...ids].sort((a, b) => a - b), [1, 2, 3, 4, 5])
})
