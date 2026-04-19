import { useState, useEffect } from 'react'
import { API_URL } from '../config'

interface ProviderEntry {
  tag: string
  provider: string
  display_name: string
  key_masked: string
}

interface Props {
  sessionId: string | undefined
  onClose: () => void
}

const PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic (Claude)' },
  { value: 'openai', label: 'OpenAI (GPT)' },
  { value: 'gemini', label: 'Google (Gemini)' },
]

export default function ProvidersPanel({ sessionId, onClose }: Props) {
  const [providers, setProviders] = useState<ProviderEntry[]>([])
  const [tag, setTag] = useState('')
  const [provider, setProvider] = useState('anthropic')
  const [displayName, setDisplayName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!sessionId) return
    fetch(`${API_URL}/sessions/${sessionId}/ai/providers`)
      .then(r => r.json())
      .then(setProviders)
      .catch(() => {})
  }, [sessionId])

  const addProvider = async () => {
    if (!tag.trim() || !displayName.trim() || !apiKey.trim()) {
      setError('All fields are required')
      return
    }
    setLoading(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/ai/providers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tag: tag.trim().toLowerCase(),
          provider,
          display_name: displayName.trim(),
          api_key: apiKey.trim(),
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail ?? 'Failed to add provider')
      } else {
        setProviders(prev => [...prev, { ...data, key_masked: 'sk-...●●●●●●●●' }])
        setTag('')
        setDisplayName('')
        setApiKey('')
      }
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  const removeProvider = async (providerTag: string) => {
    await fetch(`${API_URL}/sessions/${sessionId}/ai/providers/${providerTag}`, { method: 'DELETE' })
    setProviders(prev => prev.filter(p => p.tag !== providerTag))
  }

  return (
    <div className="ports-panel">
      <div className="ports-panel__header">
        <span className="ports-panel__title">AI Providers</span>
        <button className="ports-panel__close" onClick={onClose}>✕</button>
      </div>

      <div className="ports-panel__body">
        {providers.length === 0 && (
          <p className="ports-panel__empty">
            No AI providers configured. Add one below and use <code>@tag</code> in chat to invoke it.
          </p>
        )}
        {providers.map(p => (
          <div key={p.tag} className="ports-panel__entry">
            <div className="ports-panel__entry-info">
              <span className="ports-panel__entry-label">@{p.tag}</span>
              <span className="ports-panel__entry-port" style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                {p.display_name} · {p.provider}
              </span>
            </div>
            <div className="ports-panel__entry-actions">
              <span style={{ color: 'var(--text-muted)', fontSize: '0.68rem', fontFamily: 'var(--font-mono)' }}>
                {p.key_masked}
              </span>
              <button
                className="ports-panel__action ports-panel__action--remove"
                onClick={() => removeProvider(p.tag)}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="ports-panel__footer" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            className="ports-panel__input"
            placeholder="Tag (e.g. claude)"
            value={tag}
            onChange={e => setTag(e.target.value.replace(/[^a-z0-9]/gi, '').toLowerCase())}
            style={{ flex: 1 }}
          />
          <select
            value={provider}
            onChange={e => setProvider(e.target.value)}
            style={{
              background: 'var(--bg-elevated)',
              border: '1px solid var(--bg-border)',
              borderRadius: '4px',
              color: 'var(--text)',
              fontFamily: 'var(--font-ui)',
              fontSize: '0.78rem',
              padding: '4px 6px',
              flex: 1,
            }}
          >
            {PROVIDER_OPTIONS.map(o => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
        <input
          className="ports-panel__input"
          placeholder="Display name (e.g. My Claude Key)"
          value={displayName}
          onChange={e => setDisplayName(e.target.value)}
        />
        <input
          className="ports-panel__input"
          placeholder="API key"
          type="password"
          value={apiKey}
          onChange={e => setApiKey(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && addProvider()}
        />
        <button
          className="ports-panel__btn-add"
          onClick={addProvider}
          disabled={loading}
          style={{ width: '100%' }}
        >
          {loading ? 'Adding...' : 'Add Provider'}
        </button>
      </div>

      {error && <p className="ports-panel__error">{error}</p>}
    </div>
  )
}
