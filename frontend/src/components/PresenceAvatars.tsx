import type { OnlineUser } from '../hooks/useCollaboration'

function userColor(username: string): string {
  let hash = 0
  for (const c of username) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 70%, 65%)`
}

interface Props {
  users: OnlineUser[]
}

export default function PresenceAvatars({ users }: Props) {
  if (users.length === 0) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
      {users.map(u => (
        <div
          key={u.username}
          title={`${u.username} · ${u.branch}`}
          style={{
            width: 22,
            height: 22,
            borderRadius: '50%',
            background: userColor(u.username),
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.6rem',
            fontWeight: 700,
            color: '#fff',
            fontFamily: 'var(--font-ui)',
            cursor: 'default',
            flexShrink: 0,
            letterSpacing: 0,
          }}
        >
          {u.username.slice(0, 2).toUpperCase()}
        </div>
      ))}
    </div>
  )
}
