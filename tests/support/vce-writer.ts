import { createCipheriv, randomBytes } from 'node:crypto'

/**
 * Minimal `.vce` writer used only by the test suite to build fixtures for every
 * question type the reader knows. Produces a self-contained format-60 file
 * (no `globalOffset`, all records encrypted with the in-file `keys` pool), so
 * the reader can open it without any derived key.
 */

export const SPLITTER_MAIN = Buffer.from([0x2d, 0x38, 0x20, 0x31, 0x20, 0x33, 0x20, 0x31])
export const SPLITTER_BLOCK2 = Buffer.from([0x02, 0x07])
const SPLITTER_LINE = Buffer.from([0x29, 0x20]) // ")\ " terminates a text run for FormatText

const XOR = [0x00, 0x01, 0x02, 0x07]

function u32(value: number): Buffer {
  const b = Buffer.alloc(4)
  b.writeInt32LE(value | 0, 0)
  return b
}

function u64(value: bigint): Buffer {
  const b = Buffer.alloc(8)
  b.writeBigInt64LE(value, 0)
  return b
}

/** 1 marker byte + 4 length bytes, each Xored with [0,1,2,7]. */
function arrayLength(length: number): Buffer {
  const b = Buffer.alloc(4)
  for (let i = 0; i < 4; i++) b[i] = ((length >> (8 * i)) & 0xff) ^ XOR[i]
  return Buffer.concat([Buffer.from([0]), b])
}

export function arrayOf(data: Buffer): Buffer {
  return Buffer.concat([arrayLength(data.length), data])
}

/** AES-256-CBC (no padding) record with selector 1 -> the in-file `keys` pool. */
export function encryptedArray(plain: Buffer, keys: Buffer): Buffer {
  const pad = (16 - (plain.length % 16)) % 16
  const padded = Buffer.concat([plain, Buffer.alloc(pad)])
  const cipher = createCipheriv('aes-256-cbc', keys.subarray(0, 32), keys.subarray(32, 48))
  cipher.setAutoPadding(false)
  const ciphertext = Buffer.concat([cipher.update(padded), cipher.final()])
  return arrayOf(Buffer.concat([Buffer.from([1]), ciphertext]))
}

export interface QuestionSpec {
  type: number
  /** Plain question bytes (split into sections by SPLITTER_MAIN as needed). */
  question?: string
  richTextVersion?: 2 | 3
  variants?: string[]
  reference?: string
  /** Choice answers (letters), e.g. "AC". */
  choiceAnswer?: string
  /** Fill-in-the-blank answers. */
  blocks?: string[]
  /** Hot area / point-and-shoot rectangles (x, y, w, h). */
  areas?: Array<{ x: number; y: number; width: number; height: number }>
  hotAnswerIndexes?: number[]
  /** Drag and drop areas: type 1 = drag, 2 = drop. */
  dndAreas?: Array<{ type: number; number: number; x: number; y: number; width: number; height: number }>
  dndAnswer?: number[]
  image?: Buffer
}

function areaBytes(areas: Array<{ x: number; y: number; width: number; height: number }>): Buffer {
  const parts: Buffer[] = [u32(areas.length)]
  for (const a of areas) {
    parts.push(u32(a.x), u32(a.y), u32(a.x + a.width), u32(a.y + a.height))
  }
  return Buffer.concat(parts)
}

function hotAnswerBytes(indexes: number[], count: number): Buffer {
  const parts: Buffer[] = [u32(count)]
  const flags = Buffer.alloc(count)
  for (const i of indexes) flags[i - 1] = 1
  parts.push(flags)
  return Buffer.concat(parts)
}

function dndVariantBytes(areas: NonNullable<QuestionSpec['dndAreas']>): Buffer {
  const parts: Buffer[] = [u32(areas.length)]
  for (const a of areas) {
    parts.push(Buffer.from([a.type]), u32(a.number), u32(a.x), u32(a.y), u32(a.x + a.width), u32(a.y + a.height))
  }
  return Buffer.concat(parts)
}

function dndAnswerBytes(values: number[]): Buffer {
  const parts: Buffer[] = [u32(values.length)]
  for (const v of values) parts.push(u32(v))
  return Buffer.concat(parts)
}

const FIVE = Buffer.alloc(5)

function textSection(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, 'utf8'), SPLITTER_LINE, FIVE])
}

function textRun(value: string): Buffer {
  return Buffer.concat([Buffer.from(value, 'utf8'), SPLITTER_LINE])
}

/** choice: header | S | question+5 | S | variant+5 | ... | S | reference */
function choicePayload(spec: QuestionSpec): Buffer {
  const splitter = spec.richTextVersion === 2 ? Buffer.from('-8 1 2') : SPLITTER_MAIN
  const parts: Buffer[] = [FIVE, splitter, textSection(spec.question ?? '')]
  for (const v of spec.variants ?? []) parts.push(splitter, textSection(v))
  parts.push(splitter, textRun(spec.reference ?? ''))
  return Buffer.concat(parts)
}

/** area: header | S | question+5 | S | reference */
function areaPayload(spec: QuestionSpec): Buffer {
  const splitter = spec.richTextVersion === 2 ? Buffer.from('-8 1 2') : SPLITTER_MAIN
  return Buffer.concat([FIVE, splitter, textSection(spec.question ?? ''), splitter, textRun(spec.reference ?? '')])
}

function choiceRecord(spec: QuestionSpec, keys: Buffer, encode = encryptedArray): Buffer {
  const variants = spec.variants ?? []
  return Buffer.concat([
    encode(choicePayload(spec), keys),
    encode(Buffer.from(spec.choiceAnswer ?? 'A', 'utf8'), keys),
    u32(variants.length),
    Buffer.from([0, 0, 0]),
    encode(Buffer.alloc(0), keys)
  ])
}

function hotAreaRecord(spec: QuestionSpec, keys: Buffer, encode = encryptedArray): Buffer {
  const areas = spec.areas ?? []
  const answers = spec.hotAnswerIndexes ?? []
  return Buffer.concat([
    encode(areaBytes(areas), keys),
    encode(hotAnswerBytes(answers, areas.length), keys),
    encode(areaPayload(spec), keys),
    Buffer.from([0, 0]),
    encode(spec.image ?? Buffer.alloc(0), keys)
  ])
}

function dndRecord(spec: QuestionSpec, keys: Buffer, encode = encryptedArray): Buffer {
  const areas = spec.dndAreas ?? []
  const answers = spec.dndAnswer ?? []
  return Buffer.concat([
    encode(dndVariantBytes(areas), keys),
    encode(dndAnswerBytes(answers), keys),
    encode(areaPayload(spec), keys),
    Buffer.from([0, 0]),
    encode(spec.image ?? Buffer.alloc(0), keys)
  ])
}

function blockRecord(spec: QuestionSpec, keys: Buffer, encode = encryptedArray): Buffer {
  const blocks = spec.blocks ?? []
  const parts: Buffer[] = [Buffer.from('x', 'utf8'), SPLITTER_BLOCK2]
  blocks.forEach((b, i) => {
    parts.push(Buffer.from(b, 'utf8'))
    if (i + 1 < blocks.length) parts.push(Buffer.alloc(3)) // trimmed by the reader
    parts.push(SPLITTER_BLOCK2)
  })
  return Buffer.concat([
    encode(areaPayload(spec), keys),
    encode(Buffer.concat(parts), keys),
    u32(blocks.length),
    Buffer.from([0, 0, 0])
  ])
}

function questionRecord(spec: QuestionSpec, keys: Buffer, encode = encryptedArray, legacy = false): Buffer {
  const head = Buffer.concat([
    legacy ? Buffer.alloc(6) : encryptedArray(Buffer.alloc(0), keys), // reserved
    Buffer.from([spec.type]),
    u32(0), // sectionId
    u32(0), // complexity
    u32(0) // reserved
  ])
  const body =
    spec.type === 0 || spec.type === 1 || spec.type === 7
      ? choiceRecord(spec, keys, encode)
      : spec.type === 8
        ? blockRecord(spec, keys, encode)
        : spec.type === 9 || spec.type === 3
          ? hotAreaRecord(spec, keys, encode)
          : dndRecord(spec, keys, encode)
  return Buffer.concat([head, body])
}

export interface FileSpec {
  number?: string
  title?: string
  questions: QuestionSpec[]
  version?: number
}

export function buildVce(spec: FileSpec): Buffer {
  const version = spec.version ?? 60
  const keys = randomBytes(1024)
  const encryptKeys = randomBytes(2304)

  const parts: Buffer[] = [
    Buffer.from([0x85, 0xa8, Math.floor(version / 10), version % 10]),
    u32(0), // typeCodeLen
    arrayOf(keys),
    arrayOf(encryptKeys),
    Buffer.from([0]) // reserved
  ]

  parts.push(
    encryptedArray(Buffer.from(spec.number ?? 'TEST-000', 'utf8'), keys),
    encryptedArray(Buffer.from(spec.title ?? 'Test Exam', 'utf8'), keys),
    u32(900),
    u32(0),
    encryptedArray(Buffer.from('1.0', 'utf8'), keys),
    u64(0n),
    u64(0n)
  )
  if (version <= 61) {
    parts.push(u64(0n), u64(0n), Buffer.from([0, 0]), encryptedArray(Buffer.alloc(0), keys))
  }
  parts.push(
    encryptedArray(Buffer.alloc(0), keys), // style
    encryptedArray(Buffer.alloc(0), keys), // description
    u32(0) // sections
  )
  parts.push(encryptedArray(Buffer.alloc(0), keys)) // reserved

  const questions = spec.questions
  parts.push(u32(1)) // one exam
  parts.push(
    Buffer.from([0]), // exam type = Question
    encryptedArray(Buffer.from('Exam A', 'utf8'), keys),
    u32(questions.length)
  )
  for (const q of questions) parts.push(questionRecord(q, keys))

  const body = Buffer.concat(parts)
  const withLength = Buffer.concat([body, u32(0)])
  const fileLength = withLength.length
  withLength.writeInt32LE(fileLength, withLength.length - 4)
  return withLength
}

/** Independent legacy fixture encoder; does not import the production decoder. */
export function legacyArray(plain: Buffer, _keys?: Buffer, encryptBody = true): Buffer {
  let state = 128
  let index = 0
  const encodeByte = (value: number): number => {
    const encoded = value ^ state
    const x = state * Math.sin((((encoded ^ value) | 1) * ((encoded + value) ^ 1)) & 255)
    const lo = Math.floor(x)
    const rounded = x - lo === 0.5 ? (lo % 2 === 0 ? lo : lo + 1) : Math.round(x)
    state = (rounded ^ (index++ & 255)) & 255
    if (index === 0xf000) { state = 128; index = 0 }
    return encoded
  }
  const header = Buffer.from([0x35, ...u32(plain.length)])
  for (let i = 0; i < header.length; i++) header[i] = encodeByte(header[i])
  const body = Buffer.from(plain)
  if (encryptBody) for (let i = 0; i < body.length; i++) body[i] = encodeByte(body[i])
  return Buffer.concat([header, body])
}

export function buildLegacyVce(spec: FileSpec & { hasAuthor?: boolean; trailer?: boolean }): Buffer {
  const keys = Buffer.alloc(0)
  const hasAuthor = spec.hasAuthor ?? true
  const parts = [
    Buffer.from([0x85, 0xa8, 3, 1, 0]),
    legacyArray(Buffer.from(spec.number ?? 'TEST-31')),
    legacyArray(Buffer.from(spec.title ?? 'Legacy Exam')),
    u32(900), u32(0), legacyArray(Buffer.from('1.0')),
    u64(0n), u64(0n), u64(0n), u64(0n), Buffer.from([0, +hasAuthor])
  ]
  if (hasAuthor) parts.push(legacyArray(legacyArray(Buffer.from('Author'))))
  // Nonempty raw properties stream catches accidental body decryption.
  parts.push(legacyArray(Buffer.from('properties'), keys, false))
  parts.push(legacyArray(Buffer.alloc(0)), legacyArray(Buffer.alloc(0)), u32(0))
  parts.push(u32(1), Buffer.from([0]), legacyArray(Buffer.from('Exam A')), u32(spec.questions.length))
  for (const q of spec.questions) parts.push(questionRecord(q, keys, legacyArray, true))
  const trailer = (spec.trailer ?? true) ? Buffer.alloc(8) : Buffer.alloc(0)
  const file = Buffer.concat([...parts, u32(0), trailer])
  file.writeInt32LE(file.length, file.length - trailer.length - 4)
  return file
}
