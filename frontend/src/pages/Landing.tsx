import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config'
import '../styles/Landing.css'

const STEPS = [
  {
    num: '01',
    title: 'Open a session',
    desc: 'Sign in with GitHub and pick a repo — or try the demo instantly, no account needed.',
  },
  {
    num: '02',
    title: 'Share the URL',
    desc: 'Send the link to anyone. They join the same container: same terminal, same file tree, same editor.',
  },
  {
    num: '03',
    title: 'Build together',
    desc: 'Real-time collaborative editing, a full shell, port forwarding, and an AI agent — all in the browser.',
  },
]

const USE_CASES = [
  {
    title: 'Pair programming',
    desc: 'Stop screen-sharing and start actually coding together. Both of you type, run commands, and browse files in the same live environment — no "can you share your screen again" back-and-forth.',
  },
  {
    title: 'Technical interviews',
    desc: "Give candidates a real coding environment instead of a whiteboard. They get a full shell, their language of choice, and any dependencies they need — you see exactly what they build and how.",
  },
  {
    title: 'Team onboarding',
    desc: "New hire? Send them a session URL. They're in a running environment with your actual repo in minutes — no \"works on my machine\" setup docs, no waiting for IT.",
  },
]

const CHECKLIST = [
  'Full PTY terminal — multiple tabs, persistent across the session',
  'Monaco editor with real-time collaborative sync via Yjs CRDT',
  'Port forwarding — expose any port, shareable proxy URL',
  'AI agent — runs read/write/exec tools directly in your session',
  'Per-branch containers — each branch gets its own isolated environment',
  'Database sidecar — Postgres, MongoDB, or Redis with one click',
  'Container persistence — sessions snapshot and resume after inactivity',
  'GitHub integration — import any repo at session creation',
]

const FAQ = [
  {
    q: 'Is it free?',
    a: 'Yes, completely free while in early access. No credit card, no trial period.',
  },
  {
    q: 'What languages are supported?',
    a: 'The dev container ships with Node.js, Python, Go, and Rust pre-installed, plus common database clients. If you need something else, just install it from the terminal — it persists for the life of the session.',
  },
  {
    q: 'Is my code private?',
    a: "Each session runs in an isolated Docker container. Only people with your session URL can join. Your GitHub token is never stored — it's used once to clone your repo and then discarded.",
  },
  {
    q: 'Do collaborators need an account?',
    a: 'No. Anyone with the session URL can join and edit. Only the session creator needs to sign in with GitHub.',
  },
  {
    q: 'How long does a session last?',
    a: 'Sessions stay alive as long as someone is connected. After 10 minutes of inactivity the container is snapshotted and paused — rejoin at any time and it resumes in seconds.',
  },
]

function IDEMockup() {
  return (
    <div className="mockup">
      <div className="mockup__bar">
        <span className="mockup__dot mockup__dot--red" />
        <span className="mockup__dot mockup__dot--yellow" />
        <span className="mockup__dot mockup__dot--green" />
        <span className="mockup__bar-title">collide — pair-session</span>
      </div>
      <div className="mockup__body">
        <div className="mockup__tree">
          <span className="mockup__tree-item mockup__tree-item--dir">📁 src</span>
          <span className="mockup__tree-item mockup__tree-item--active">  index.js</span>
          <span className="mockup__tree-item">  api.js</span>
          <span className="mockup__tree-item mockup__tree-item--dir">📁 tests</span>
          <span className="mockup__tree-item">package.json</span>
          <span className="mockup__tree-item">.env</span>
        </div>
        <div className="mockup__right">
          <div className="mockup__editor">
            <div className="mockup__tabs">
              <span className="mockup__tab mockup__tab--active">index.js</span>
              <span className="mockup__tab">api.js</span>
            </div>
            <div className="mockup__code">
              <span className="mockup__line"><span className="mockup__lnum">1</span><span className="tok-keyword">const</span> express = <span className="tok-fn">require</span>(<span className="tok-str">'express'</span>)</span>
              <span className="mockup__line"><span className="mockup__lnum">2</span><span className="tok-keyword">const</span> app = <span className="tok-fn">express</span>()</span>
              <span className="mockup__line"><span className="mockup__lnum">3</span></span>
              <span className="mockup__line"><span className="mockup__lnum">4</span>app.<span className="tok-fn">get</span>(<span className="tok-str">'/'</span>, (req, res) =&gt; {'{'}</span>
              <span className="mockup__line mockup__line--cursor"><span className="mockup__lnum">5</span>  res.<span className="tok-fn">json</span>({'{'} status: <span className="tok-str">'ok'</span> {'}'})<span className="mockup__cursor" /></span>
              <span className="mockup__line"><span className="mockup__lnum">6</span>{'}'}</span>
              <span className="mockup__line"><span className="mockup__lnum">7</span></span>
              <span className="mockup__line"><span className="mockup__lnum">8</span>app.<span className="tok-fn">listen</span>(<span className="tok-num">3000</span>)</span>
            </div>
            <div className="mockup__cursors">
              <span className="mockup__remote-cursor">sarah</span>
            </div>
          </div>
          <div className="mockup__terminal">
            <div className="mockup__term-tabs">
              <span className="mockup__term-tab mockup__term-tab--active">terminal 1</span>
              <span className="mockup__term-tab">terminal 2</span>
            </div>
            <div className="mockup__term-body">
              <span className="mockup__term-line"><span className="mockup__prompt">~/app $</span> node index.js</span>
              <span className="mockup__term-line mockup__term-line--out">Server running on port 3000</span>
              <span className="mockup__term-line"><span className="mockup__prompt">~/app $</span> <span className="mockup__term-cursor" /></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function Landing() {
  const navigate = useNavigate()
  const [launching, setLaunching] = useState(false)
  const [error, setError] = useState('')
  const [openFaq, setOpenFaq] = useState<number | null>(null)

  async function handleTryIt() {
    setLaunching(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/sessions/guest`, { method: 'POST' })
      if (!res.ok) throw new Error('Failed to create demo session')
      const { session_id, username } = await res.json()
      navigate(`/session/${session_id}`, {
        state: { username, is_guest: true, repo_full_name: 'SpendData' },
      })
    } catch {
      setError('Could not start demo — please try again.')
      setLaunching(false)
    }
  }

  return (
    <div className="landing">
      <header className="landing__header">
        <span className="landing__logo">Collide</span>
        <a href="/app" className="landing__nav-link">Sign in</a>
      </header>

      <section className="landing__hero">
        <p className="landing__eyebrow">Cloud IDE · Real-time · No setup</p>
        <h1 className="landing__headline">
          Code together,<br />right now.
        </h1>
        <p className="landing__sub">
          Share a URL and get a live dev environment — real terminal, real file system,
          real code execution — inside an isolated container. No installs, no config.
        </p>
        <div className="landing__ctas">
          <button
            className="landing__btn landing__btn--primary"
            onClick={handleTryIt}
            disabled={launching}
          >
            {launching ? 'Launching demo…' : 'Try the demo →'}
          </button>
          <a href="/app" className="landing__btn landing__btn--secondary">
            Sign in with GitHub
          </a>
        </div>
        {error && <p className="landing__error">{error}</p>}
      </section>

      <section className="landing__mockup-section">
        <IDEMockup />
      </section>

      <section className="landing__how">
        <h2 className="landing__section-title">How it works</h2>
        <div className="landing__steps">
          {STEPS.map((s) => (
            <div key={s.num} className="landing__step">
              <span className="landing__step-num">{s.num}</span>
              <h3 className="landing__step-title">{s.title}</h3>
              <p className="landing__step-desc">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing__usecases">
        <h2 className="landing__section-title">Built for</h2>
        <div className="landing__usecase-grid">
          {USE_CASES.map((u) => (
            <div key={u.title} className="landing__usecase">
              <h3 className="landing__usecase-title">{u.title}</h3>
              <p className="landing__usecase-desc">{u.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing__checklist-section">
        <h2 className="landing__section-title">What's included</h2>
        <ul className="landing__checklist">
          {CHECKLIST.map((item) => (
            <li key={item} className="landing__checklist-item">
              <span className="landing__check">✓</span>
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="landing__faq">
        <h2 className="landing__section-title">FAQ</h2>
        <div className="landing__faq-list">
          {FAQ.map((item, i) => (
            <div key={i} className="landing__faq-item">
              <button
                className="landing__faq-q"
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
              >
                {item.q}
                <span className="landing__faq-icon">{openFaq === i ? '−' : '+'}</span>
              </button>
              {openFaq === i && <p className="landing__faq-a">{item.a}</p>}
            </div>
          ))}
        </div>
      </section>

      <section className="landing__bottom-cta">
        <h2 className="landing__bottom-cta-title">Ready to try it?</h2>
        <p className="landing__bottom-cta-sub">No account needed to explore the demo. Sign in with GitHub when you're ready to use your own repo.</p>
        <div className="landing__ctas">
          <button
            className="landing__btn landing__btn--primary"
            onClick={handleTryIt}
            disabled={launching}
          >
            {launching ? 'Launching demo…' : 'Try the demo →'}
          </button>
          <a href="/app" className="landing__btn landing__btn--secondary">
            Sign in with GitHub
          </a>
        </div>
        {error && <p className="landing__error">{error}</p>}
      </section>

      <footer className="landing__footer">
        <span className="landing__logo">Collide</span>
        <a
          href="https://github.com/gerysc04"
          target="_blank"
          rel="noreferrer"
          className="landing__footer-link"
        >
          GitHub
        </a>
      </footer>
    </div>
  )
}
