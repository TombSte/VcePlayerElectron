import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { readVceFile } from '../src/main/vce/reader'
import { VceQuestionType } from '../src/shared/types'

const [fileArg, reportArg] = process.argv.slice(2)
assert(fileArg, 'Usage: npx tsx scripts/verify-legacy.ts <format-31.vce> [report.json]')
const filePath = path.resolve(fileArg)
const bytes = fs.readFileSync(filePath)
const hash = (value: Uint8Array) => createHash('sha256').update(value).digest('hex')
const sha256 = hash(bytes)
const parsed = readVceFile(bytes, filePath) // No external key or reference pool.
assert.equal(parsed.version, 31)
assert.equal(parsed.hasDecryptionWarnings, false)
const questions = parsed.exams.flatMap((exam) => exam.questions)
assert(questions.length > 0)
let imageRecords = 0
const typeCounts: Record<string, number> = {}
for (const question of questions) {
  assert(question.trusted && question.question.trim(), `Untrusted/empty question ${question.id}`)
  typeCounts[question.type] = (typeCounts[question.type] ?? 0) + 1
  assert(!question.question.includes('\ufffd'), `Replacement characters in question ${question.id}`)
  if (question.type === VceQuestionType.SingleChoice || question.type === VceQuestionType.MultipleChoice) {
    assert(question.variants && question.variants.length > 0, `Missing choices ${question.id}`)
    assert(question.answers.length > 0, `Missing answer ${question.id}`)
    for (const letter of question.answers) {
      assert(letter >= 'A' && letter.charCodeAt(0) - 65 < question.variants.length, `Invalid choice answer ${question.id}`)
    }
  }
  if (question.type === VceQuestionType.HotArea || question.type === VceQuestionType.PointAndShoot) {
    assert(question.hotAreas?.length && question.answers.length, `Missing hot areas/answer ${question.id}`)
    for (const index of question.answers.split(',').map(Number)) {
      assert(Number.isInteger(index) && index >= 1 && index <= question.hotAreas.length, `Invalid hot-area answer ${question.id}`)
    }
  }
  if (question.areaImage) {
    const source = question.areaImage.match(/src="data:image[^,]*,([^"]*)"/)
    assert(source, `Missing image source ${question.id}`)
    const image = Buffer.from(source[1], 'base64')
    assert(image[0] === 0xff && image[1] === 0xd8 || image.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')), `Unrecognized image ${question.id}`)
    if (image[0] === 0xff) assert(image.subarray(-2).equals(Buffer.from('ffd9', 'hex')), `Truncated JPEG ${question.id}`)
    imageRecords++
  }
}
assert.equal(hash(bytes), sha256, 'Reader mutated input')
const report = {
  timestamp: new Date().toISOString(), filePath, sha256, bytes: bytes.length,
  version: parsed.version, number: parsed.number,
  exams: parsed.exams.map((exam) => ({ name: exam.name, questions: exam.questions.length })),
  questions: questions.length, typeCounts, imageRecords, untrusted: 0,
  decryptionWarnings: parsed.hasDecryptionWarnings, manualPool: false, inputUnmodified: true,
  limitations: ['Answers checked for structural validity, not independently verified against the original Player.', 'Embedded images checked for signatures/truncation, not every pixel decoded.', 'Opaque trailer not authenticated.'],
  ok: true
}
if (reportArg) {
  fs.mkdirSync(path.dirname(path.resolve(reportArg)), { recursive: true })
  fs.writeFileSync(reportArg, JSON.stringify(report, null, 2) + '\n')
}
console.log(JSON.stringify(report, null, 2))
