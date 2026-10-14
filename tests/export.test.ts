import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { HistoryRecord } from '../src/shared/types'
import { CSV_HEADER, historyToCsv, historyToTxt, historyToXml, reportToHtml, reportToText } from '../src/renderer/src/state/export'

const record: HistoryRecord = {
  id: 'h1',
  examPath: '/exams/az-104.vce',
  examTitle: 'AZ-104',
  examName: 'Exam A',
  candidateName: 'Jane "JJ" Doe',
  examDatetime: Date.UTC(2026, 0, 2, 3, 4, 5),
  elapsedSec: 2410,
  passingScore: 700,
  candidateScore: 812,
  passed: true,
  total: 50,
  correct: 41,
  incorrect: 6,
  incomplete: 3,
  marked: 2,
  trainingMode: false,
  sections: [{ name: 'Identity', correct: 20, total: 24 }],
  answers: []
}

test('TXT export lists one line per record', () => {
  const txt = historyToTxt([record, { ...record, id: 'h2', candidateName: 'Bob' }])
  assert.equal(txt.split('\n').length, 2)
  assert.match(txt, /AZ-104 Exam A/)
  assert.match(txt, /812\/700/)
  assert.match(txt, /PASS/)
})

test('CSV export round-trips quoted fields', () => {
  const csv = historyToCsv([record])
  const lines = csv.split('\n')
  assert.equal(lines[0], CSV_HEADER)
  // Parse the data row with a tiny RFC4180 reader.
  const parse = (line: string): string[] => {
    const out: string[] = []
    let cur = ''
    let quoted = false
    for (let i = 0; i < line.length; i++) {
      const c = line[i]
      if (quoted) {
        if (c === '"' && line[i + 1] === '"') {
          cur += '"'
          i++
        } else if (c === '"') quoted = false
        else cur += c
      } else if (c === '"') quoted = true
      else if (c === ',') {
        out.push(cur)
        cur = ''
      } else cur += c
    }
    out.push(cur)
    return out
  }
  const cells = parse(lines[1])
  assert.equal(cells[1], 'Jane "JJ" Doe')
  assert.equal(cells[2], 'AZ-104 Exam A')
  assert.equal(cells[3], '812')
  assert.equal(cells[5], 'PASS')
})

test('XML export is well-formed and escapes special characters', () => {
  const xml = historyToXml([record])
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/)
  assert.match(xml, /<scoreHistory>/)
  assert.match(xml, /<candidate>Jane &quot;JJ&quot; Doe<\/candidate>/)
  assert.match(xml, /<passed>true<\/passed>/)
  assert.match(xml, /<section name="Identity" correct="20" total="24" \/>/)
  assert.match(xml, /<\/scoreHistory>$/)
  // Balanced tags (excluding self-closing and the declaration).
  const opens = (xml.match(/<[a-zA-Z][^>]*[^/]>/g) ?? []).length
  const closes = (xml.match(/<\/[a-zA-Z]+>/g) ?? []).length
  assert.equal(opens, closes)
})

test('report text and HTML include the score and result', () => {
  assert.match(reportToText(record), /Result:\s+PASS/)
  const html = reportToHtml(record)
  assert.match(html, /Score Report/)
  assert.match(html, /812 \/ 1000/)
  assert.match(html, /Identity/)
})

test('exported files are re-openable with the correct content', () => {
  const dir = mkdtempSync(join(tmpdir(), 'vce-export-'))
  const files: Array<[string, string]> = [
    ['score-history.txt', historyToTxt([record])],
    ['score-history.csv', historyToCsv([record])],
    ['score-history.xml', historyToXml([record])],
    ['score-report.txt', reportToText(record)]
  ]
  for (const [name, content] of files) {
    const target = join(dir, name)
    writeFileSync(target, content, 'utf8')
    const readBack = readFileSync(target, 'utf8')
    assert.equal(readBack, content)
    assert.ok(readBack.length > 0)
  }
})
