import { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { API_URL, API_WS_URL } from '../config'

// ─── Single terminal pane ──────────────────────────────────────────────────────

interface PaneProps {
  sessionId: string
  currentBranch: string
  active: boolean
  sharedName?: string
  autoRun?: string
}

function TerminalPane({ sessionId, currentBranch, active, sharedName, autoRun }: PaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!containerRef.current) return

    const term = new Terminal({
      theme: {
        background: '#111111',
        foreground: '#e8e8e8',
        cursor: '#00ff94',
        selectionBackground: 'rgba(0, 255, 148, 0.2)',
      },
      fontFamily: 'JetBrains Mono, monospace',
      fontSize: 13,
      cursorBlink: true,
    })

    const fitAddon = new FitAddon()
    fitAddonRef.current = fitAddon
    term.loadAddon(fitAddon)
    term.open(containerRef.current)
    fitAddon.fit()

    const handleMouseUp = () => {
      const sel = term.getSelection()
      if (!sel) return
      const doCopy = () => { setCopied(true); setTimeout(() => setCopied(false), 1500) }
      if (navigator.clipboard) {
        navigator.clipboard.writeText(sel).then(doCopy).catch(() => {})
      } else {
        const ta = document.createElement('textarea')
        ta.value = sel
        ta.style.cssText = 'position:fixed;opacity:0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        doCopy()
      }
    }
    term.element?.addEventListener('mouseup', handleMouseUp)

    const wsUrl = sharedName
      ? `${API_WS_URL}/ws/terminal/${sessionId}/shared/${encodeURIComponent(sharedName)}?branch=${encodeURIComponent(currentBranch)}`
      : `${API_WS_URL}/ws/terminal/${sessionId}?branch=${encodeURIComponent(currentBranch)}`

    const ws = new WebSocket(wsUrl)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => {
      if (!sharedName) term.write('\r\n\x1b[32mConnected\x1b[0m\r\n')
      if (autoRun) {
        // Small delay so bash finishes initialising before we send
        setTimeout(() => {
          if (ws.readyState === WebSocket.OPEN) ws.send(autoRun + '\n')
        }, 400)
      }
    }
    ws.onmessage = (e) => term.write(new Uint8Array(e.data))
    ws.onerror = () => term.write('\r\n\x1b[31mConnection error\x1b[0m\r\n')
    ws.onclose = () => term.write('\r\n\x1b[31mDisconnected\x1b[0m\r\n')

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(data)
    })

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      ws.close()
      term.dispose()
    }
  }, [sessionId, currentBranch, sharedName, autoRun])

  useEffect(() => {
    if (active) setTimeout(() => fitAddonRef.current?.fit(), 0)
  }, [active])

  return (
    <div style={{ height: '100%', width: '100%', position: 'relative', display: active ? 'block' : 'none' }}>
      <div
        ref={containerRef}
        style={{
          height: '100%',
          width: '100%',
          padding: '0.25rem',
          boxSizing: 'border-box',
          background: '#111111',
        }}
      />
      {copied && (
        <div style={{
          position: 'absolute', bottom: '0.5rem', right: '0.75rem',
          background: 'var(--bg-elevated)', border: '1px solid var(--accent)',
          color: 'var(--accent)', fontFamily: 'var(--font-mono)',
          fontSize: '0.7rem', padding: '0.25rem 0.6rem', pointerEvents: 'none',
        }}>
          copied
        </div>
      )}
    </div>
  )
}

// ─── Tab bar + multi-terminal manager ─────────────────────────────────────────

interface Tab {
  id: number
  sharedName?: string
  autoRun?: string
}

interface Props {
  sessionId: string | undefined
  currentBranch: string
  pendingRun?: { command: string; ts: number } | null
}

export default function TerminalPanel({ sessionId, currentBranch, pendingRun }: Props) {
  const nextId = useRef(2)
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1 }])
  const [activeId, setActiveId] = useState(1)
  const knownSharedRef = useRef<Set<string>>(new Set())

  // Open a new tab and auto-run the command when pendingRun changes
  useEffect(() => {
    if (!pendingRun) return
    const id = nextId.current++
    setTabs(prev => [...prev, { id, autoRun: pendingRun.command }])
    setActiveId(id)
  }, [pendingRun])

  // Poll for shared terminals created by other users
  useEffect(() => {
    if (!sessionId) return
    const poll = async () => {
      try {
        const res = await fetch(`${API_URL}/sessions/${sessionId}/terminals/shared`)
        const data = await res.json()
        const names: string[] = data.terminals ?? []
        const newNames = names.filter(n => !knownSharedRef.current.has(n))
        if (newNames.length > 0) {
          setTabs(prev => {
            const next = [...prev]
            for (const name of newNames) {
              if (!knownSharedRef.current.has(name)) {
                knownSharedRef.current.add(name)
                const id = nextId.current++
                next.push({ id, sharedName: name })
              }
            }
            return next
          })
        }
      } catch {
        // ignore poll errors
      }
    }
    const interval = setInterval(poll, 5000)
    return () => clearInterval(interval)
  }, [sessionId])

  const addTab = () => {
    const id = nextId.current++
    setTabs(prev => [...prev, { id }])
    setActiveId(id)
  }

  const shareTerminal = () => {
    const name = `shared-${Date.now()}`
    knownSharedRef.current.add(name)
    const id = nextId.current++
    setTabs(prev => [...prev, { id, sharedName: name }])
    setActiveId(id)
  }

  const closeTab = (id: number) => {
    setTabs(prev => {
      if (prev.length === 1) return prev
      const next = prev.filter(t => t.id !== id)
      if (activeId === id) setActiveId(next[next.length - 1].id)
      return next
    })
  }

  if (!sessionId) return null

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Tab bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        borderBottom: '1px solid #1a1a1a',
        background: '#0d0d0d',
        flexShrink: 0,
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {tabs.map((tab, i) => {
          const active = tab.id === activeId
          const label = tab.sharedName
            ? `🔗 ${tab.sharedName.replace('shared-', 'shared ')}`
            : `bash ${i + 1}`
          return (
            <div
              key={tab.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '0 10px',
                height: '30px',
                cursor: 'pointer',
                flexShrink: 0,
                borderRight: '1px solid #1a1a1a',
                borderTop: `2px solid ${active ? (tab.sharedName ? '#00e5ff' : '#00ff94') : 'transparent'}`,
                background: active ? '#111111' : 'transparent',
                color: active ? (tab.sharedName ? '#00e5ff' : '#e8e8e8') : '#555',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.72rem',
              }}
              onClick={() => setActiveId(tab.id)}
            >
              <span>{label}</span>
              {tabs.length > 1 && (
                <span
                  style={{ opacity: 0.4, fontSize: '1rem', lineHeight: 1, padding: '0 1px' }}
                  onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.4'}
                >
                  ×
                </span>
              )}
            </div>
          )
        })}

        <button
          onClick={addTab}
          title="New private terminal"
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '1.1rem', padding: '0 10px', height: '30px', lineHeight: 1, flexShrink: 0 }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#00ff94'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#555'}
        >
          +
        </button>

        <button
          onClick={shareTerminal}
          title="New shared terminal (visible to all users)"
          style={{ background: 'none', border: 'none', color: '#555', cursor: 'pointer', fontSize: '0.75rem', padding: '0 8px', height: '30px', lineHeight: 1, flexShrink: 0, fontFamily: 'JetBrains Mono, monospace' }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#00e5ff'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#555'}
        >
          🔗
        </button>
      </div>

      {/* Terminal panes — all mounted, only active one is visible */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tabs.map(tab => (
          <TerminalPane
            key={tab.id}
            sessionId={sessionId}
            currentBranch={currentBranch}
            active={tab.id === activeId}
            sharedName={tab.sharedName}
            autoRun={tab.autoRun}
          />
        ))}
      </div>
    </div>
  )
}
