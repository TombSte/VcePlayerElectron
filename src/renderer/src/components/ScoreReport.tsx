import { HistoryRecord } from '@shared/types'
import { formatDateTime, formatDuration, printHtml } from '../state/exam-utils'
import { reportToHtml, reportToText } from '../state/export'

export interface ScoreReportProps {
  record: HistoryRecord
  onReview?: () => void
  onRetake?: () => void
  onExit: () => void
  disablePrint?: boolean
}

export default function ScoreReport({
  record,
  onReview,
  onRetake,
  onExit,
  disablePrint
}: ScoreReportProps): JSX.Element {
  const percentage = record.total ? Math.round((record.correct / record.total) * 100) : 0

  const safeName = (extension: string): string =>
    `${record.examTitle || 'vce'}-score-report.${extension}`.replace(/[^\w.-]+/g, '_')

  const printReport = (): void => {
    printHtml('Score Report', reportToHtml(record))
  }

  const saveReport = async (): Promise<void> => {
    await window.api.saveTextFile(reportToText(record), safeName('txt'))
  }

  return (
    <div className="content">
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, flexWrap: 'wrap' }}>
          <div className={`report-score ${record.passed ? 'pass' : 'fail'}`}>
            {record.candidateScore}
            <span style={{ fontSize: '0.35em', color: 'var(--muted)' }}> / 1000</span>
          </div>
          <div>
            <h2 style={{ margin: 0 }}>{record.passed ? 'PASS' : 'FAIL'}</h2>
            <div className="hint">Passing score: {record.passingScore}</div>
            <div style={{ marginTop: 6 }}>
              <span className="badge ok">{record.correct} correct</span>{' '}
              <span className="badge bad">{record.incorrect} incorrect</span>{' '}
              <span className="badge warn">{record.incomplete} incomplete</span>{' '}
              <span className="badge">{percentage}%</span>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>Exam information</h3>
        <div className="grid2">
          <div>
            <div>
              <strong>Exam:</strong> {record.examTitle} — {record.examName}
            </div>
            <div>
              <strong>Candidate:</strong> {record.candidateName || '(none)'}
            </div>
            <div>
              <strong>Date:</strong> {formatDateTime(record.examDatetime)}
            </div>
          </div>
          <div>
            <div>
              <strong>Questions:</strong> {record.total}
            </div>
            <div>
              <strong>Elapsed:</strong> {formatDuration(record.elapsedSec)}
            </div>
            <div>
              <strong>Marked:</strong> {record.marked}
            </div>
            {record.trainingMode && <div className="badge warn">Training mode</div>}
          </div>
        </div>
      </div>

      {record.sections.length > 0 && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Section scores</h3>
          <table className="list">
            <thead>
              <tr>
                <th>Section</th>
                <th>Correct</th>
                <th>Total</th>
                <th>Score</th>
              </tr>
            </thead>
            <tbody>
              {record.sections.map((section) => (
                <tr key={section.name}>
                  <td>{section.name}</td>
                  <td>{section.correct}</td>
                  <td>{section.total}</td>
                  <td>{section.total ? Math.round((section.correct / section.total) * 100) : 0}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="toolbar" style={{ background: 'transparent', border: 'none', padding: 0 }}>
        {onReview && (
          <button className="btn primary" onClick={onReview}>
            Review Answers
          </button>
        )}
        {onRetake && (
          <button className="btn" onClick={onRetake}>
            Retake
          </button>
        )}
        {!disablePrint && (
          <>
            <button className="btn" onClick={printReport}>
              Print / PDF
            </button>
            <button className="btn" onClick={() => void saveReport()}>
              Save Report (TXT)
            </button>
          </>
        )}
        <span className="spacer" />
        <button className="btn" onClick={onExit}>
          Exit
        </button>
      </div>
    </div>
  )
}
