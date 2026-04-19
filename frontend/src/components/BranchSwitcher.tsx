import { useState, useEffect, useRef } from 'react'
import { WebsocketProvider } from 'y-websocket'
import { API_URL } from '../config'

interface Props {
  sessionId: string | undefined
  currentBranch: string
  username: string
  githubToken: string
  providerRef: React.RefObject<WebsocketProvider | null>
  onBranchChange: (branch: string) => void
}

type Mode = 'idle' | 'commit-prompt'

export default function BranchSwitcher({ sessionId, currentBranch, username, githubToken, providerRef, onBranchChange }: Props) {
  const [open, setOpen] = useState(false)
  const [branches, setBranches] = useState<string[]>([])
  const [containerizedBranches, setContainerizedBranches] = useState<string[]>([])
  const [newBranchName, setNewBranchName] = useState('')
  const [creating, setCreating] = useState(false)
  const [switching, setSwitching] = useState(false)
  const [mode, setMode] = useState<Mode>('idle')
  const [commitMessage, setCommitMessage] = useState('')
  const [commitError, setCommitError] = useState('')
  const pendingBranchRef = useRef<string>('')
  const dropdownRef = useRef<HTMLDivElement>(null)
  const newBranchInputRef = useRef<HTMLInputElement>(null)
  const commitInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open || !sessionId) return
    fetch(`${API_URL}/sessions/${sessionId}/branches`)
      .then(r => r.json())
      .then(data => {
        setBranches(data.branches || [])
        setContainerizedBranches(data.containers || [])
      })
      .catch(() => {})
  }, [open, sessionId])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
        setMode('idle')
        setCommitMessage('')
        setCommitError('')
        setNewBranchName('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  useEffect(() => {
    if (open && mode === 'idle') setTimeout(() => newBranchInputRef.current?.focus(), 50)
    if (mode === 'commit-prompt') setTimeout(() => commitInputRef.current?.focus(), 50)
  }, [open, mode])

  const isLastOnBranch = (): boolean => {
    const awareness = providerRef.current?.awareness
    if (!awareness) return true
    const states = Array.from(awareness.getStates().values()) as any[]
    return !states.some(s => s.branch === currentBranch && s.username !== username)
  }

  const attemptSwitch = async (branch: string) => {
    if (!sessionId || branch === currentBranch) { setOpen(false); return }

    const last = isLastOnBranch()
    if (last) {
      // Check for uncommitted changes
      try {
        const res = await fetch(`${API_URL}/sessions/${sessionId}/git/status?branch=${encodeURIComponent(currentBranch)}`)
        const data = await res.json()
        if (data.has_changes) {
          pendingBranchRef.current = branch
          setMode('commit-prompt')
          return
        }
      } catch {
        // If status check fails, proceed anyway
      }
    }

    await doSwitch(branch)
  }

  const doSwitch = async (branch: string) => {
    if (!sessionId) return
    setSwitching(true)
    try {
      if (!containerizedBranches.includes(branch)) {
        const res = await fetch(`${API_URL}/sessions/${sessionId}/branches`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ branch_name: branch, is_new: false, github_token: githubToken }),
        })
        if (!res.ok) {
          const data = await res.json()
          setCommitError(data.detail || 'Failed to create container for branch')
          setSwitching(false)
          return
        }
        setContainerizedBranches(prev => [...prev, branch])
      }
      onBranchChange(branch)
      setOpen(false)
      setMode('idle')
      setCommitMessage('')
      setCommitError('')
    } catch {
      setCommitError('Failed to switch branch')
    } finally {
      setSwitching(false)
    }
  }

  const commitAndSwitch = async () => {
    if (!sessionId || !commitMessage.trim()) return
    setSwitching(true)
    setCommitError('')
    try {
      const res = await fetch(
        `${API_URL}/sessions/${sessionId}/git/commit?branch=${encodeURIComponent(currentBranch)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ message: commitMessage.trim() }),
        }
      )
      if (!res.ok) {
        const data = await res.json()
        setCommitError(data.detail || 'Commit failed')
        setSwitching(false)
        return
      }
      await doSwitch(pendingBranchRef.current)
    } catch {
      setCommitError('Commit failed')
      setSwitching(false)
    }
  }

  const createBranch = async () => {
    const name = newBranchName.trim()
    if (!name || !sessionId) return
    setCreating(true)
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/branches`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branch_name: name, is_new: true, github_token: githubToken }),
      })
      if (!res.ok) {
        const data = await res.json()
        setCommitError(data.detail || 'Failed to create branch')
        return
      }
      setContainerizedBranches(prev => [...prev, name])
      setBranches(prev => prev.includes(name) ? prev : [...prev, name])
      setNewBranchName('')
      onBranchChange(name)
      setOpen(false)
      setMode('idle')
    } catch {
      setCommitError('Failed to create branch')
    } finally {
      setCreating(false)
    }
  }

  const inputStyle: React.CSSProperties = {
    flex: 1,
    background: '#1a1a1a',
    border: '1px solid #2a2a2a',
    borderRadius: '3px',
    color: 'var(--text)',
    fontFamily: 'var(--font-mono)',
    fontSize: '0.72rem',
    padding: '4px 6px',
    outline: 'none',
  }

  return (
    <div style={{ position: 'relative' }} ref={dropdownRef}>
      <button
        style={{
          background: 'none',
          border: '1px solid #2a2a2a',
          borderRadius: '4px',
          color: 'var(--text-muted)',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.72rem',
          padding: '2px 8px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
        onClick={() => { setOpen(o => !o); setMode('idle'); setCommitError('') }}
        title="Switch branch"
      >
        <span style={{ opacity: 0.5 }}>⎇</span>
        <span>{currentBranch}</span>
      </button>

      {open && (
        <div style={{
          position: 'absolute',
          top: '110%',
          left: 0,
          zIndex: 100,
          background: '#141414',
          border: '1px solid #2a2a2a',
          borderRadius: '6px',
          minWidth: '240px',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflow: 'hidden',
        }}>

          {mode === 'commit-prompt' ? (
            // ── Commit dialog ──────────────────────────────────────
            <div style={{ padding: '12px' }}>
              <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                You're the last user on <span style={{ color: 'var(--accent)' }}>{currentBranch}</span>.
                Commit your changes before switching?
              </p>
              <input
                ref={commitInputRef}
                value={commitMessage}
                onChange={e => setCommitMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') commitAndSwitch(); if (e.key === 'Escape') setMode('idle') }}
                placeholder="commit message..."
                style={{ ...inputStyle, width: '100%', boxSizing: 'border-box', marginBottom: '8px' }}
              />
              {commitError && (
                <p style={{ margin: '0 0 6px', fontFamily: 'var(--font-mono)', fontSize: '0.7rem', color: '#ff4d4d' }}>
                  {commitError}
                </p>
              )}
              <div style={{ display: 'flex', gap: '6px' }}>
                <button
                  onClick={commitAndSwitch}
                  disabled={!commitMessage.trim() || switching}
                  style={{
                    flex: 1,
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: '3px',
                    color: '#000',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    padding: '5px',
                    opacity: (!commitMessage.trim() || switching) ? 0.4 : 1,
                  }}
                >
                  {switching ? 'committing...' : 'Commit & Switch'}
                </button>
                <button
                  onClick={() => doSwitch(pendingBranchRef.current)}
                  disabled={switching}
                  style={{
                    flex: 1,
                    background: 'none',
                    border: '1px solid #2a2a2a',
                    borderRadius: '3px',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontFamily: 'var(--font-mono)',
                    fontSize: '0.72rem',
                    padding: '5px',
                  }}
                >
                  Switch anyway
                </button>
              </div>
            </div>
          ) : (
            // ── Branch list ────────────────────────────────────────
            <>
              <div style={{ maxHeight: '200px', overflowY: 'auto' }}>
                {branches.length === 0 && (
                  <div style={{ padding: '8px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
                    loading...
                  </div>
                )}
                {branches.map(branch => {
                  const isActive = branch === currentBranch
                  const hasContainer = containerizedBranches.includes(branch)
                  return (
                    <div
                      key={branch}
                      onClick={() => attemptSwitch(branch)}
                      style={{
                        padding: '6px 12px',
                        cursor: isActive ? 'default' : 'pointer',
                        fontFamily: 'var(--font-mono)',
                        fontSize: '0.75rem',
                        color: isActive ? 'var(--accent)' : 'var(--text)',
                        background: isActive ? 'var(--accent-dim)' : 'transparent',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = '#1e1e1e' }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      {isActive && <span style={{ fontSize: '0.6rem' }}>✓</span>}
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{branch}</span>
                      {hasContainer && !isActive && (
                        <span style={{ opacity: 0.4, fontSize: '0.65rem' }}>container</span>
                      )}
                    </div>
                  )
                })}
              </div>

              {commitError && (
                <div style={{ padding: '6px 12px', color: '#ff4d4d', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', borderTop: '1px solid #2a2a2a' }}>
                  {commitError}
                </div>
              )}

              <div style={{ borderTop: '1px solid #2a2a2a', padding: '8px' }}>
                <div style={{ display: 'flex', gap: '4px' }}>
                  <input
                    ref={newBranchInputRef}
                    value={newBranchName}
                    onChange={e => setNewBranchName(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') createBranch(); if (e.key === 'Escape') setOpen(false) }}
                    placeholder="new branch name..."
                    style={inputStyle}
                  />
                  <button
                    onClick={createBranch}
                    disabled={!newBranchName.trim() || creating || switching}
                    style={{
                      background: 'var(--accent)',
                      border: 'none',
                      borderRadius: '3px',
                      color: '#000',
                      cursor: 'pointer',
                      fontFamily: 'var(--font-mono)',
                      fontSize: '0.72rem',
                      padding: '4px 8px',
                      opacity: (!newBranchName.trim() || creating || switching) ? 0.4 : 1,
                    }}
                  >
                    {creating ? '...' : '+ create'}
                  </button>
                </div>
              </div>

              {switching && (
                <div style={{ padding: '6px 12px', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem', borderTop: '1px solid #2a2a2a' }}>
                  switching branch...
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}
