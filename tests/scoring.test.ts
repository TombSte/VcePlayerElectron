import { test } from 'node:test'
import assert from 'node:assert/strict'
import { VceQuestion, VceQuestionType } from '../src/shared/types'
import { isCorrect } from '../src/renderer/src/state/exam-utils'

function question(partial: Partial<VceQuestion> & { type: VceQuestionType; answers: string }): VceQuestion {
  return {
    id: 1,
    examSectionId: -1,
    rawType: partial.type,
    sectionId: 0,
    complexity: 0,
    question: 'Q',
    reference: '',
    variants: [],
    variantsCount: 0,
    hotAreas: [],
    dndTypes: [],
    dragAreas: [],
    dropAreas: [],
    blockAnswers: [],
    blockAnswersCount: 0,
    trusted: true,
    ...partial
  } as VceQuestion
}

test('single choice requires the exact letter', () => {
  const q = question({ type: VceQuestionType.SingleChoice, answers: 'B' })
  assert.equal(isCorrect(q, 'B'), true)
  assert.equal(isCorrect(q, 'b'), true)
  assert.equal(isCorrect(q, 'A'), false)
  assert.equal(isCorrect(q, ''), false)
})

test('multiple choice ignores order', () => {
  const q = question({ type: VceQuestionType.MultipleChoice, answers: 'AC' })
  assert.equal(isCorrect(q, 'CA'), true)
  assert.equal(isCorrect(q, 'A,C'), true)
  assert.equal(isCorrect(q, 'A'), false)
  assert.equal(isCorrect(q, 'ABC'), false)
})

test('fill in the blank accepts any listed answer, case-insensitively', () => {
  const q = question({ type: VceQuestionType.FillInTheBlank, answers: 'x', blockAnswers: ['First', 'Second'] })
  assert.equal(isCorrect(q, 'first'), true)
  assert.equal(isCorrect(q, '  SECOND '), true)
  assert.equal(isCorrect(q, 'third'), false)
})

test('hot area / point and shoot compare selected areas as a set', () => {
  for (const type of [VceQuestionType.HotArea, VceQuestionType.PointAndShoot]) {
    const q = question({ type, answers: '1,3' })
    assert.equal(isCorrect(q, '3,1'), true)
    assert.equal(isCorrect(q, '1,3'), true)
    assert.equal(isCorrect(q, '1'), false)
    assert.equal(isCorrect(q, ''), false)
  }
})

test('placement types are order sensitive', () => {
  for (const type of [
    VceQuestionType.DragAndDrop,
    VceQuestionType.CreateATree,
    VceQuestionType.BuildListAndReorder,
    VceQuestionType.DropAndConnect
  ]) {
    const q = question({ type, answers: '4,2,1,7' })
    assert.equal(isCorrect(q, '4,2,1,7'), true)
    assert.equal(isCorrect(q, '1,2,4,7'), false, 'same set but wrong order must fail')
    assert.equal(isCorrect(q, '4,2,1'), false, 'missing slot must fail')
  }
})
