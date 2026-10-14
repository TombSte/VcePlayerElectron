/**
 * Validates the TypeScript .vce reader against real sample files.
 *
 * Usage:
 *   npx tsx scripts/test-reader.ts /path/to/samples
 *
 * The expected values are taken from the reference project's unit tests.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { readVceFile, VceParseError } from '../src/main/vce/reader'

interface Expectation {
  number: string
  title: string
  examName: string
  answers0: string
}

const EXPECTED: Record<string, Expectation> = {
  'microsoft.az-900.v2021-02-09.by.abdullah.124q.vce': {
    number: 'AZ-900',
    title: 'AZ-900',
    examName: 'Exam A',
    answers0: 'A'
  },
  'cisco.300-410.v2020-09-21.by.grace.36q.vce': {
    number: '300-410',
    title: '300-410',
    examName: 'Exam A',
    answers0: 'AB'
  },
  'microsoft.98-366.v2020-09-14.by.rahid.68q.vce': {
    number: '98-366',
    title: '98-366',
    examName: 'Exam A',
    answers0: 'A'
  },
  'microsoft.az-104.v2020-12-31.by.zala.135q.vce': {
    number: 'AZ-104',
    title: 'AZ-104',
    examName: 'Manage Azure identities and governance',
    answers0: 'A'
  },
  'microsoft.az-303.v2021-04-01.by.gracie.79q.vce': {
    number: 'AZ-303',
    title: 'AZ-303',
    examName: 'Implement and Monitor an Azure Infrastructure',
    answers0: 'D'
  },
  'my.exam.v9.vce': {
    number: 'AZ-104',
    title: 'AZ-104 test',
    examName: 'Monitor and back up Azure resources',
    answers0: 'C'
  }
}

const args = process.argv.slice(2)
const allowNeedsKey = args.includes('--allow-needs-key')
const dir = args.find((arg) => !arg.startsWith('--')) || join(process.cwd(), 'samples')
if (!existsSync(dir)) {
  console.error(`Sample directory not found: ${dir}`)
  process.exit(1)
}

let pass = 0
let fail = 0
let parseFail = 0
let needsKey = 0

for (const name of readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.vce'))) {
  const path = join(dir, name)
  let status = 'OK'
  try {
    const file = readVceFile(new Uint8Array(readFileSync(path)), path)
    const expected = EXPECTED[name]
    const q0 = file.exams[0]?.questions[0]
    const notes: string[] = []
    const allQuestions = file.exams.flatMap((e) => e.questions)
    const emptyQuestions = allQuestions.filter((q) => q.question.trim() === '').length
    const untrusted = allQuestions.filter((q) => !q.trusted).length
    if (expected) {
      if (file.number !== expected.number) notes.push(`number=${JSON.stringify(file.number)}`)
      if (file.title !== expected.title) notes.push(`title=${JSON.stringify(file.title)}`)
      if (file.exams[0]?.name !== expected.examName) notes.push(`exam=${JSON.stringify(file.exams[0]?.name)}`)
      if (q0 && q0.answers !== expected.answers0) notes.push(`answers=${JSON.stringify(q0.answers)}`)
    }
    if (emptyQuestions > 0 || untrusted > 0 || file.hasDecryptionWarnings) {
      status = 'NEEDKEY'
      needsKey++
      notes.unshift(`empty=${emptyQuestions}`)
    } else if (expected && notes.length === 0) {
      status = 'PASS'
      pass++
    } else if (expected) {
      status = 'FAIL'
      fail++
    }
    const total = allQuestions.length
    console.log(
      `${status.padEnd(7)} ${name.padEnd(46)} v${file.version} num=${JSON.stringify(file.number).padEnd(12)} ` +
        `exams=${file.exams.length} questions=${total}` +
        (notes.length ? `  [${notes.join(', ')}]` : '')
    )
  } catch (error) {
    const message = error instanceof VceParseError ? error.message : (error as Error).message
    // A key mismatch is not a format error: the file needs the derived key pool.
    if (/key mismatch|key pool exhausted|AES decryption failed/i.test(message)) {
      needsKey++
      console.log(`${'NEEDKEY'.padEnd(7)} ${name.padEnd(46)} ${message}`)
    } else {
      parseFail++
      console.log(`${'PARSE'.padEnd(7)} ${name.padEnd(46)} ${message}`)
    }
  }
}

console.log(`\npass=${pass} fail=${fail} needsKey=${needsKey} parseFail=${parseFail}`)
// A green corpus run must mean automatic reading, not merely no format errors.
// The explicit diagnostic flag preserves partial-reader investigation workflows.
process.exit(fail + parseFail > 0 || (needsKey > 0 && !allowNeedsKey) ? 1 : 0)
