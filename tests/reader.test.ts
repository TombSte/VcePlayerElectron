import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildVce, buildLegacyVce, legacyArray, QuestionSpec } from './support/vce-writer'
import { readLegacyArray } from '../src/main/vce/legacy'
import { FormatText } from '../src/shared/vce/format'
import { areaImageSource } from '../src/shared/vce/image'
import { readVceFile } from '../src/main/vce/reader'
import { VceQuestionType } from '../src/shared/types'

function parse(spec: QuestionSpec): ReturnType<typeof readVceFile>['exams'][number]['questions'][number] {
  const file = readVceFile(new Uint8Array(buildVce({ questions: [spec] })), 'fixture.vce')
  return file.exams[0].questions[0]
}

test('truncated legacy header reports a bounded read error, not a modern pool length', () => {
  const header = Buffer.from([0x85, 0xa8, 3, 1, 0, 0x7a, 0xfc, 0xc5])
  assert.throws(() => readVceFile(header, 'legacy.vce'), /Unexpected end of file/)
})

test('unimplemented legacy formats remain explicitly unsupported', () => {
  assert.throws(() => readVceFile(Buffer.from([0x85, 0xa8, 3, 2, 0, 0, 0, 0])), /Unsupported \.vce format version 32/)
})

test('unknown future formats are rejected rather than guessed', () => {
  const header = Buffer.from([0x85, 0xa8, 6, 3, 0, 0, 0, 0])
  assert.throws(() => readVceFile(header, 'future.vce'), /Unsupported \.vce format version 63/)
})

const AREAS = [
  { x: 1, y: 2, width: 10, height: 20 },
  { x: 5, y: 6, width: 7, height: 8 }
]
const DND_AREAS = [
  { type: 1, number: 1, x: 0, y: 0, width: 5, height: 5 },
  { type: 1, number: 2, x: 2, y: 2, width: 5, height: 5 },
  { type: 2, number: 3, x: 9, y: 9, width: 5, height: 5 }
]

const TYPE_MAP: Array<[number, VceQuestionType]> = [
  [0, VceQuestionType.SingleChoice],
  [1, VceQuestionType.MultipleChoice],
  [2, VceQuestionType.DragAndDrop],
  [3, VceQuestionType.PointAndShoot],
  [4, VceQuestionType.CreateATree],
  [5, VceQuestionType.BuildListAndReorder],
  [6, VceQuestionType.DropAndConnect],
  [7, VceQuestionType.CaseStudy],
  [8, VceQuestionType.FillInTheBlank],
  [9, VceQuestionType.HotArea]
]

for (const [code, expected] of TYPE_MAP) {
  test(`question type code ${code} maps to ${VceQuestionType[expected]}`, () => {
    const question = parse({
      type: code,
      question: 'Question text',
      variants: ['first', 'second'],
      choiceAnswer: 'AB',
      reference: 'reference',
      areas: AREAS,
      hotAnswerIndexes: [2],
      dndAreas: DND_AREAS,
      dndAnswer: [-1, -1, 1],
      image: Buffer.from('image-bytes'),
      blocks: ['block answer']
    })
    assert.equal(question.rawType, code)
    assert.equal(question.type, expected)
    assert.equal(question.question, 'Question text')
    assert.equal(question.trusted, true)
  })
}

test('choice questions expose variants, reference and answer', () => {
  const question = parse({
    type: 1,
    question: 'Pick all',
    variants: ['alpha', 'beta', 'gamma'],
    choiceAnswer: 'AC',
    reference: 'see exhibit'
  })
  assert.deepEqual(question.variants, ['alpha', 'beta', 'gamma'])
  assert.equal(question.variantsCount, 3)
  assert.equal(question.answers, 'AC')
  assert.equal(question.reference, 'see exhibit')
})

test('hot area / point and shoot expose rectangles and selected indexes', () => {
  for (const code of [9, 3]) {
    const question = parse({ type: code, question: 'Click', areas: AREAS, hotAnswerIndexes: [2], image: Buffer.from('png') })
    assert.equal(question.hotAreas.length, 2)
    assert.deepEqual(question.hotAreas[0], { x: 1, y: 2, width: 10, height: 20 })
    assert.equal(question.answers, '2')
    assert.match(question.areaImage ?? '', /^<img src="data:image;base64,/)
  }
})

test('drag and drop family exposes drag/drop areas and the answer mapping', () => {
  for (const code of [2, 4, 5, 6]) {
    const question = parse({ type: code, question: 'Place', dndAreas: DND_AREAS, dndAnswer: [-1, -1, 1], image: Buffer.from('png') })
    assert.equal(question.dragAreas.length, 2)
    assert.equal(question.dropAreas.length, 1)
    assert.equal(question.answers, '2')
  }
})

test('manual base64 pool decrypts a protected-selector record', () => {
  const bytes = buildVce({ number: 'PROTECTED-123', questions: [{ type: 0, question: 'Fallback test' }] })
  // The fixture has 1024-byte keys and 2304-byte encrypted pool header arrays.
  const keys = bytes.subarray(13, 13 + 1024)
  const numberRecord = 8 + 5 + 1024 + 5 + 2304 + 1
  bytes[numberRecord + 5] = 0x80
  const result = readVceFile(bytes, 'protected.vce', { decryptKeysBase64: keys.toString('base64') })
  assert.equal(result.number, 'PROTECTED-123')
  assert.equal(result.exams[0].questions[0].question, 'Fallback test')
  assert.equal(result.hasDecryptionWarnings, false)
  assert.notEqual(readVceFile(bytes, 'protected.vce').number, result.number)
  assert.throws(() => readVceFile(bytes, 'protected.vce', { decryptKeysBase64: Buffer.alloc(16).toString('base64') }), /Key pool exhausted/)
})

for (const [code, expected] of TYPE_MAP) {
  test(`legacy format 31 parses question type ${code} with both rich-text versions`, () => {
    for (const richTextVersion of [2, 3] as const) {
      const bytes = buildLegacyVce({ questions: [{
        type: code, richTextVersion, question: 'Legacy question', reference: 'Legacy reference',
        variants: ['first', 'second'], choiceAnswer: 'AB', areas: AREAS,
        hotAnswerIndexes: [2], dndAreas: DND_AREAS, dndAnswer: [-1, -1, 1],
        image: Buffer.from('image-bytes'), blocks: ['block answer']
      }] })
      const original = Buffer.from(bytes)
      const file = readVceFile(bytes, 'legacy-fixture.vce')
      const question = file.exams[0].questions[0]
      assert.equal(file.version, 31)
      assert.equal(file.number, 'TEST-31')
      assert.equal(file.title, 'Legacy Exam')
      assert.equal(file.hasDecryptionWarnings, false)
      assert.equal(question.type, expected)
      assert.equal(question.question, 'Legacy question')
      assert.equal(question.reference, 'Legacy reference')
      assert.equal(question.trusted, true)
      if ([0, 1, 7].includes(code)) {
        assert.deepEqual(question.variants, ['first', 'second'])
        assert.equal(question.answers, 'AB')
      } else if ([3, 9].includes(code)) {
        assert.deepEqual(question.hotAreas, AREAS)
        assert.equal(question.answers, '2')
      } else if (code === 8) assert.deepEqual(question.blockAnswers, ['block answer'])
      else assert.equal(question.answers, '2')
      assert.deepEqual(bytes, original, 'decoder must not mutate Buffer input')
      assert.equal(readVceFile(new Uint8Array(bytes)).exams[0].questions[0].question, 'Legacy question')
    }
  })
}

test('legacy metadata handles absent authors and optional opaque trailers', () => {
  for (const hasAuthor of [false, true]) for (const trailer of [false, true]) {
    const file = readVceFile(buildLegacyVce({ questions: [], hasAuthor, trailer }))
    assert.equal(file.exams[0].name, 'Exam A')
    assert.equal(file.hasDecryptionWarnings, false)
  }
})

test('legacy cipher decodes a fixed captured AZ-303 number record', () => {
  const data = Buffer.from('7afcc53922bbfc7562975d', 'hex')
  let offset = 0
  const read = (n: number): Uint8Array => {
    assert.ok(n >= 0 && offset + n <= data.length)
    const bytes = data.subarray(offset, offset + n)
    offset += n
    return bytes
  }
  assert.equal(Buffer.from(readLegacyArray(read)).toString(), 'AZ-303')
  assert.equal(offset, data.length)
})

test('legacy cipher resets inside large records and does not mutate slices', () => {
  const plain = Buffer.from(Array.from({ length: 0xf000 * 2 + 17 }, (_, i) => i % 251))
  const encoded = legacyArray(plain)
  const original = Buffer.from(encoded)
  let offset = 0
  const decoded = readLegacyArray((n) => {
    const out = encoded.subarray(offset, offset + n)
    offset += n
    return out
  })
  assert.deepEqual(Buffer.from(decoded), plain)
  assert.deepEqual(encoded, original)
})

test('legacy record lengths are checked before allocating a body', () => {
  const data = buildLegacyVce({ questions: [] })
  const negative = Buffer.from(data)
  negative[9] ^= 0x80 // encoded high bit of number-record length
  assert.throws(() => readVceFile(negative), /Negative read length/)
  assert.throws(() => readVceFile(data.subarray(0, 11)), /Unexpected end of file/)
  assert.throws(() => readVceFile(Buffer.concat([data, Buffer.from([1])])), /Unexpected legacy trailer length/)
})

test('area images accept both reader HTML and synthetic/session data URLs', () => {
  const url = 'data:image;base64,/9j/2Q=='
  assert.equal(areaImageSource(`<img src="${url}" >`), url)
  assert.equal(areaImageSource(`<img src='${url}' alt='diagram'>`), url)
  assert.equal(areaImageSource(url), url)
  assert.equal(areaImageSource(undefined), '')
  assert.equal(areaImageSource('<img alt="missing source">'), '')
})

test('legacy Unicode text honors the TRichView UTF-16 flag', () => {
  const data = Buffer.concat([Buffer.from('0 1 0 8 0 0\r\n'), Buffer.from('Città 東京 — €', 'utf16le'), Buffer.from(') \r\n')])
  assert.equal(new FormatText(true).formatText(data), 'Città 東京 — €')
})

test('fill in the blank exposes block answers', () => {
  const question = parse({ type: 8, question: 'Type it', blocks: ['first answer', 'second answer'] })
  assert.deepEqual(question.blockAnswers, ['first answer', 'second answer'])
  assert.equal(question.blockAnswersCount, 2)
})
