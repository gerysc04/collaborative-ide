import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '../styles/Home.css'

export default function Home() {
  const [username, setUsername] = useState('')
  const [sessionId, setSessionId] = useState('')
  const navigate = useNavigate()

  const createSession = async () => {
    if (!username) return
    const res = await fetch(`http://localhost:8000/sessions?username=${username}&session_name=My Session`, {
      method: 'POST'
    })
    const data = await res.json()
    navigate(`/session/${data.session_id}`, { state: { username } })
  }

  const joinSession = () => {
    if (!username || !sessionId) return
    navigate(`/session/${sessionId}`, { state: { username } })
  }

  return (
    <div className="home">
      <p className="home__logo">Collide</p>
      <div className="home__card">
        <h1 className="home__title">Start coding<br />together.</h1>
        <p className="home__subtitle">// real-time collaborative IDE</p>
        <input
          className="home__input"
          placeholder="your username"
          value={username}
          onChange={e => setUsername(e.target.value)}
        />
        <button className="home__btn home__btn--primary" onClick={createSession}>
          Create Session
        </button>
        <div className="home__divider">or join existing</div>
        <input
          className="home__input"
          placeholder="session id"
          value={sessionId}
          onChange={e => setSessionId(e.target.value)}
        />
        <button className="home__btn home__btn--secondary" onClick={joinSession}>
          Join Session
        </button>
      </div>
    </div>
  )
}