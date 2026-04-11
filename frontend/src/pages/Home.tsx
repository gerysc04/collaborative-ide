import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

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
    navigate(`/session/${data.session_id}`)
  }

  const joinSession = () => {
    if (!username || !sessionId) return
    navigate(`/session/${sessionId}`)
  }

  return (
    <div style={{ padding: '2rem', maxWidth: '400px', margin: '0 auto' }}>
      <h1>Collaborative IDE</h1>
      <input
        placeholder="Your username"
        value={username}
        onChange={e => setUsername(e.target.value)}
        style={{ display: 'block', width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
      />
      <button onClick={createSession} style={{ marginRight: '1rem' }}>
        Create Session
      </button>
      <hr style={{ margin: '1rem 0' }} />
      <input
        placeholder="Session ID to join"
        value={sessionId}
        onChange={e => setSessionId(e.target.value)}
        style={{ display: 'block', width: '100%', marginBottom: '1rem', padding: '0.5rem' }}
      />
      <button onClick={joinSession}>Join Session</button>
    </div>
  )
}