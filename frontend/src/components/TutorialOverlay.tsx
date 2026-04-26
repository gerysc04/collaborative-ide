import { useState, useEffect, useLayoutEffect, useCallback } from 'react'

const STORAGE_KEY = (username: string) => `collide_tutorial_seen_${username}`

const STEPS = [
  {
    target: 'file-tree',
    title: 'File tree',
    desc: 'Browse and manage your project files. Click any file to open it in the editor. Use the + buttons to create files or folders.',
    position: 'right' as const,
  },
  {
    target: 'editor',
    title: 'Collaborative editor',
    desc: 'Every keystroke syncs in real time across all connected users via CRDT — no conflicts, no lock files. Just type.',
    position: 'bottom' as const,
  },
  {
    target: 'terminal',
    title: 'Full terminal',
    desc: 'A real shell running inside the container. Install packages, start servers, run scripts — exactly like your local machine. Open multiple tabs for parallel work.\n\nTo copy output: select any text with the mouse — it copies to your clipboard automatically.',
    position: 'top' as const,
  },
  {
    target: 'btn-ports',
    title: 'Port forwarding',
    desc: 'Expose any port from the container and get a shareable URL. Run a web server, then forward its port so teammates can open it in their browser.\n\nIf your session has a database, connect to it from the terminal using the clients that are already installed:\n• MongoDB → mongosh mongodb://db:27017/<db-name>\n• Postgres → psql -h db -U <user> -d <db-name>\n• Redis → redis-cli -h db',
    position: 'bottom' as const,
  },
  {
    target: 'btn-run',
    title: 'Run configurations',
    desc: 'Save named run commands (e.g. "Start server", "Run tests") that anyone in the session can trigger with one click — no need to remember the exact command.',
    position: 'bottom' as const,
  },
  {
    target: 'btn-git',
    title: 'Git panel',
    desc: 'Stage, commit, and push changes without leaving the IDE. Each git branch can have its own container so you can work on multiple branches in parallel.',
    position: 'bottom' as const,
  },
  {
    target: 'btn-ai',
    title: 'AI agent',
    desc: 'Type @tag in the shared chat to invoke an AI assistant. It can read files, write code, and run commands directly in your session. Configure providers (OpenAI, Anthropic, Gemini) via this panel.',
    position: 'bottom' as const,
  },
  {
    target: 'btn-chat',
    title: 'Shared chat',
    desc: 'Real-time chat shared across everyone in the session. Use it to coordinate, share links, or invoke the AI agent with @tag.',
    position: 'left' as const,
  },
]

interface Rect { top: number; left: number; width: number; height: number }

const PAD = 6

function getRect(target: string): Rect | null {
  const el = document.querySelector(`[data-tutorial="${target}"]`)
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { top: r.top - PAD, left: r.left - PAD, width: r.width + PAD * 2, height: r.height + PAD * 2 }
}

function tooltipStyle(rect: Rect, position: 'top' | 'bottom' | 'left' | 'right'): React.CSSProperties {
  const GAP = 14
  const TIP_W = 300
  switch (position) {
    case 'bottom': return {
      top: rect.top + rect.height + GAP,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - TIP_W / 2, window.innerWidth - TIP_W - 8)),
      width: TIP_W,
    }
    case 'top': return {
      bottom: window.innerHeight - rect.top + GAP,
      left: Math.max(8, Math.min(rect.left + rect.width / 2 - TIP_W / 2, window.innerWidth - TIP_W - 8)),
      width: TIP_W,
    }
    case 'right': return {
      top: Math.max(8, rect.top + rect.height / 2 - 80),
      left: rect.left + rect.width + GAP,
      width: TIP_W,
    }
    case 'left': return {
      top: Math.max(8, rect.top + rect.height / 2 - 80),
      right: window.innerWidth - rect.left + GAP,
      width: TIP_W,
    }
  }
}

interface Props {
  username: string
  forceOpen?: boolean
  onClose: () => void
}

export default function TutorialOverlay({ username, forceOpen, onClose }: Props) {
  const [step, setStep] = useState(0)
  const [rect, setRect] = useState<Rect | null>(null)
  const [visible, setVisible] = useState(false)

  const shouldShow = forceOpen || !localStorage.getItem(STORAGE_KEY(username))

  useEffect(() => {
    if (shouldShow) setVisible(true)
  }, [shouldShow])

  useEffect(() => {
    if (forceOpen) {
      setStep(0)
      setVisible(true)
    }
  }, [forceOpen])

  useLayoutEffect(() => {
    if (!visible) return
    const update = () => setRect(getRect(STEPS[step].target))
    update()
    window.addEventListener('resize', update)
    return () => window.removeEventListener('resize', update)
  }, [step, visible])

  const dismiss = useCallback(() => {
    localStorage.setItem(STORAGE_KEY(username), '1')
    setVisible(false)
    onClose()
  }, [username, onClose])

  const next = useCallback(() => {
    if (step < STEPS.length - 1) {
      setStep(s => s + 1)
    } else {
      dismiss()
    }
  }, [step, dismiss])

  const prev = useCallback(() => {
    if (step > 0) setStep(s => s - 1)
  }, [step])

  if (!visible || !rect) return null

  const current = STEPS[step]

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      {/* Dark overlay with spotlight hole using box-shadow */}
      <div style={{
        position: 'absolute', inset: 0, pointerEvents: 'all',
        background: 'transparent',
        boxShadow: `0 0 0 9999px rgba(0,0,0,0.7)`,
        clipPath: `polygon(
          0% 0%, 100% 0%, 100% 100%, 0% 100%, 0% 0%,
          ${rect.left}px ${rect.top}px,
          ${rect.left}px ${rect.top + rect.height}px,
          ${rect.left + rect.width}px ${rect.top + rect.height}px,
          ${rect.left + rect.width}px ${rect.top}px,
          ${rect.left}px ${rect.top}px
        )`,
      }} onClick={dismiss} />

      {/* Spotlight border */}
      <div style={{
        position: 'absolute',
        top: rect.top, left: rect.left,
        width: rect.width, height: rect.height,
        border: '1.5px solid var(--accent)',
        boxShadow: '0 0 0 1px var(--accent), 0 0 16px rgba(0,255,148,0.2)',
        pointerEvents: 'none',
      }} />

      {/* Tooltip card */}
      <div style={{
        position: 'fixed',
        ...tooltipStyle(rect, current.position),
        background: 'var(--bg-elevated)',
        border: '1px solid var(--bg-border)',
        padding: '1rem 1.25rem',
        fontFamily: 'var(--font-ui)',
        pointerEvents: 'all',
        boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.72rem', fontFamily: 'var(--font-mono)', color: 'var(--accent)', letterSpacing: '0.1em' }}>
            {step + 1} / {STEPS.length}
          </span>
          <button onClick={dismiss} style={{
            background: 'none', border: 'none', color: 'var(--text-muted)',
            cursor: 'pointer', fontSize: '0.85rem', padding: 0, lineHeight: 1,
          }}>skip</button>
        </div>
        <h3 style={{ fontSize: '0.95rem', fontWeight: 700, marginBottom: '0.4rem', color: 'var(--text)' }}>
          {current.title}
        </h3>
        <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6, marginBottom: '1rem', whiteSpace: 'pre-line' }}>
          {current.desc}
        </p>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={prev} disabled={step === 0} style={{
            background: 'none', border: '1px solid var(--bg-border)', color: 'var(--text-muted)',
            cursor: step === 0 ? 'default' : 'pointer', padding: '0.35rem 0.75rem',
            fontSize: '0.78rem', fontFamily: 'var(--font-mono)', opacity: step === 0 ? 0.3 : 1,
          }}>← prev</button>
          <button onClick={next} style={{
            background: 'var(--accent)', border: 'none', color: '#000',
            cursor: 'pointer', padding: '0.35rem 0.9rem',
            fontSize: '0.78rem', fontFamily: 'var(--font-mono)', fontWeight: 600,
          }}>
            {step === STEPS.length - 1 ? 'done' : 'next →'}
          </button>
        </div>
      </div>
    </div>
  )
}
