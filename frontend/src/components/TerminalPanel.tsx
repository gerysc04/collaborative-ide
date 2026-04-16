import React, { useEffect, useRef, useState } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { API_WS_URL } from '../config'

// ─── Single terminal pane ──────────────────────────────────────────────────────

interface PaneProps {
  sessionId: string
  active: boolean
}

function TerminalPane({ sessionId, active }: PaneProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const fitAddonRef = useRef<FitAddon | null>(null)

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

    const ws = new WebSocket(`${API_WS_URL}/ws/terminal/${sessionId}`)
    ws.binaryType = 'arraybuffer'

    ws.onopen = () => term.write('\r\n\x1b[32mConnected\x1b[0m\r\n')
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
  }, [sessionId])

  // Re-fit when this pane becomes visible
  useEffect(() => {
    if (active) setTimeout(() => fitAddonRef.current?.fit(), 0)
  }, [active])

  return (
    <div
      ref={containerRef}
      style={{
        height: '100%',
        width: '100%',
        padding: '0.25rem',
        boxSizing: 'border-box',
        background: '#111111',
        display: active ? 'block' : 'none',
      }}
    />
  )
}

// ─── Tab bar + multi-terminal manager ─────────────────────────────────────────

interface Tab { id: number }

interface Props {
  sessionId: string | undefined
}

export default function TerminalPanel({ sessionId }: Props) {
  const nextId = useRef(2)
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1 }])
  const [activeId, setActiveId] = useState(1)

  const addTab = () => {
    const id = nextId.current++
    setTabs(prev => [...prev, { id }])
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
        {tabs.map(tab => {
          const active = tab.id === activeId
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
                borderTop: `2px solid ${active ? '#00ff94' : 'transparent'}`,
                background: active ? '#111111' : 'transparent',
                color: active ? '#e8e8e8' : '#555',
                fontFamily: 'JetBrains Mono, monospace',
                fontSize: '0.72rem',
              }}
              onClick={() => setActiveId(tab.id)}
            >
              <span>bash {tab.id}</span>
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
          title="New terminal"
          style={{
            background: 'none',
            border: 'none',
            color: '#555',
            cursor: 'pointer',
            fontSize: '1.1rem',
            padding: '0 10px',
            height: '30px',
            lineHeight: 1,
            flexShrink: 0,
          }}
          onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = '#00ff94'}
          onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = '#555'}
        >
          +
        </button>
      </div>

      {/* Terminal panes — all mounted, only active one is visible */}
      <div style={{ flex: 1, overflow: 'hidden', position: 'relative' }}>
        {tabs.map(tab => (
          <TerminalPane
            key={tab.id}
            sessionId={sessionId}
            active={tab.id === activeId}
          />
        ))}
      </div>
    </div>
  )
}
