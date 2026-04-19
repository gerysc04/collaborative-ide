import { useState, useEffect, useRef, useCallback } from 'react'
import { API_URL } from '../config'

interface FileNode {
  name: string
  path: string
  type: 'file' | 'directory'
  children?: FileNode[] | null
}

interface Props {
  sessionId: string | undefined
  currentBranch: string
  onSelect: (path: string) => void
  onClose: () => void
}

function flattenTree(node: FileNode, results: string[] = []): string[] {
  if (node.type === 'file') results.push(node.path)
  for (const child of node.children ?? []) flattenTree(child, results)
  return results
}

function score(query: string, filePath: string): number {
  if (!query) return 1
  const q = query.toLowerCase()
  const p = filePath.toLowerCase()
  const filename = p.split('/').pop() ?? p

  if (filename === q) return 100
  if (filename.startsWith(q)) return 90
  if (filename.includes(q)) return 70
  if (p.includes(q)) return 50

  // Fuzzy: all query chars appear in order in the filename
  let qi = 0
  for (const c of filename) {
    if (c === q[qi]) qi++
    if (qi === q.length) return 30
  }
  // Fuzzy fallback on full path
  qi = 0
  for (const c of p) {
    if (c === q[qi]) qi++
    if (qi === q.length) return 10
  }
  return 0
}

export default function FilePalette({ sessionId, currentBranch, onSelect, onClose }: Props) {
  const [query, setQuery] = useState('')
  const [files, setFiles] = useState<string[]>([])
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    if (!sessionId) return
    fetch(`${API_URL}/sessions/${sessionId}/files?branch=${encodeURIComponent(currentBranch)}`)
      .then(r => r.json())
      .then(tree => {
        if (!tree.error) setFiles(flattenTree(tree))
      })
      .catch(() => {})
  }, [sessionId, currentBranch])

  const results = query
    ? files
        .map(f => ({ path: f, s: score(query, f) }))
        .filter(x => x.s > 0)
        .sort((a, b) => b.s - a.s)
        .slice(0, 12)
        .map(x => x.path)
    : files.slice(0, 12)

  useEffect(() => { setActiveIdx(0) }, [query])

  const commit = useCallback((path: string) => {
    onSelect(path)
    onClose()
  }, [onSelect, onClose])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { onClose(); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx(i => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx(i => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[activeIdx]) commit(results[activeIdx])
  }

  return (
    <div
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(0,0,0,0.55)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '480px',
          background: 'var(--bg-elevated)',
          border: '1px solid var(--bg-border)',
          borderRadius: '6px',
          overflow: 'hidden',
          boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        }}
        onClick={e => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Go to file..."
          style={{
            width: '100%',
            background: 'transparent',
            border: 'none',
            borderBottom: '1px solid var(--bg-border)',
            color: 'var(--text)',
            fontFamily: 'var(--font-mono)',
            fontSize: '0.85rem',
            padding: '10px 14px',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
          {results.length === 0 ? (
            <div style={{
              padding: '12px 14px',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.78rem',
            }}>
              no files found
            </div>
          ) : (
            results.map((path, i) => {
              const parts = path.replace('/app/', '').split('/')
              const filename = parts.pop() ?? path
              const dir = parts.length ? parts.join('/') + '/' : ''
              return (
                <div
                  key={path}
                  onClick={() => commit(path)}
                  onMouseEnter={() => setActiveIdx(i)}
                  style={{
                    padding: '7px 14px',
                    cursor: 'pointer',
                    background: i === activeIdx ? 'var(--accent-dim)' : 'transparent',
                    borderLeft: i === activeIdx ? '2px solid var(--accent)' : '2px solid transparent',
                    display: 'flex',
                    alignItems: 'baseline',
                    gap: '8px',
                  }}
                >
                  <span style={{ color: i === activeIdx ? 'var(--accent)' : 'var(--text)', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
                    {filename}
                  </span>
                  {dir && (
                    <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.7rem' }}>
                      {dir}
                    </span>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    </div>
  )
}
