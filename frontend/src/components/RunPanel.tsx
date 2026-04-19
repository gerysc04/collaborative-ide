import { useState, useEffect } from 'react'
import { API_URL } from '../config'

interface RunConfig {
  id: string
  name: string
  command: string
}

interface Props {
  sessionId: string | undefined
  onClose: () => void
  onRun: (command: string) => void
}

export default function RunPanel({ sessionId, onClose, onRun }: Props) {
  const [configs, setConfigs] = useState<RunConfig[]>([])
  const [newName, setNewName] = useState('')
  const [newCommand, setNewCommand] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editName, setEditName] = useState('')
  const [editCommand, setEditCommand] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    if (!sessionId) return
    fetch(`${API_URL}/sessions/${sessionId}/run-configs`)
      .then(r => r.json())
      .then(setConfigs)
      .catch(() => {})
  }, [sessionId])

  const add = async () => {
    if (!newName.trim() || !newCommand.trim()) { setError('Name and command are required'); return }
    setError('')
    const res = await fetch(`${API_URL}/sessions/${sessionId}/run-configs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: newName.trim(), command: newCommand.trim() }),
    })
    const entry = await res.json()
    if (res.ok) {
      setConfigs(prev => [...prev, entry])
      setNewName('')
      setNewCommand('')
    } else {
      setError(entry.detail ?? 'Failed to add')
    }
  }

  const remove = async (id: string) => {
    await fetch(`${API_URL}/sessions/${sessionId}/run-configs/${id}`, { method: 'DELETE' })
    setConfigs(prev => prev.filter(c => c.id !== id))
  }

  const startEdit = (c: RunConfig) => {
    setEditingId(c.id)
    setEditName(c.name)
    setEditCommand(c.command)
  }

  const saveEdit = async (id: string) => {
    if (!editName.trim() || !editCommand.trim()) return
    const res = await fetch(`${API_URL}/sessions/${sessionId}/run-configs/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editName.trim(), command: editCommand.trim() }),
    })
    if (res.ok) {
      setConfigs(prev => prev.map(c => c.id === id ? { id, name: editName.trim(), command: editCommand.trim() } : c))
      setEditingId(null)
    }
  }

  const inputStyle: React.CSSProperties = {
    background: 'var(--bg-elevated)',
    border: '1px solid var(--bg-border)',
    borderRadius: '4px',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.75rem',
    padding: '4px 7px',
    outline: 'none',
    width: '100%',
    boxSizing: 'border-box',
  }

  return (
    <div className="ports-panel">
      <div className="ports-panel__header">
        <span className="ports-panel__title">Run Configurations</span>
        <button className="ports-panel__close" onClick={onClose}>✕</button>
      </div>

      <div className="ports-panel__body">
        {configs.length === 0 && (
          <p className="ports-panel__empty">No run configurations yet. Add one below.</p>
        )}
        {configs.map(c => (
          <div key={c.id} style={{ marginBottom: '0.6rem' }}>
            {editingId === c.id ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <input style={inputStyle} value={editName} onChange={e => setEditName(e.target.value)} placeholder="Name" />
                <input style={inputStyle} value={editCommand} onChange={e => setEditCommand(e.target.value)} placeholder="Command"
                  onKeyDown={e => { if (e.key === 'Enter') saveEdit(c.id); if (e.key === 'Escape') setEditingId(null) }} />
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button className="ports-panel__btn-add" style={{ flex: 1, fontSize: '0.72rem' }} onClick={() => saveEdit(c.id)}>Save</button>
                  <button className="ports-panel__action" onClick={() => setEditingId(null)}>Cancel</button>
                </div>
              </div>
            ) : (
              <div className="ports-panel__entry">
                <div className="ports-panel__entry-info">
                  <span className="ports-panel__entry-label">{c.name}</span>
                  <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.68rem' }}>
                    {c.command}
                  </span>
                </div>
                <div className="ports-panel__entry-actions">
                  <button
                    className="ports-panel__action"
                    style={{ color: '#00ff94', fontWeight: 600 }}
                    onClick={() => { onRun(c.command); onClose() }}
                    title="Run in new terminal tab"
                  >
                    ▶
                  </button>
                  <button className="ports-panel__action" onClick={() => startEdit(c)} title="Edit">✎</button>
                  <button className="ports-panel__action ports-panel__action--remove" onClick={() => remove(c.id)}>✕</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="ports-panel__footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
        <input style={inputStyle} placeholder="Name (e.g. Start dev server)" value={newName} onChange={e => setNewName(e.target.value)} />
        <input style={inputStyle} placeholder="Command (e.g. npm run dev)" value={newCommand} onChange={e => setNewCommand(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && add()} />
        <button className="ports-panel__btn-add" onClick={add} style={{ width: '100%' }}>Add Configuration</button>
      </div>

      {error && <p className="ports-panel__error">{error}</p>}
    </div>
  )
}
