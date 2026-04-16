interface Props {
  tabs: string[]
  activeFile: string | null
  onSelect: (path: string) => void
  onClose: (path: string) => void
}

function filename(path: string) {
  return path.split('/').pop() ?? path
}

export default function EditorTabs({ tabs, activeFile, onSelect, onClose }: Props) {

  if (tabs.length === 0) return null

  return (
    <div style={{
      display: 'flex',
      overflowX: 'auto',
      borderBottom: '1px solid var(--bg-border)',
      background: 'var(--bg)',
      flexShrink: 0,
      scrollbarWidth: 'none',
    }}>
      {tabs.map(path => {
        const active = path === activeFile
        return (
          <div
            key={path}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '0 12px',
              height: '34px',
              cursor: 'pointer',
              flexShrink: 0,
              borderRight: '1px solid var(--bg-border)',
              background: active ? 'var(--bg-elevated)' : 'transparent',
              borderTop: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
              color: active ? 'var(--text)' : 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
            }}
            onClick={() => onSelect(path)}
          >
            <span>{filename(path)}</span>
            <span
              style={{
                opacity: 0.4,
                fontSize: '1rem',
                lineHeight: 1,
                padding: '0 2px',
              }}
              onClick={e => { e.stopPropagation(); onClose(path) }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.opacity = '1'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.opacity = '0.4'}
            >
              ×
            </span>
          </div>
        )
      })}
    </div>
  )
}
