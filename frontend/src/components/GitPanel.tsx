import { useState, useEffect, useCallback } from 'react'
import { API_URL } from '../config'

interface GitFile {
  status: string
  path: string
}

interface Props {
  sessionId: string | undefined
  currentBranch: string
  onClose: () => void
}

const STATUS_COLOR: Record<string, string> = {
  M: '#fbbf24',
  A: '#00ff94',
  D: '#f87171',
  R: '#60a5fa',
  '??': '#00ff94',
}

function statusColor(s: string) {
  return STATUS_COLOR[s] ?? 'var(--text-muted)'
}

const inputStyle: React.CSSProperties = {
  background: 'var(--bg-elevated)',
  border: '1px solid var(--bg-border)',
  borderRadius: '4px',
  color: 'var(--text)',
  fontFamily: 'var(--font-mono)',
  fontSize: '0.75rem',
  padding: '5px 8px',
  outline: 'none',
  width: '100%',
  boxSizing: 'border-box',
  resize: 'vertical',
}

export default function GitPanel({ sessionId, currentBranch, onClose }: Props) {
  const [files, setFiles] = useState<GitFile[]>([])
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState('')
  const [status, setStatus] = useState<{ type: 'idle' | 'busy' | 'ok' | 'err'; text: string }>({ type: 'idle', text: '' })

  const refresh = useCallback(async () => {
    if (!sessionId) return
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/git/status?branch=${encodeURIComponent(currentBranch)}`)
      const data = await res.json()
      setFiles(data.files ?? [])
    } catch {
      setFiles([])
    } finally {
      setLoading(false)
    }
  }, [sessionId, currentBranch])

  useEffect(() => { refresh() }, [refresh])

  const commit = async (andPush: boolean) => {
    if (!message.trim() || !sessionId) return
    setStatus({ type: 'busy', text: andPush ? 'committing & pushing...' : 'committing...' })
    try {
      const commitRes = await fetch(
        `${API_URL}/sessions/${sessionId}/git/commit?branch=${encodeURIComponent(currentBranch)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: message.trim() }) }
      )
      if (!commitRes.ok) {
        const d = await commitRes.json()
        setStatus({ type: 'err', text: d.detail ?? 'Commit failed' })
        return
      }
      if (andPush) {
        const pushRes = await fetch(
          `${API_URL}/sessions/${sessionId}/git/push?branch=${encodeURIComponent(currentBranch)}`,
          { method: 'POST' }
        )
        if (!pushRes.ok) {
          const d = await pushRes.json()
          setStatus({ type: 'err', text: d.detail ?? 'Push failed' })
          return
        }
      }
      setMessage('')
      setStatus({ type: 'ok', text: andPush ? 'pushed!' : 'committed!' })
      await refresh()
      setTimeout(() => setStatus({ type: 'idle', text: '' }), 2500)
    } catch {
      setStatus({ type: 'err', text: 'Request failed' })
    }
  }

  const push = async () => {
    if (!sessionId) return
    setStatus({ type: 'busy', text: 'pushing...' })
    try {
      const res = await fetch(
        `${API_URL}/sessions/${sessionId}/git/push?branch=${encodeURIComponent(currentBranch)}`,
        { method: 'POST' }
      )
      if (!res.ok) {
        const d = await res.json()
        setStatus({ type: 'err', text: d.detail ?? 'Push failed' })
        return
      }
      setStatus({ type: 'ok', text: 'pushed!' })
      setTimeout(() => setStatus({ type: 'idle', text: '' }), 2500)
    } catch {
      setStatus({ type: 'err', text: 'Request failed' })
    }
  }

  const busy = status.type === 'busy'
  const hasChanges = files.length > 0

  return (
    <div className="ports-panel">
      <div className="ports-panel__header">
        <span className="ports-panel__title">Git — <span style={{ color: 'var(--accent)', opacity: 0.8 }}>{currentBranch}</span></span>
        <button className="ports-panel__close" onClick={onClose}>✕</button>
      </div>

      <div className="ports-panel__body" style={{ maxHeight: '220px', overflowY: 'auto' }}>
        {loading ? (
          <p className="ports-panel__empty">loading...</p>
        ) : hasChanges ? (
          files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '3px 0', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
              <span style={{ color: statusColor(f.status), minWidth: '18px', textAlign: 'center', fontWeight: 700 }}>
                {f.status === '??' ? 'U' : f.status}
              </span>
              <span style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.path}>
                {f.path.split('/').pop()}
              </span>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.66rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.path.includes('/') ? f.path.substring(0, f.path.lastIndexOf('/')) : ''}
              </span>
            </div>
          ))
        ) : (
          <p className="ports-panel__empty">Working tree clean.</p>
        )}
      </div>

      <div className="ports-panel__footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {hasChanges && (
          <>
            <textarea
              style={{ ...inputStyle, minHeight: '52px' }}
              placeholder="Commit message..."
              value={message}
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) commit(false) }}
              disabled={busy}
            />
            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                className="ports-panel__btn-add"
                style={{ flex: 1 }}
                disabled={!message.trim() || busy}
                onClick={() => commit(false)}
              >
                Commit
              </button>
              <button
                className="ports-panel__btn-add"
                style={{ flex: 1 }}
                disabled={!message.trim() || busy}
                onClick={() => commit(true)}
              >
                Commit & Push
              </button>
            </div>
          </>
        )}
        {!hasChanges && !loading && (
          <button className="ports-panel__btn-add" disabled={busy} onClick={push}>
            Push
          </button>
        )}
      </div>

      {status.text && (
        <p className="ports-panel__error" style={{ color: status.type === 'err' ? '#f87171' : status.type === 'ok' ? '#00ff94' : 'var(--text-muted)' }}>
          {status.text}
        </p>
      )}
    </div>
  )
}
