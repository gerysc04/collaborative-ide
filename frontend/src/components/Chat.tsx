import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { COLLAB_WS_URL } from '../config'

interface Message {
  username: string
  text: string
  timestamp: number
}

interface Props {
  sessionId: string | undefined
  username: string
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

export default function Chat({ sessionId, username }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const ydocRef = useRef<Y.Doc | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!sessionId) return

    const ydoc = new Y.Doc()
    ydocRef.current = ydoc
    new WebsocketProvider(COLLAB_WS_URL, sessionId, ydoc)

    const chatArray = ydoc.getArray<Message>('chat')
    const observer = () => setMessages(chatArray.toArray())
    chatArray.observe(observer)
    setMessages(chatArray.toArray())

    return () => {
      chatArray.unobserve(observer)
      ydoc.destroy()
    }
  }, [sessionId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendMessage = () => {
    const text = input.trim()
    if (!text || !ydocRef.current) return
    ydocRef.current.getArray<Message>('chat').push([{
      username,
      text,
      timestamp: Date.now(),
    }])
    setInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      borderLeft: '1px solid var(--bg-border)',
    }}>
      <div style={{
        padding: '0.5rem 0.75rem 0.4rem',
        fontSize: '0.68rem',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontFamily: 'var(--font-ui)',
        borderBottom: '1px solid var(--bg-border)',
        flexShrink: 0,
      }}>
        Chat
      </div>

      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.85rem',
      }}>
        {messages.length === 0 ? (
          <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem' }}>
            no messages yet
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '2px' }}>
                <span style={{
                  color: msg.username === username ? 'var(--accent)' : '#a78bfa',
                  fontFamily: 'var(--font-mono)',
                  fontSize: '0.72rem',
                  fontWeight: 500,
                }}>
                  {msg.username}
                </span>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>
                  {formatTime(msg.timestamp)}
                </span>
              </div>
              <div style={{
                color: 'var(--text)',
                fontFamily: 'var(--font-ui)',
                fontSize: '0.82rem',
                lineHeight: 1.45,
                wordBreak: 'break-word',
              }}>
                {msg.text}
              </div>
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <div style={{
        padding: '0.6rem 0.75rem',
        borderTop: '1px solid var(--bg-border)',
        flexShrink: 0,
      }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="message... (Enter to send)"
          rows={2}
          style={{
            width: '100%',
            background: 'var(--bg-elevated)',
            border: '1px solid var(--bg-border)',
            borderRadius: '4px',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.78rem',
            padding: '6px 8px',
            resize: 'none',
            outline: 'none',
            boxSizing: 'border-box',
            lineHeight: 1.4,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--bg-border)')}
        />
      </div>
    </div>
  )
}
