import { useState, useEffect } from 'react'
import { API_URL, proxyUrl } from '../config'

interface PortEntry {
  label: string
  container_port: number
}

interface Props {
  sessionId: string | undefined
  onClose: () => void
}

export default function PortsPanel({ sessionId, onClose }: Props) {
  const [ports, setPorts] = useState<PortEntry[]>([])
  const [label, setLabel] = useState('')
  const [portNum, setPortNum] = useState('')
  const [error, setError] = useState('')
  const [copied, setCopied] = useState<number | null>(null)

  useEffect(() => {
    if (!sessionId) return
    fetch(`${API_URL}/sessions/${sessionId}/ports`)
      .then(r => r.json())
      .then(setPorts)
      .catch(() => {})
  }, [sessionId])

  const portUrl = (port: number) => proxyUrl(sessionId!, port)

  const addPort = async () => {
    if (!label.trim() || !portNum.trim()) return
    const num = parseInt(portNum, 10)
    if (isNaN(num) || num < 1 || num > 65535) {
      setError('Invalid port number')
      return
    }
    const res = await fetch(`${API_URL}/sessions/${sessionId}/ports`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label: label.trim(), container_port: num }),
    })
    if (res.ok) {
      setPorts(prev => [...prev, { label: label.trim(), container_port: num }])
      setLabel('')
      setPortNum('')
      setError('')
    } else {
      const data = await res.json()
      setError(data.detail ?? 'Failed to add port')
    }
  }

  const removePort = async (port: number) => {
    await fetch(`${API_URL}/sessions/${sessionId}/ports/${port}`, { method: 'DELETE' })
    setPorts(prev => prev.filter(p => p.container_port !== port))
  }

  const copyUrl = (port: number) => {
    navigator.clipboard.writeText(portUrl(port))
    setCopied(port)
    setTimeout(() => setCopied(null), 1500)
  }

  return (
    <div className="ports-panel">
      <div className="ports-panel__header">
        <span className="ports-panel__title">Port Forwarding</span>
        <button className="ports-panel__close" onClick={onClose}>✕</button>
      </div>

      <div className="ports-panel__body">
        {ports.length === 0 && (
          <p className="ports-panel__empty">No ports forwarded yet.</p>
        )}
        {ports.map(p => (
          <div key={p.container_port} className="ports-panel__entry">
            <div className="ports-panel__entry-info">
              <span className="ports-panel__entry-label">{p.label}</span>
              <span className="ports-panel__entry-port">:{p.container_port}</span>
            </div>
            <div className="ports-panel__entry-actions">
              <button className="ports-panel__action" onClick={() => copyUrl(p.container_port)}>
                {copied === p.container_port ? 'copied!' : 'copy url'}
              </button>
              <a
                className="ports-panel__action"
                href={portUrl(p.container_port)}
                target="_blank"
                rel="noopener noreferrer"
              >
                open ↗
              </a>
              <button
                className="ports-panel__action ports-panel__action--remove"
                onClick={() => removePort(p.container_port)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="ports-panel__footer">
        <input
          className="ports-panel__input"
          placeholder="Label (e.g. Frontend)"
          value={label}
          onChange={e => setLabel(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addPort()}
        />
        <input
          className="ports-panel__input ports-panel__input--port"
          placeholder="Port"
          value={portNum}
          onChange={e => setPortNum(e.target.value)}
          type="number"
          min={1}
          max={65535}
          onKeyDown={e => e.key === 'Enter' && addPort()}
        />
        <button className="ports-panel__btn-add" onClick={addPort}>Add</button>
      </div>

      {error && <p className="ports-panel__error">{error}</p>}
    </div>
  )
}
