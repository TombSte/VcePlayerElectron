import { useState } from 'react'
import { HistoryRecord, SavedSession } from '@shared/types'
import { formatDateTime, formatDuration } from '../state/exam-utils'
import { historyToCsv, historyToTxt, historyToXml } from '../state/export'

export default function HistoryView({
  records,
  sessions,
  disableClear,
  onClose,
  onResume,
  onRetake
}: {
  records: HistoryRecord[]
  sessions: SavedSession[]
  disableClear: boolean
  onClose: () => void
  onResume: (session: SavedSession) => void
  onRetake: (record: HistoryRecord) => void
}): JSX.Element {
  const [tab, setTab] = useState<'history' | 'sessions'>('history')
  const [selected, setSelected] = useState<string | null>(records[0]?.id ?? null)
  const selectedRecord = records.find((r) => r.id === selected)

  const exportHistory = async (format: 'txt' | 'csv' | 'xml'): Promise<void> => {
    const content =
      format === 'csv' ? historyToCsv(records) : format === 'xml' ? historyToXml(records) : historyToTxt(records)
    await window.api.saveTextFile(content, `score-history.${format}`)
  }

  return (
    <div className="content">
      <div className="tabs">
        <button className={tab === 'history' ? 'active' : ''} onClick={() => setTab('history')}>
          History
        </button>
        <button className={tab === 'sessions' ? 'active' : ''} onClick={() => setTab('sessions')}>
          Saved Sessions ({sessions.length})
        </button>
      </div>

      {tab === 'history' ? (
        records.length === 0 ? (
          <div className="empty">No score history yet.</div>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>Date</th>
                <th>Candidate</th>
                <th>Exam</th>
                <th>Score</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr
                  key={record.id}
                  className={record.id === selected ? 'selected' : ''}
                  onClick={() => setSelected(record.id)}
                >
                  <td>{formatDateTime(record.examDatetime)}</td>
                  <td>{record.candidateName || '(none)'}</td>
                  <td>
                    {record.examTitle} — {record.examName}
                  </td>
                  <td>
                    {record.candidateScore} / 1000
                  </td>
                  <td>
                    <span className={`badge ${record.passed ? 'ok' : 'bad'}`}>
                      {record.passed ? 'PASS' : 'FAIL'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : sessions.length === 0 ? (
        <div className="empty">No saved sessions.</div>
      ) : (
        <table className="list">
          <thead>
            <tr>
              <th>Saved</th>
              <th>Exam</th>
              <th>Candidate</th>
              <th>Progress</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {sessions.map((session) => {
              const answered = session.states.filter((s) => s.complete).length
              return (
                <tr key={session.id}>
                  <td>{formatDateTime(session.updatedAt)}</td>
                  <td>
                    {session.examTitle} — {session.examName}
                  </td>
                  <td>{session.candidateName || '(none)'}</td>
                  <td>
                    {answered}/{session.states.length}
                    {session.remainingSec !== null ? ` · ${formatDuration(session.remainingSec)} left` : ''}
                  </td>
                  <td>
                    <button className="btn" onClick={() => onResume(session)}>
                      Resume
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      )}

      {tab === 'history' && selectedRecord && (
        <div className="card" style={{ marginTop: 16 }}>
          <h3 style={{ marginTop: 0 }}>Selected record</h3>
          <div>
            <strong>Elapsed:</strong> {formatDuration(selectedRecord.elapsedSec)} · <strong>Correct:</strong>{' '}
            {selectedRecord.correct}/{selectedRecord.total} · <strong>Incorrect:</strong>{' '}
            {selectedRecord.incorrect} · <strong>Marked:</strong> {selectedRecord.marked}
          </div>
          <div style={{ marginTop: 10 }}>
            <button className="btn primary" onClick={() => onRetake(selectedRecord)}>
              Retake (incorrect / marked)
            </button>
          </div>
        </div>
      )}

      <div className="toolbar" style={{ background: 'transparent', border: 'none', padding: 0, marginTop: 16 }}>
        <button className="btn" disabled={!records.length} onClick={() => exportHistory('txt')}>
          Export TXT
        </button>
        <button className="btn" disabled={!records.length} onClick={() => exportHistory('csv')}>
          Export CSV
        </button>
        <button className="btn" disabled={!records.length} onClick={() => exportHistory('xml')}>
          Export XML
        </button>
        <button
          className="btn danger"
          disabled={disableClear || !records.length}
          onClick={() => window.api.clearHistory().then(() => onClose())}
        >
          Clear History
        </button>
        <button
          className="btn danger"
          disabled={!sessions.length}
          onClick={() => window.api.clearSessions().then(() => onClose())}
        >
          Clear Saved Sessions
        </button>
        <span className="spacer" />
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  )
}
