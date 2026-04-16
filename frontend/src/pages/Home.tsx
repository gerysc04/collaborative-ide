import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config'
import '../styles/Home.css'

interface Repo {
  name: string
  full_name: string
  private: boolean
  clone_url: string
}

export default function Home() {
  const navigate = useNavigate()
  const [githubToken] = useState<string | null>(() => sessionStorage.getItem('github_token'))
  const [githubUser] = useState<string | null>(() => sessionStorage.getItem('username'))

  const [repos, setRepos] = useState<Repo[]>([])
  const [repoFilter, setRepoFilter] = useState('')
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null)
  const [loadingRepos, setLoadingRepos] = useState(false)

  const [sessionId, setSessionId] = useState('')
  const [error, setError] = useState('')
  const [creating, setCreating] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!githubToken) return
    setLoadingRepos(true)
    fetch(`${API_URL}/github/repos`, {
      headers: { Authorization: `Bearer ${githubToken}` },
    })
      .then(r => r.json())
      .then(data => setRepos(Array.isArray(data) ? data : []))
      .catch(() => setError('Failed to load repositories'))
      .finally(() => setLoadingRepos(false))
  }, [githubToken])

  const filteredRepos = repos.filter(r =>
    r.full_name.toLowerCase().includes(repoFilter.toLowerCase())
  )

  const createSession = async () => {
    if (!selectedRepo || !githubToken || !githubUser) return
    setCreating(true)
    setError('')
    try {
      const res = await fetch(`${API_URL}/sessions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          github_username: githubUser,
          github_token: githubToken,
          repo_url: selectedRepo.clone_url,
          repo_full_name: selectedRepo.full_name,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail ?? 'Failed to create session')
        return
      }
      navigate(`/session/${data.session_id}`, {
        state: { username: githubUser, repo_full_name: selectedRepo.full_name },
      })
    } catch {
      setError('Could not connect to server')
    } finally {
      setCreating(false)
    }
  }

  const joinSession = async () => {
    if (!sessionId || !githubToken || !githubUser) return
    setJoining(true)
    setError('')
    try {
      const sessionRes = await fetch(`${API_URL}/sessions/${sessionId}`)
      const sessionData = await sessionRes.json()
      if (sessionData.error) {
        setError('Session not found')
        return
      }

      if (sessionData.repo_url) {
        const parts = sessionData.repo_url.replace('.git', '').split('/')
        const owner = parts[parts.length - 2]
        const repo = parts[parts.length - 1]
        const accessRes = await fetch(
          `${API_URL}/github/repos/access?owner=${owner}&repo=${repo}`,
          { headers: { Authorization: `Bearer ${githubToken}` } }
        )
        if (!accessRes.ok) {
          setError("You don't have access to this repository")
          return
        }
      }

      const repoFullName = sessionData.repo_url
        ? sessionData.repo_url.replace('.git', '').split('/').slice(-2).join('/')
        : ''

      navigate(`/session/${sessionId}`, {
        state: { username: githubUser, repo_full_name: repoFullName },
      })
    } catch {
      setError('Could not connect to server')
    } finally {
      setJoining(false)
    }
  }

  if (!githubToken) {
    return (
      <div className="home">
        <p className="home__logo">Collide</p>
        <div className="home__card">
          <h1 className="home__title">Start coding<br />together.</h1>
          <p className="home__subtitle">// real-time collaborative IDE</p>
          <button
            className="home__btn home__btn--github"
            onClick={() => { window.location.href = `${API_URL}/auth/github` }}
          >
            Sign in with GitHub
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="home">
      <p className="home__logo">Collide</p>
      <div className="home__card">
        <h1 className="home__title">Start coding<br />together.</h1>
        <p className="home__subtitle">
          // signed in as <span style={{ color: 'var(--accent)' }}>{githubUser}</span>
        </p>

        {error && (
          <p style={{ color: '#ff4d4d', fontSize: '0.8rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>
            {error}
          </p>
        )}

        <input
          className="home__input"
          placeholder="search repositories..."
          value={repoFilter}
          onChange={e => { setRepoFilter(e.target.value); setSelectedRepo(null); setError('') }}
        />

        <div className="home__repo-list">
          {loadingRepos ? (
            <div className="home__repo-empty">loading repos...</div>
          ) : filteredRepos.length === 0 ? (
            <div className="home__repo-empty">no repositories found</div>
          ) : (
            filteredRepos.map(repo => (
              <div
                key={repo.full_name}
                className={`home__repo-item${selectedRepo?.full_name === repo.full_name ? ' home__repo-item--selected' : ''}`}
                onClick={() => { setSelectedRepo(repo); setError('') }}
              >
                <span className="home__repo-name">{repo.full_name}</span>
                {repo.private && <span className="home__repo-badge">private</span>}
              </div>
            ))
          )}
        </div>

        <button
          className="home__btn home__btn--primary"
          onClick={createSession}
          disabled={!selectedRepo || creating}
        >
          {creating ? 'Cloning & starting...' : 'Create Session'}
        </button>

        <div className="home__divider">or join existing</div>

        <input
          className="home__input"
          placeholder="session code"
          value={sessionId}
          onChange={e => { setSessionId(e.target.value); setError('') }}
        />
        <button
          className="home__btn home__btn--secondary"
          onClick={joinSession}
          disabled={joining}
        >
          {joining ? 'Checking access...' : 'Join Session'}
        </button>
      </div>
    </div>
  )
}
