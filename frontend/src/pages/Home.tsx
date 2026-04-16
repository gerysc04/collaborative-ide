import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { API_URL } from '../config'
import '../styles/Home.css'

export default function Home() {
  const [username, setUsername] = useState('')
  const [sessionId, setSessionId] = useState('')
  const [error, setError] = useState('')
  const navigate = useNavigate()

  const createSession = async () => {
    if (!username) return setError('Please enter a username')
    try {
      const res = await fetch(`${API_URL}/sessions?username=${username}&session_name=My Session`, {
        method: 'POST'
      })
      const data = await res.json()
      sessionStorage.setItem('username', username)
      navigate(`/session/${data.session_id}`, { state: { username } })
    } catch {
      setError('Could not connect to server')
    }
  }

  const joinSession = async () => {
    if (!username) return setError('Please enter a username')
    if (!sessionId) return setError('Please enter a session ID')
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}`)
      const data = await res.json()
      if (data.error) return setError('Session not found')
      sessionStorage.setItem('username', username)
      navigate(`/session/${sessionId}`, { state: { username } })
    } catch {
      setError('Could not connect to server')
    }
  }

  return (
    <div className="home">
      <p className="home__logo">Collide</p>
      <div className="home__card">
        <h1 className="home__title">Start coding<br />together.</h1>
        <p className="home__subtitle">// real-time collaborative IDE</p>
        {error && <p style={{ color: '#ff4d4d', fontSize: '0.8rem', marginBottom: '1rem', fontFamily: 'var(--font-mono)' }}>{error}</p>}
        <input
          className="home__input"
          placeholder="your username"
          value={username}
          onChange={e => { setUsername(e.target.value); setError('') }}
        />
        <button className="home__btn home__btn--primary" onClick={createSession}>
          Create Session
        </button>
        <div className="home__divider">or join existing</div>
        <input
          className="home__input"
          placeholder="session id"
          value={sessionId}
          onChange={e => { setSessionId(e.target.value); setError('') }}
        />
        <button className="home__btn home__btn--secondary" onClick={joinSession}>
          Join Session
        </button>
      </div>
    </div>
  )
}