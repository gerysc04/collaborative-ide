import { useState, useEffect, useRef, useCallback } from 'react'
import { API_URL, API_WS_URL } from '../config'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[] | null
}

interface Props {
  sessionId: string | undefined
  onFileSelect: (path: string) => void
  selectedFile?: string
}

function TreeNode({
  node, depth, onFileSelect, selectedFile, expanded, onToggle
}: {
  node: FileNode
  depth: number
  onFileSelect: (path: string) => void
  selectedFile?: string
  expanded: Set<string>
  onToggle: (path: string) => void
}) {
  const isDir = node.type === 'directory'
  const isExpanded = expanded.has(node.path)
  const isSelected = selectedFile === node.path

  return (
    <div>
      <div
        style={{
          paddingLeft: `${depth * 14 + 10}px`,
          paddingRight: '8px',
          paddingTop: '3px',
          paddingBottom: '3px',
          cursor: 'pointer',
          color: isSelected ? 'var(--accent)' : isDir ? 'var(--text)' : '#aaa',
          background: isSelected ? 'var(--accent-dim)' : 'transparent',
          userSelect: 'none',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          fontSize: '0.78rem',
          fontFamily: 'var(--font-mono)',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
        onClick={() => isDir ? onToggle(node.path) : onFileSelect(node.path)}
        onMouseEnter={e => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.background = '#161616'
        }}
        onMouseLeave={e => {
          if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
      >
        <span style={{ opacity: 0.5, fontSize: '0.65rem', flexShrink: 0 }}>
          {isDir ? (isExpanded ? '▾' : '▸') : '·'}
        </span>
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
      </div>
      {isDir && isExpanded && node.children?.map(child => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          onFileSelect={onFileSelect}
          selectedFile={selectedFile}
          expanded={expanded}
          onToggle={onToggle}
        />
      ))}
    </div>
  )
}

export default function FileTree({ sessionId, onFileSelect, selectedFile }: Props) {
  const [tree, setTree] = useState<FileNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/app']))
  const wsRef = useRef<WebSocket | null>(null)
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const fetchTree = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/files`)
      const data = await res.json()
      if (!data.error) setTree(data)
    } catch (e) {
      console.error('FileTree fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [sessionId])

  useEffect(() => {
    fetchTree()
  }, [fetchTree])

  // WebSocket file watcher — re-fetch tree on any fs event
  useEffect(() => {
    if (!sessionId) return

    let retryTimeout: ReturnType<typeof setTimeout>

    const connect = () => {
      const ws = new WebSocket(`${API_WS_URL}/ws/files/${sessionId}`)
      wsRef.current = ws

      ws.onmessage = () => {
        if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
        fetchDebounceRef.current = setTimeout(fetchTree, 300)
      }

      ws.onclose = () => {
        retryTimeout = setTimeout(connect, 3000)
      }

      ws.onerror = () => ws.close()
    }

    const initialDelay = setTimeout(connect, 500)

    return () => {
      clearTimeout(initialDelay)
      clearTimeout(retryTimeout)
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
      wsRef.current?.close()
    }
  }, [sessionId, fetchTree])

  const toggleDir = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  return (
    <div style={{
      height: '100%',
      overflowY: 'auto',
      borderRight: '1px solid var(--bg-border)',
      display: 'flex',
      flexDirection: 'column',
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
        Files
      </div>

      <div style={{ flex: 1, overflowY: 'auto', paddingTop: '4px' }}>
        {loading ? (
          <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
            loading...
          </div>
        ) : !tree || !tree.children?.length ? (
          <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
            empty
          </div>
        ) : (
          tree.children.map(node => (
            <TreeNode
              key={node.path}
              node={node}
              depth={0}
              onFileSelect={onFileSelect}
              selectedFile={selectedFile}
              expanded={expanded}
              onToggle={toggleDir}
            />
          ))
        )}
      </div>
    </div>
  )
}
