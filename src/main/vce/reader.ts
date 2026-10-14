/**
 * `.vce` (Visual CertExam) reader.
 *
 * Reverse-engineered from the original Delphi player and validated against the
 * `ExamUniverse.Converter.VCE` reference implementation and real exam files.
 *
 * Modern files (60–62) have length-prefixed AES-256-CBC encrypted records.
 * Two pools/blobs are read from their header:
 *   - `keys`        (1024 bytes): used when the record key selector is < 0x80
 *   - `encryptKeys` (2304 bytes): protected blob, not generally a decrypted pool
 *
 * Records with selector >= 0x80 are `globalOffset`-addressed into the pool
 * (format version >= 61). Question/answer bodies are TRichView-ish streams that
 * `FormatText` converts to HTML.
 *
 * Protected modern records may require an externally supplied decrypted pool.
 * Automatic pool recovery is unresolved; init_read_key's relationship to these
 * file pools is not established. Undecryptable content is flagged, not trusted.
 * Format 31 uses a separate legacy stream cipher and container layout.
 */
import { createDecipheriv } from 'node:crypto'
import { readLegacyArray } from './legacy'
import {
  FormatText,
  Separator,
  SPLITTER_MAIN,
  SPLITTER_BLOCK2,
  base64ToBytes,
  getString,
  getStringReplaced
} from '../../shared/vce/format'
import {
  VceExam,
  VceExamSection,
  VceExamType,
  VceFile,
  VceQuestion,
  VceQuestionType,
  VceSectionType
} from '../../shared/types'

const LEGACY_SPLITTER_MAIN = Uint8Array.from([0x2d, 0x38, 0x20, 0x31, 0x20, 0x32]) // "-8 1 2"

export class VceParseError extends Error {
  constructor(
    message: string,
    readonly offset?: number
  ) {
    super(message)
    this.name = 'VceParseError'
  }
}

const KNOWN_QUESTION_TYPES = new Set<number>([
  VceQuestionType.SingleChoice,
  VceQuestionType.MultipleChoice,
  VceQuestionType.DragAndDrop,
  VceQuestionType.PointAndShoot,
  VceQuestionType.CreateATree,
  VceQuestionType.BuildListAndReorder,
  VceQuestionType.DropAndConnect,
  VceQuestionType.CaseStudy,
  VceQuestionType.FillInTheBlank,
  VceQuestionType.HotArea
])

/** Question families that share a record layout with another type. */
const CHOICE_TYPES = new Set<number>([VceQuestionType.SingleChoice, VceQuestionType.MultipleChoice, VceQuestionType.CaseStudy])
const AREA_TYPES = new Set<number>([VceQuestionType.DragAndDrop, VceQuestionType.CreateATree, VceQuestionType.BuildListAndReorder, VceQuestionType.DropAndConnect])
const POINT_TYPES = new Set<number>([VceQuestionType.HotArea, VceQuestionType.PointAndShoot])

export interface ReadOptions {
  /** Optional base64 `decryptKeys` pool for records the in-file pool cannot open. */
  decryptKeysBase64?: string
}

class ByteReader {
  private view: DataView
  offset = 0

  constructor(private readonly bytes: Uint8Array) {
    this.view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  }

  get length(): number {
    return this.bytes.length
  }

  get remaining(): number {
    return this.bytes.length - this.offset
  }

  read(n: number): Uint8Array {
    if (n < 0) throw new VceParseError(`Negative read length (${n})`, this.offset)
    if (this.offset + n > this.bytes.length) {
      throw new VceParseError(`Unexpected end of file (needed ${n} bytes at offset ${this.offset})`, this.offset)
    }
    const out = this.bytes.subarray(this.offset, this.offset + n)
    this.offset += n
    return out
  }

  u8(): number {
    if (this.offset >= this.bytes.length) throw new VceParseError('Unexpected end of file', this.offset)
    return this.bytes[this.offset++]
  }

  i32(): number {
    if (this.offset + 4 > this.bytes.length) throw new VceParseError('Unexpected end of file', this.offset)
    const v = this.view.getInt32(this.offset, true)
    this.offset += 4
    return v
  }

  i64(): number {
    if (this.offset + 8 > this.bytes.length) throw new VceParseError('Unexpected end of file', this.offset)
    const v = this.view.getBigInt64(this.offset, true)
    this.offset += 8
    return Number(v)
  }
}

export class VceReader {
  private version = 0
  private keys: Uint8Array = new Uint8Array(0)
  private encryptKeys: Uint8Array = new Uint8Array(0)
  private externalKeys?: Uint8Array
  private hasDecryptionWarnings = false
  private warnings: string[] = []

  constructor(
    private readonly bytes: Uint8Array,
    private readonly options: ReadOptions = {}
  ) {
    if (options.decryptKeysBase64) {
      try {
        this.externalKeys = base64ToBytes(options.decryptKeysBase64.trim())
      } catch {
        this.externalKeys = undefined
      }
    }
  }

  private get reader(): ByteReader {
    return this.r || (this.r = new ByteReader(this.bytes))
  }
  private r?: ByteReader

  private get formatService(): FormatText {
    return this.fmt || (this.fmt = new FormatText(this.version === 31))
  }
  private fmt?: FormatText

  // ── low level ───────────────────────────────────────────────────────────
  private arrayLength(): number {
    this.reader.u8() // ignored marker byte
    const raw = this.reader.read(4).slice()
    const xor = [0x00, 0x01, 0x02, 0x07]
    let value = 0
    for (let i = 0; i < 4; i++) value |= (raw[i] ^ xor[i]) << (8 * i)
    return value | 0
  }

  private readArray(): Uint8Array {
    const length = this.arrayLength()
    return this.reader.read(length)
  }

  private readDecryptArray(): Uint8Array {
    if (this.version === 31) return readLegacyArray((length) => this.reader.read(length))
    let messageLength = this.arrayLength()
    if (messageLength === 0) return new Uint8Array(0)
    messageLength -= 1

    const selector = this.reader.u8()
    const pool = this.selectPool(selector)

    let globalOffset = 0
    if (this.version >= 61) {
      messageLength -= 4
      globalOffset = this.reader.i32()
    }

    const key = pool.subarray(globalOffset, globalOffset + 32)
    const iv = pool.subarray(globalOffset + 32, globalOffset + 48)
    const encrypted = this.reader.read(messageLength)

    if (encrypted.length === 0) return new Uint8Array(0)
    if (key.length < 32 || iv.length < 16) {
      this.hasDecryptionWarnings = true
      throw new VceParseError(`Key pool exhausted (offset ${globalOffset}, pool ${pool.length})`, this.reader.offset)
    }

    try {
      const decipher = createDecipheriv('aes-256-cbc', key, iv)
      decipher.setAutoPadding(false)
      return new Uint8Array(Buffer.concat([decipher.update(encrypted), decipher.final()]))
    } catch (error) {
      this.hasDecryptionWarnings = true
      throw new VceParseError(`AES decryption failed: ${(error as Error).message}`, this.reader.offset)
    }
  }

  private selectPool(selector: number): Uint8Array {
    if (selector < 0x80) return this.keys
    return this.externalKeys ?? this.encryptKeys
  }

  // ── top level ───────────────────────────────────────────────────────────
  read(): VceFile {
    if (this.bytes.length < 8) {
      throw new VceParseError('Invalid file format: file too small')
    }
    const headerFirst = this.reader.u8()
    const headerSecond = this.reader.u8()
    if (headerFirst !== 0x85 || headerSecond !== 0xa8) {
      throw new VceParseError('Invalid file format: bad .vce header')
    }
    const versionFirst = this.reader.u8()
    const versionSecond = this.reader.u8()
    this.version = versionFirst * 10 + versionSecond
    // Legacy containers have a different layout immediately after the version.
    // Do not interpret their bytes as modern pool lengths or request gigabytes.
    if (this.version !== 31 && (this.version < 60 || this.version > 62)) {
      throw new VceParseError(
        `Unsupported .vce format version ${this.version} (${versionFirst}.${versionSecond}); this reader currently supports formats 31 and 60–62`,
        this.reader.offset
      )
    }
    if (this.version !== 31) {
      this.reader.i32() // typeCodeLen
      this.keys = this.readArray()
      this.encryptKeys = this.readArray()
    }
    this.reader.u8() // reserved

    const number = getString(this.readDecryptArray())
    const title = getString(this.readDecryptArray())
    const passingScore = this.reader.i32()
    const timeLimit = this.reader.i32()
    const fileVersion = getString(this.readDecryptArray())
    this.reader.i64()
    this.reader.i64()
    if (this.version <= 61) {
      this.reader.i64()
      this.reader.i64()
      this.reader.u8()
      const hasAuthor = this.reader.u8()
      if (this.version !== 31 || hasAuthor !== 0) this.readDecryptArray()
      if (this.version === 31) {
        // Separate properties stream: encrypted length, unencrypted payload.
        // Native reader 0x635c3c; not the shared rich-text style stream.
        readLegacyArray((length) => this.reader.read(length), false)
      }
    }
    const style = getString(this.readDecryptArray())
    const descriptionBytes = this.readDecryptArray()
    const description = this.version === 31 ? this.formatDescription(descriptionBytes) : getString(descriptionBytes)

    const sections: { id: number; name: string }[] = []
    const sectionCount = this.reader.i32()
    for (let i = 0; i < sectionCount; i++) {
      const id = this.reader.i32()
      const name = getString(this.readDecryptArray())
      sections.push({ id, name })
    }

    if (this.version !== 31) this.readDecryptArray() // reserved ("td17")

    const exams: VceExam[] = []
    const examsCount = this.reader.i32()
    for (let i = 0; i < examsCount; i++) {
      const exam = this.readExam(exams.length + 1)
      exams.push(exam)
    }

    const fileLength = this.reader.i32()
    const sizeBytes = this.bytes.length
    if (this.version === 31) {
      // AZ-303 has an opaque 8-byte trailer; its meaning is not established.
      // Also accept containers ending directly after the declared length.
      if (this.reader.remaining === 8) this.reader.read(8)
      if (this.reader.remaining !== 0) throw new VceParseError('Unexpected legacy trailer length', this.reader.offset)
    }
    if (fileLength !== sizeBytes) {
      this.warnings.push(`Declared length ${fileLength} != file size ${sizeBytes}`)
    }

    return {
      path: '',
      version: this.version,
      number,
      title,
      passingScore,
      timeLimit,
      fileVersion,
      style,
      description,
      sections,
      exams,
      sizeBytes,
      hasDecryptionWarnings: this.hasDecryptionWarnings || this.warnings.length > 0
    }
  }

  private readExam(id: number): VceExam {
    const type = this.reader.u8() as VceExamType
    const name = getString(this.readDecryptArray())
    const exam: VceExam = { id, type, name, questions: [], sections: [] }

    if (type === VceExamType.Question) {
      const count = this.reader.i32()
      this.readQuestions(exam, count, -1)
    } else if (type === VceExamType.Section) {
      const count = this.reader.i32()
      this.readExamSections(exam, count)
    } else {
      throw new VceParseError(`Unknown exam type ${type}`, this.reader.offset)
    }
    return exam
  }

  private readQuestions(exam: VceExam, count: number, examSectionId: number): void {
    for (let i = 0; i < count; i++) {
      const question: VceQuestion = {
        id: exam.questions.length + 1,
        examSectionId,
        type: VceQuestionType.Unknown,
        rawType: -1,
        sectionId: 0,
        complexity: 0,
        question: '',
        reference: '',
        variants: [],
        variantsCount: 0,
        answers: '',
        hotAreas: [],
        dndTypes: [],
        dragAreas: [],
        dropAreas: [],
        blockAnswers: [],
        blockAnswersCount: 0,
        trusted: true
      }

      if (this.version >= 61) this.arrayLength()
      if (this.version === 31) this.reader.read(6) // native skip helper 0x6369ec
      else this.readDecryptArray() // reserved
      const rawType = this.reader.u8()
      question.rawType = rawType
      question.type = KNOWN_QUESTION_TYPES.has(rawType) ? (rawType as VceQuestionType) : VceQuestionType.Unknown
      question.sectionId = this.reader.i32()
      question.complexity = this.reader.i32()
      this.reader.i32() // reserved

      if (CHOICE_TYPES.has(rawType)) {
        const questionBytes = this.readDecryptArray()
        const answersBytes = this.readDecryptArray()
        const variantsCount = this.reader.i32()
        question.variantsCount = variantsCount
        this.reader.u8()
        this.reader.u8()
        this.reader.u8()
        this.readDecryptArray()
        this.formatExamQuestion(question, questionBytes, variantsCount)
        question.answers = getStringReplaced(answersBytes)
      } else if (POINT_TYPES.has(rawType)) {
        const variantsBytes = this.readDecryptArray()
        const answersBytes = this.readDecryptArray()
        const questionBytes = this.readDecryptArray()
        this.reader.u8()
        this.reader.u8()
        const image = this.readDecryptArray()
        this.formatAreaQuestion(question, questionBytes)
        question.areaImage = imageToHtml(image)
        this.formatHotAreaVariants(question, variantsBytes)
        this.formatHotAreaAnswers(question, answersBytes)
      } else if (AREA_TYPES.has(rawType)) {
        const variantsBytes = this.readDecryptArray()
        const answersBytes = this.readDecryptArray()
        const questionBytes = this.readDecryptArray()
        this.reader.u8()
        this.reader.u8()
        const image = this.readDecryptArray()
        this.formatAreaQuestion(question, questionBytes)
        question.areaImage = imageToHtml(image)
        this.formatDragAndDropVariants(question, variantsBytes)
        this.formatDragAndDropAnswers(question, answersBytes)
      } else if (rawType === VceQuestionType.FillInTheBlank) {
        const questionBytes = this.readDecryptArray()
        const answersBytes = this.readDecryptArray()
        const answersCount = this.reader.i32()
        this.reader.u8()
        this.reader.u8()
        this.reader.u8()
        this.formatAreaQuestion(question, questionBytes)
        this.formatBlockAnswers(question, answersBytes, answersCount)
      } else {
        question.parseError = `Unsupported question type ${rawType}`
        question.trusted = false
        this.hasDecryptionWarnings = true
        throw new VceParseError(`Unsupported question type ${rawType}`, this.reader.offset)
      }

      exam.questions.push(question)

      // If a record could not be decrypted with the available key pool, the
      // recovered text comes out empty. Flag it instead of silently showing a
      // blank question.
      if (question.question.trim() === '' && question.type !== VceQuestionType.Unknown) {
        question.trusted = false
        this.hasDecryptionWarnings = true
      }
    }
  }

  private readExamSections(exam: VceExam, count: number): void {
    for (let i = 0; i < count; i++) {
      const section: VceExamSection = {
        id: exam.sections.length + 1,
        type: this.reader.u8() as VceSectionType,
        timeLimit: this.reader.i32()
      }

      if (section.type === VceSectionType.QuestionSet) {
        const questionsCount = this.reader.i32()
        this.readQuestions(exam, questionsCount, section.id)
      } else if (section.type === VceSectionType.Testlet) {
        section.title = getString(this.readDecryptArray())
        this.reader.i32()
        this.readDecryptArray()
        section.description = this.formatDescription(this.readDecryptArray())
        this.reader.i32()
        const questionsCount = this.reader.i32()
        this.readQuestions(exam, questionsCount, section.id)
      } else {
        throw new VceParseError(`Unknown section type ${section.type}`, this.reader.offset)
      }

      exam.sections.push(section)
    }
  }

  // ── formatting ──────────────────────────────────────────────────────────
  private get richTextSplitters(): Uint8Array[] {
    return this.version === 31 ? [SPLITTER_MAIN, LEGACY_SPLITTER_MAIN] : [SPLITTER_MAIN]
  }

  private formatExamQuestion(question: VceQuestion, bytes: Uint8Array, variantsCount: number): void {
    const separator = new Separator(bytes, this.richTextSplitters)

    let firstSection = separator.pop()
    if (isSplitter(separator.peek())) {
      firstSection = firstSection.subarray(0, Math.max(0, firstSection.length - 5))
      separator.pop()
    }

    let questionSection = separator.pop()
    if (isSplitter(separator.peek())) {
      questionSection = questionSection.subarray(0, Math.max(0, questionSection.length - 5))
      separator.pop()
    }
    question.question = this.formatService.formatText(questionSection)

    for (let i = 0; i < variantsCount; i++) {
      let variant = separator.pop()
      if (isSplitter(separator.peek())) {
        variant = variant.subarray(0, Math.max(0, variant.length - 5))
        separator.pop()
      }
      question.variants.push(this.formatService.formatText(variant))
    }

    let reference = separator.pop()
    if (isSplitter(separator.peek())) {
      reference = reference.subarray(0, Math.max(0, reference.length - 5))
      separator.pop()
    }
    question.reference = this.formatService.formatText(reference)
  }

  private formatAreaQuestion(question: VceQuestion, bytes: Uint8Array): void {
    const separator = new Separator(bytes, this.richTextSplitters)

    let firstSection = separator.pop()
    if (isSplitter(separator.peek())) {
      firstSection = firstSection.subarray(0, Math.max(0, firstSection.length - 5))
      separator.pop()
    }
    let questionSection = separator.pop()
    if (isSplitter(separator.peek())) {
      questionSection = questionSection.subarray(0, Math.max(0, questionSection.length - 5))
      separator.pop()
    }
    question.question = this.formatService.formatText(questionSection)

    let reference = separator.pop()
    if (isSplitter(separator.peek())) {
      reference = reference.subarray(0, Math.max(0, reference.length - 5))
      separator.pop()
    }
    question.reference = this.formatService.formatText(reference)
  }

  private formatDescription(bytes: Uint8Array): string {
    const separator = new Separator(bytes, this.richTextSplitters)
    if (isSplitter(separator.peek())) separator.pop()
    return this.formatService.formatText(separator.pop())
  }

  private formatHotAreaVariants(question: VceQuestion, bytes: Uint8Array): void {
    if (bytes.length < 4) throw new VceParseError('Truncated hot-area data', this.reader.offset)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const count = view.getInt32(0, true)
    if (count < 0 || 4 + count * 16 > bytes.length) {
      throw new VceParseError('Invalid hot-area count (possible key mismatch)', this.reader.offset)
    }
    let offset = 4
    for (let i = 0; i < count; i++) {
      const startX = view.getInt32(offset, true)
      const startY = view.getInt32(offset + 4, true)
      const endX = view.getInt32(offset + 8, true)
      const endY = view.getInt32(offset + 12, true)
      offset += 16
      question.hotAreas.push({ x: startX, y: startY, width: endX - startX, height: endY - startY })
    }
  }

  private formatHotAreaAnswers(question: VceQuestion, bytes: Uint8Array): void {
    if (bytes.length < 4) throw new VceParseError('Truncated hot-area answers', this.reader.offset)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const count = view.getInt32(0, true)
    if (count < 0 || 4 + count > bytes.length) {
      throw new VceParseError('Invalid hot-area answer count (possible key mismatch)', this.reader.offset)
    }
    let offset = 4
    const numbers: string[] = []
    for (let i = 0; i < count; i++) {
      if (view.getUint8(offset++) === 1) numbers.push(String(i + 1))
    }
    question.answers = numbers.join(',')
  }

  private formatDragAndDropVariants(question: VceQuestion, bytes: Uint8Array): void {
    if (bytes.length < 4) throw new VceParseError('Truncated drag-and-drop data', this.reader.offset)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const count = view.getInt32(0, true)
    if (count < 0 || 4 + count * 21 > bytes.length) {
      throw new VceParseError('Invalid drag-and-drop count (possible key mismatch)', this.reader.offset)
    }
    let offset = 4
    for (let i = 0; i < count; i++) {
      const type = view.getUint8(offset)
      offset += 1
      offset += 4 // number
      const startX = view.getInt32(offset, true)
      const startY = view.getInt32(offset + 4, true)
      const endX = view.getInt32(offset + 8, true)
      const endY = view.getInt32(offset + 12, true)
      offset += 16
      question.dndTypes.push(type)
      const area = { x: startX, y: startY, width: endX - startX, height: endY - startY }
      if (type === 1) question.dragAreas.push(area)
      else if (type === 2) question.dropAreas.push(area)
      else throw new VceParseError(`Unknown drag-and-drop area type ${type}`, this.reader.offset)
    }
  }

  private formatDragAndDropAnswers(question: VceQuestion, bytes: Uint8Array): void {
    if (bytes.length < 4) throw new VceParseError('Truncated drag-and-drop answers', this.reader.offset)
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const count = view.getInt32(0, true)
    if (count < 0 || 4 + count * 4 > bytes.length) {
      throw new VceParseError('Invalid drag-and-drop answer count (possible key mismatch)', this.reader.offset)
    }
    const dragNumbers: string[] = []
    const dropNumbers: string[] = []
    let index = 0
    let offset = 4
    for (let i = 0; i < count; i++) {
      const number = view.getInt32(offset, true)
      offset += 4
      if (number === -1) {
        index += 1
        dragNumbers.push(String(index - 1))
        continue
      }
      if (question.dndTypes[index] === 1) {
        index += 1
        dragNumbers.push(String(number))
      } else if (question.dndTypes[index] === 2) {
        index += 1
        dropNumbers.push(String(number))
      } else {
        throw new VceParseError('Unknown drag-and-drop area type', this.reader.offset)
      }
    }
    if (question.dndTypes.length - index > 0) {
      const exceptNumbers = dropNumbers.filter((n) => !dragNumbers.includes(n))
      dragNumbers.push(...exceptNumbers)
      dragNumbers.sort((a, b) => Number(a) - Number(b))
    }
    const numbers: string[] = []
    for (const dropNumber of dropNumbers) {
      for (let j = 0; j < dragNumbers.length; j++) {
        if (dropNumber === dragNumbers[j]) numbers.push(String(j + 1))
      }
    }
    question.answers = numbers.join(',')
  }

  private formatBlockAnswers(question: VceQuestion, bytes: Uint8Array, answersCount: number): void {
    const separator = new Separator(bytes, [SPLITTER_BLOCK2])
    const answers: string[] = []
    separator.pop() // leading section
    for (let i = 0; i < answersCount; i++) {
      separator.pop() // separator
      let answer = separator.pop()
      if (i + 1 < answersCount && answer.length >= 3) answer = answer.subarray(0, answer.length - 3)
      answers.push(getString(answer))
    }
    question.blockAnswers = answers
    question.blockAnswersCount = answers.length
  }
}

function isSplitter(bytes: Uint8Array): boolean {
  return [SPLITTER_MAIN, LEGACY_SPLITTER_MAIN].some((splitter) =>
    bytes.length === splitter.length && bytes.every((b, i) => b === splitter[i])
  )
}

function imageToHtml(image: Uint8Array): string {
  if (image.length === 0) return ''
  return `<img src="data:image;base64,${Buffer.from(image).toString('base64')}" >`
}

export function readVceFile(bytes: Uint8Array, filePath: string, options: ReadOptions = {}): VceFile {
  const file = new VceReader(bytes, options).read()
  file.path = filePath
  // Metadata that cannot be decoded with the in-file key pool contains
  // non-text bytes; treat that as a decryption warning too.
  const garbled = (value: string): boolean => value.length > 0 && /[^\x20-\x7e]/.test(value)
  if (garbled(file.number) || garbled(file.title)) {
    file.hasDecryptionWarnings = true
  }
  return file
}
