import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'

interface Props {
  sessionId: string | undefined
}

export default function TerminalPanel({ sessionId }: Props) {
  const terminalRef = useRef<HTMLDivElement>(null)
  const xtermRef = useRef<Terminal | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!terminalRef.current || !sessionId) return

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
    term.loadAddon(fitAddon)
    term.open(terminalRef.current)
    fitAddon.fit()
    xtermRef.current = term

    const ws = new WebSocket(`ws://localhost:8000/ws/terminal/${sessionId}`)
    ws.binaryType = 'arraybuffer'
    wsRef.current = ws

    ws.onopen = () => {
      term.write('\r\n\x1b[32mConnected to container\x1b[0m\r\n')
    }

    ws.onmessage = (event) => {
      const data = new Uint8Array(event.data)
      term.write(data)
    }

    ws.onerror = () => {
      term.write('\r\n\x1b[31mConnection error\x1b[0m\r\n')
    }

    ws.onclose = () => {
      term.write('\r\n\x1b[31mDisconnected\x1b[0m\r\n')
    }

    term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(data)
      }
    })

    const handleResize = () => fitAddon.fit()
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      ws.close()
      term.dispose()
    }
  }, [sessionId])

  return (
    <div
      ref={terminalRef}
      style={{ height: '100%', width: '100%', padding: '0.5rem', boxSizing: 'border-box', background: '#111111' }}
    />
  )
}