import { useEffect, useState } from 'react'
import { API_WS_URL } from '../config'

interface Stats {
  cpu_percent: number
  memory_mb: number
  memory_limit_mb: number
}

interface Props {
  sessionId: string | undefined
  currentBranch: string
}

export default function ResourceUsage({ sessionId, currentBranch }: Props) {
  const [stats, setStats] = useState<Stats | null>(null)

  useEffect(() => {
    if (!sessionId) return
    const ws = new WebSocket(
      `${API_WS_URL}/ws/stats/${sessionId}?branch=${encodeURIComponent(currentBranch)}`
    )
    ws.onmessage = e => {
      try { setStats(JSON.parse(e.data)) } catch {}
    }
    ws.onerror = () => ws.close()
    return () => ws.close()
  }, [sessionId, currentBranch])

  if (!stats) return null

  const cpuColor = stats.cpu_percent > 80 ? '#f87171' : stats.cpu_percent > 50 ? '#fbbf24' : 'var(--text-muted)'
  const memPct = stats.memory_limit_mb > 0 ? stats.memory_mb / stats.memory_limit_mb : 0
  const memColor = memPct > 0.8 ? '#f87171' : memPct > 0.5 ? '#fbbf24' : 'var(--text-muted)'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '0.6rem',
      fontFamily: 'var(--font-mono)',
      fontSize: '0.68rem',
      color: 'var(--text-muted)',
    }}>
      <span style={{ color: cpuColor }}>CPU {stats.cpu_percent}%</span>
      <span style={{ color: 'var(--text-muted)', opacity: 0.3 }}>·</span>
      <span style={{ color: memColor }}>MEM {stats.memory_mb}MB</span>
    </div>
  )
}
