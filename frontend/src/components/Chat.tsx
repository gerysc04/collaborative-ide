import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { COLLAB_WS_URL, API_WS_URL } from '../config'

interface Message {
  username: string
  text: string
  timestamp: number
  isAI?: boolean
}

interface Props {
  sessionId: string | undefined
  username: string
  currentBranch?: string
  isCollapsed?: boolean
  onToggle?: () => void
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Returns {tag, rest} if message starts with @word, else null
function parseAiTag(text: string): { tag: string; rest: string } | null {
  const match = text.match(/^@([a-zA-Z0-9]+)\s*(.*)$/s)
  if (!match) return null
  return { tag: match[1].toLowerCase(), rest: match[2].trim() }
}

export default function Chat({ sessionId, username, currentBranch, isCollapsed, onToggle }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [thinking, setThinking] = useState(false)
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

  const pushMessage = (msg: Message) => {
    ydocRef.current?.getArray<Message>('chat').push([msg])
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || !ydocRef.current) return
    setInput('')

    const parsed = parseAiTag(text)
    if (parsed) {
      // Push user message so everyone sees it
      pushMessage({ username, text, timestamp: Date.now() })
      await invokeAI(parsed.tag, parsed.rest || text)
    } else {
      pushMessage({ username, text, timestamp: Date.now() })
    }
  }

  const invokeAI = async (tag: string, message: string) => {
    if (!sessionId) return
    setThinking(true)

    const wsUrl = `${API_WS_URL}/ws/ai/${sessionId}`
    const ws = new WebSocket(wsUrl)

    let tokenBuffer = ''

    ws.onopen = () => {
      ws.send(JSON.stringify({ tag, message, branch: currentBranch ?? '' }))
    }

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data)
        if (data.type === 'token') {
          tokenBuffer += data.content
        } else if (data.type === 'error') {
          pushMessage({
            username: `@${tag}`,
            text: `Error: ${data.message}`,
            timestamp: Date.now(),
            isAI: true,
          })
          setThinking(false)
          ws.close()
        } else if (data.type === 'done') {
          if (tokenBuffer.trim()) {
            pushMessage({
              username: `@${tag}`,
              text: tokenBuffer,
              timestamp: Date.now(),
              isAI: true,
            })
          }
          setThinking(false)
          ws.close()
        }
        // tool_call / tool_result events are informational — ignored in chat display for now
      } catch {
        // ignore parse errors
      }
    }

    ws.onerror = () => {
      pushMessage({
        username: `@${tag}`,
        text: 'Connection error — check that the provider is configured.',
        timestamp: Date.now(),
        isAI: true,
      })
      setThinking(false)
    }

    ws.onclose = () => {
      setThinking(false)
    }
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
        <span>Chat</span>
        {thinking && (
          <span style={{ marginLeft: '0.5rem', color: '#f59e0b', fontSize: '0.65rem' }}>
            AI thinking...
          </span>
        )}
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
            no messages yet · type @tag to invoke an AI
          </div>
        ) : (
          messages.map((msg, i) => (
            <div key={i}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', marginBottom: '2px' }}>
                <span style={{
                  color: msg.isAI
                    ? '#f59e0b'
                    : msg.username === username
                    ? 'var(--accent)'
                    : '#a78bfa',
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
                color: msg.isAI ? '#fde68a' : 'var(--text)',
                fontFamily: msg.isAI ? 'var(--font-mono)' : 'var(--font-ui)',
                fontSize: '0.82rem',
                lineHeight: 1.45,
                wordBreak: 'break-word',
                whiteSpace: msg.isAI ? 'pre-wrap' : undefined,
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
          placeholder="message... · @tag to invoke AI"
          rows={2}
          disabled={thinking}
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
            opacity: thinking ? 0.6 : 1,
          }}
          onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onBlur={e => (e.currentTarget.style.borderColor = 'var(--bg-border)')}
        />
      </div>
    </div>
  )
}
