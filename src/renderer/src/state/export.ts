import { HistoryRecord } from '../../../shared/types'
import { formatDateTime, formatDuration } from './exam-utils'

/**
 * Pure serializers for the score history and the score report.
 * Kept free of DOM/browser APIs so they can be unit-tested and reused.
 */

export function csvEscape(value: unknown): string {
  return `"${String(value ?? '').replace(/"/g, '""')}"`
}

export function xmlEscape(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

export function historyToTxt(records: HistoryRecord[]): string {
  return records
    .map(
      (r) =>
        `${formatDateTime(r.examDatetime)}  ${r.candidateName || '(none)'}  ${r.examTitle} ${r.examName}  ` +
        `${r.candidateScore}/${r.passingScore}  ${r.passed ? 'PASS' : 'FAIL'}  (${formatDuration(r.elapsedSec)})`
    )
    .join('\n')
}

export const CSV_HEADER = 'Date,Candidate,Exam,Score,Passing,Result,Elapsed,Correct,Total,Incorrect,Incomplete,Marked'

export function historyToCsv(records: HistoryRecord[]): string {
  const rows = [CSV_HEADER]
  for (const r of records) {
    rows.push(
      [
        formatDateTime(r.examDatetime),
        r.candidateName,
        `${r.examTitle} ${r.examName}`.trim(),
        r.candidateScore,
        r.passingScore,
        r.passed ? 'PASS' : 'FAIL',
        r.elapsedSec,
        r.correct,
        r.total,
        r.incorrect,
        r.incomplete,
        r.marked
      ]
        .map(csvEscape)
        .join(',')
    )
  }
  return rows.join('\n')
}

export function historyToXml(records: HistoryRecord[]): string {
  const lines = ['<?xml version="1.0" encoding="UTF-8"?>', '<scoreHistory>']
  for (const r of records) {
    lines.push('  <record>')
    lines.push(`    <id>${xmlEscape(r.id)}</id>`)
    lines.push(`    <date>${xmlEscape(formatDateTime(r.examDatetime))}</date>`)
    lines.push(`    <timestamp>${r.examDatetime}</timestamp>`)
    lines.push(`    <candidate>${xmlEscape(r.candidateName)}</candidate>`)
    lines.push(`    <examTitle>${xmlEscape(r.examTitle)}</examTitle>`)
    lines.push(`    <examName>${xmlEscape(r.examName)}</examName>`)
    lines.push(`    <score>${r.candidateScore}</score>`)
    lines.push(`    <passingScore>${r.passingScore}</passingScore>`)
    lines.push(`    <passed>${r.passed ? 'true' : 'false'}</passed>`)
    lines.push(`    <elapsedSec>${r.elapsedSec}</elapsedSec>`)
    lines.push(`    <correct>${r.correct}</correct>`)
    lines.push(`    <total>${r.total}</total>`)
    lines.push(`    <incorrect>${r.incorrect}</incorrect>`)
    lines.push(`    <incomplete>${r.incomplete}</incomplete>`)
    lines.push(`    <marked>${r.marked}</marked>`)
    for (const section of r.sections) {
      lines.push(
        `    <section name="${xmlEscape(section.name)}" correct="${section.correct}" total="${section.total}" />`
      )
    }
    lines.push('  </record>')
  }
  lines.push('</scoreHistory>')
  return lines.join('\n')
}

export function reportToText(record: HistoryRecord): string {
  const percentage = record.total ? Math.round((record.correct / record.total) * 100) : 0
  const lines: string[] = []
  lines.push('SCORE REPORT')
  lines.push('='.repeat(40))
  lines.push(`Exam:        ${record.examTitle} — ${record.examName}`)
  lines.push(`Candidate:   ${record.candidateName}`)
  lines.push(`Date:        ${formatDateTime(record.examDatetime)}`)
  lines.push(`Elapsed:     ${formatDuration(record.elapsedSec)}`)
  lines.push(`Result:      ${record.passed ? 'PASS' : 'FAIL'}`)
  lines.push(`Score:       ${record.candidateScore} / 1000 (passing: ${record.passingScore})`)
  lines.push(`Correct:     ${record.correct} of ${record.total} (${percentage}%)`)
  lines.push(`Incorrect:   ${record.incorrect}`)
  lines.push(`Incomplete:  ${record.incomplete}`)
  lines.push(`Marked:      ${record.marked}`)
  if (record.sections.length) {
    lines.push('')
    lines.push('Sections:')
    for (const section of record.sections) {
      lines.push(`  ${section.name}: ${section.correct}/${section.total}`)
    }
  }
  return lines.join('\n')
}

/** Printable HTML version of the score report (used for print / save as PDF). */
export function reportToHtml(record: HistoryRecord): string {
  const percentage = record.total ? Math.round((record.correct / record.total) * 100) : 0
  const sections = record.sections.length
    ? '<h2>Section scores</h2><table><thead><tr><th>Section</th><th>Correct</th><th>Total</th><th>Score</th></tr></thead><tbody>' +
      record.sections
        .map(
          (s) =>
            `<tr><td>${xmlEscape(s.name)}</td><td>${s.correct}</td><td>${s.total}</td><td>${
              s.total ? Math.round((s.correct / s.total) * 100) : 0
            }%</td></tr>`
        )
        .join('') +
      '</tbody></table>'
    : ''
  return (
    `<h1>Score Report</h1>` +
    `<p><b>${record.passed ? 'PASS' : 'FAIL'}</b> — ${record.candidateScore} / 1000 (passing ${record.passingScore})</p>` +
    `<h2>Exam information</h2>` +
    `<table><tbody>` +
    `<tr><th>Exam</th><td>${xmlEscape(record.examTitle)} — ${xmlEscape(record.examName)}</td></tr>` +
    `<tr><th>Candidate</th><td>${xmlEscape(record.candidateName) || '(none)'}</td></tr>` +
    `<tr><th>Date</th><td>${xmlEscape(formatDateTime(record.examDatetime))}</td></tr>` +
    `<tr><th>Elapsed</th><td>${xmlEscape(formatDuration(record.elapsedSec))}</td></tr>` +
    `<tr><th>Correct</th><td>${record.correct} of ${record.total} (${percentage}%)</td></tr>` +
    `<tr><th>Incorrect</th><td>${record.incorrect}</td></tr>` +
    `<tr><th>Incomplete</th><td>${record.incomplete}</td></tr>` +
    `<tr><th>Marked</th><td>${record.marked}</td></tr>` +
    `</tbody></table>` +
    sections
  )
}
