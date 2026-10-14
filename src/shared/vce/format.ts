/**
 * Rich-text formatting for .vce question/answer bodies.
 *
 * The original application stores question text in a TRichView-like stream.
 * `FormatText` walks that stream and converts it to the HTML subset the player
 * renders (<b>, <i>, <u>, <br>, <div style="text-align:...">, <img ...>).
 *
 * Ported from the reference implementation (ExamUniverse.Converter.VCE).
 */

export const SPLITTER_MAIN = Uint8Array.from([0x2d, 0x38, 0x20, 0x31, 0x20, 0x33, 0x20, 0x31]) // "-8 1 3 1"
export const SPLITTER_BLOCK = Uint8Array.from([0x0d, 0x0a]) // \r\n
export const SPLITTER_LINE = Uint8Array.from([0x29, 0x20]) // ") "
export const SPLITTER_BLOCK2 = Uint8Array.from([0x02, 0x07])

function isControl(x: number): boolean {
  return x < 0x20 || (x >= 0x7f && x <= 0x9f)
}

/** Replicates the C# `byte[].GetString()` extension (drops control chars, decodes UTF-8). */
export function getString(bytes: Uint8Array | null | undefined): string {
  if (!bytes || bytes.length === 0) return ''
  const filtered = new Uint8Array(bytes.length)
  let n = 0
  for (const b of bytes) {
    if (!isControl(b)) filtered[n++] = b
  }
  return new TextDecoder('utf-8', { fatal: false }).decode(filtered.subarray(0, n))
}

export function getStringReplaced(bytes: Uint8Array | null | undefined): string {
  return getString(bytes).replace(/\u0000/g, '')
}

function startsWithAt(data: Uint8Array, pattern: Uint8Array, at: number): boolean {
  if (at + pattern.length > data.length) return false
  for (let i = 0; i < pattern.length; i++) if (data[at + i] !== pattern[i]) return false
  return true
}

/**
 * Faithful port of the reference `Separator` class.
 * `pop()` returns bytes up to (but not including) the first splitter occurrence;
 * when a splitter is at position 0 it returns the splitter itself.
 */
export class Separator {
  private data: Uint8Array
  private readonly splitters: Uint8Array[]

  constructor(data: Uint8Array, splitters: Uint8Array[]) {
    this.data = data
    this.splitters = splitters.filter((s) => s.length > 0)
  }

  get hasValue(): boolean {
    return this.data.length > 0
  }

  readInt32(): number {
    const v = new DataView(this.data.buffer, this.data.byteOffset, 4).getInt32(0, true)
    this.data = this.data.subarray(4)
    return v
  }

  readBytes(n: number): Uint8Array {
    const v = this.data.subarray(0, n)
    this.data = this.data.subarray(n)
    return v
  }

  push(bytes: Uint8Array): void {
    const merged = new Uint8Array(this.data.length + bytes.length)
    merged.set(this.data, 0)
    merged.set(bytes, this.data.length)
    this.data = merged
  }

  pop(): Uint8Array {
    const d = this.patternBytes()
    this.data = this.data.subarray(d.length)
    return d
  }

  peek(): Uint8Array {
    return this.patternBytes()
  }

  private patternBytes(): Uint8Array {
    for (let i = 0; i < this.data.length; i++) {
      for (const sp of this.splitters) {
        if (startsWithAt(this.data, sp, i)) {
          const count = i !== 0 ? i : sp.length
          return this.data.subarray(0, count)
        }
      }
    }
    return this.data.subarray(0)
  }
}

interface DataModel {
  type: 'text' | 'format' | 'image'
  data: Uint8Array
  property1?: Uint8Array
  property2?: Uint8Array
}

const FONT_TAGS: Record<number, [string, string]> = {
  0: ['', ''],
  1: ['<b>', '</b>'],
  2: ['<span style="font-family: Courier, monospace">', '</span>'],
  4: ['<span style="font-family: Courier, monospace"><b>', '</b></span>'],
  5: ['<span style="font-size: large"><b>', '</b></span>'],
  6: ['<u>', '</u>'],
  17: ['<i>', '</i>'],
  21: ['<u><a href="UrlData">UrlData', '</a></u>'],
  29: ['<b><u>', '</u></b>'],
  30: ['<span style="font-size: small">', '</span>'],
  32: ['<span style="font-size: large">', '</span>'],
  33: ['<a href="UrlData">UrlData', '</a>'],
  34: ['<i><a href="UrlData">UrlData', '</a></i>'],
  35: ['<b><a href="UrlData">UrlData', '</a></b>'],
  36: ['<b><i><a href="UrlData">UrlData', '</a><i></b>'],
  37: ['<b><i><u><a href="UrlData">UrlData', '</a></u><i></b>'],
  39: ['<b><i>', '</i></b>'],
  40: ['<b><i><u>', '</u></i></b>'],
  41: ['<span style="font-family: Courier, monospace; font-size: small">', '</span>'],
  42: ['<span style="font-family: Courier, monospace; font-size: large">', '</span>'],
  43: ['<i><u>', '</u></i>']
}

const LINE_TAGS: Record<number, [string, string]> = {
  [-1]: ['', ''],
  0: ['', ''],
  10: ['', ''],
  11: ['<div style="text-align: center">', '</div>'],
  17: ['<div style="text-align: right">', '</div>'],
  18: ['<div style="text-align: justify">', '</div>'],
  19: ['', ''],
  23: ['', ''],
  24: ['', '']
}

const FORMAT_PATTERNS: RegExp[] = [
  /^(-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (".*")$/,
  /^(-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/,
  /^(-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/,
  /^(-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+) (-?\d+)$/
]

const FORMAT_LINE = '<br>'

function trimStart(s: string, t: string): string {
  while (t && s.startsWith(t)) s = s.slice(t.length)
  return s
}

function trimEnd(s: string, t: string): string {
  while (t && s.endsWith(t)) s = s.slice(0, -t.length)
  return s
}

export class FormatText {
  constructor(private readonly legacyUnicode = false) {}

  formatText(data: Uint8Array): string {
    const sep = new Separator(data, [SPLITTER_BLOCK, SPLITTER_LINE])
    const models = this.getDataBySplitters(sep)

    const result: string[] = []
    let formatLineStart = ''
    let formatLineEnd = ''
    let formatTextStart = ''
    let formatTextEnd = ''
    let unicodeText = false

    for (const model of models) {
      if (model.type === 'text') {
        result.push(unicodeText
          ? new TextDecoder('utf-16le').decode(model.data).replace(/\u0000/g, '')
          : getString(model.data))
        result.push(FORMAT_LINE)
      } else if (model.type === 'format') {
        const formatData = this.splitStringByPatterns(getString(model.data))
        if (formatData.length === 0) {
          // ignore
        } else if (formatData.length === 6) {
          const formatFontNumber = Number(formatData[0])
          const formatLineNumber = Number(formatData[2])
          const url = formatData[5]
          unicodeText = this.legacyUnicode && (Number(formatData[3]) & 8) !== 0

          const line = LINE_TAGS[formatLineNumber] ?? ['', '']
          if (formatLineNumber === -1) {
            if (result[result.length - 1] === FORMAT_LINE) result.pop()
          } else {
            result.push(formatLineEnd)
            formatLineStart = line[0]
            formatLineEnd = line[1]
            result.push(formatLineStart)
          }

          let font = FONT_TAGS[formatFontNumber] ?? ['', '']
          if (formatFontNumber >= 17) font = FONT_TAGS[0]

          result.push(formatTextEnd)
          formatTextStart = font[0]
          formatTextEnd = font[1]
          result.push(formatTextStart.replace(/UrlData/g, url))
        } else if (formatData.length === 7) {
          // ignore
        } else if (formatData.length === 10) {
          result.push('\u2022 ')
          result.push(FORMAT_LINE)
        } else {
          throw new Error(`Format type not found (${formatData.length})`)
        }
      } else {
        const width = model.property1 ? getStringReplaced(model.property1).replace(/=/g, '="') + '"' : ''
        const height = model.property2 ? getStringReplaced(model.property2).replace(/=/g, '="') + '"' : ''
        const base64 = bytesToBase64(model.data)
        result.push(`<img src="data:image;base64,${base64}" ${width} ${height} >`)
      }
    }

    let out = result.join('')
    out = trimStart(out, FORMAT_LINE)
    out = trimEnd(out, FORMAT_LINE)
    return out
  }

  private getDataBySplitters(sep: Separator): DataModel[] {
    const models: DataModel[] = []
    let data: Uint8Array = new Uint8Array(0)

    while (sep.hasValue) {
      const temp = sep.pop()
      if (temp.length === SPLITTER_LINE.length && equals(temp, SPLITTER_LINE)) {
        models.push({ type: 'text', data })
        data = new Uint8Array(0)
        continue
      }
      if (temp.length === SPLITTER_BLOCK.length && equals(temp, SPLITTER_BLOCK)) {
        models.push({ type: 'format', data })
        data = new Uint8Array(0)
        continue
      }
      const tempString = getString(temp)
      if (tempString.includes('TJPEGImage') || tempString.includes('TPngImage')) {
        this.skipSplitters(sep)
        let p1: Uint8Array | undefined
        let p2: Uint8Array | undefined
        if (getString(sep.peek()).includes('width')) {
          p1 = sep.pop()
          this.skipSplitters(sep)
        }
        if (getString(sep.peek()).includes('height')) {
          p2 = sep.pop()
          this.skipSplitters(sep)
        }
        const imageLength = sep.readInt32()
        const imageData = sep.readBytes(imageLength)
        models.push({ type: 'image', data: imageData, property1: p1, property2: p2 })
        data = new Uint8Array(0)
        continue
      }
      data = temp
    }

    return models
  }

  private skipSplitters(sep: Separator): void {
    while (sep.hasValue) {
      const temp = sep.peek()
      const isBlock = temp.length === SPLITTER_BLOCK.length && equals(temp, SPLITTER_BLOCK)
      const isLine = temp.length === SPLITTER_LINE.length && equals(temp, SPLITTER_LINE)
      if (!isBlock && !isLine) break
      sep.pop()
    }
  }

  private splitStringByPatterns(content: string): string[] {
    for (const pattern of FORMAT_PATTERNS) {
      const match = content.match(pattern)
      if (match) return match.slice(1)
    }
    return []
  }
}

export function equals(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
  }
  return btoa(binary)
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i)
  return out
}
