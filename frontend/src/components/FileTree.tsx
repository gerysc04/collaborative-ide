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
  currentBranch: string
  onFileSelect: (path: string) => void
  selectedFile?: string
  isCollapsed?: boolean
  onToggle?: () => void
}

// Recursively reads all files from dropped FileSystem entries
async function readDroppedEntries(
  items: DataTransferItemList,
  targetDir: string,
): Promise<{ path: string; file: File }[]> {
  const results: { path: string; file: File }[] = []

  async function readEntry(entry: FileSystemEntry, parentPath: string) {
    if (entry.isFile) {
      const file = await new Promise<File>(resolve =>
        (entry as FileSystemFileEntry).file(resolve),
      )
      results.push({ path: `${parentPath}/${entry.name}`, file })
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader()
      const readBatch = () =>
        new Promise<FileSystemEntry[]>(resolve => reader.readEntries(resolve))
      let batch = await readBatch()
      while (batch.length > 0) {
        await Promise.all(batch.map(e => readEntry(e, `${parentPath}/${entry.name}`)))
        batch = await readBatch()
      }
    }
  }

  const entries: FileSystemEntry[] = []
  for (let i = 0; i < items.length; i++) {
    const entry = items[i].webkitGetAsEntry()
    if (entry) entries.push(entry)
  }
  await Promise.all(entries.map(e => readEntry(e, targetDir)))
  return results
}

function parentDir(path: string): string {
  const parts = path.split('/')
  return parts.slice(0, -1).join('/') || '/app'
}

function TreeNode({
  node, depth, onFileSelect, selectedFile, expanded, onToggle,
  dropTarget, onDragOver, onDragLeave, onDrop,
}: {
  node: FileNode
  depth: number
  onFileSelect: (path: string) => void
  selectedFile?: string
  expanded: Set<string>
  onToggle: (path: string) => void
  dropTarget: string | null
  onDragOver: (e: React.DragEvent, dirPath: string) => void
  onDragLeave: () => void
  onDrop: (e: React.DragEvent, dirPath: string) => void
}) {
  const isDir = node.type === 'directory'
  const isExpanded = expanded.has(node.path)
  const isSelected = selectedFile === node.path
  const targetPath = isDir ? node.path : parentDir(node.path)
  const isDropTarget = dropTarget === targetPath

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
          background: isDropTarget
            ? 'rgba(99,102,241,0.18)'
            : isSelected
            ? 'var(--accent-dim)'
            : 'transparent',
          outline: isDropTarget ? '1px solid var(--accent)' : 'none',
          outlineOffset: '-1px',
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
          if (!isSelected && !isDropTarget)
            (e.currentTarget as HTMLElement).style.background = '#161616'
        }}
        onMouseLeave={e => {
          if (!isSelected && !isDropTarget)
            (e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
        onDragOver={e => onDragOver(e, targetPath)}
        onDragLeave={onDragLeave}
        onDrop={e => onDrop(e, targetPath)}
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
          dropTarget={dropTarget}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
        />
      ))}
    </div>
  )
}

export default function FileTree({ sessionId, currentBranch, onFileSelect, selectedFile, isCollapsed: _isCollapsed, onToggle: _onToggle }: Props) {
  const [tree, setTree] = useState<FileNode | null>(null)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['/app']))
  const [creating, setCreating] = useState<'file' | 'directory' | null>(null)
  const [newPath, setNewPath] = useState('')
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const fetchDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const fetchTree = useCallback(async () => {
    if (!sessionId) return
    try {
      const res = await fetch(`${API_URL}/sessions/${sessionId}/files?branch=${encodeURIComponent(currentBranch)}`)
      const data = await res.json()
      if (!data.error) setTree(data)
    } catch (e) {
      console.error('FileTree fetch error:', e)
    } finally {
      setLoading(false)
    }
  }, [sessionId, currentBranch])

  useEffect(() => { fetchTree() }, [fetchTree])

  useEffect(() => {
    if (!sessionId) return
    let retryTimeout: ReturnType<typeof setTimeout>
    const connect = () => {
      const ws = new WebSocket(`${API_WS_URL}/ws/files/${sessionId}?branch=${encodeURIComponent(currentBranch)}`)
      wsRef.current = ws
      ws.onmessage = () => {
        if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
        fetchDebounceRef.current = setTimeout(fetchTree, 300)
      }
      ws.onclose = () => { retryTimeout = setTimeout(connect, 3000) }
      ws.onerror = () => ws.close()
    }
    const initialDelay = setTimeout(connect, 500)
    return () => {
      clearTimeout(initialDelay)
      clearTimeout(retryTimeout)
      if (fetchDebounceRef.current) clearTimeout(fetchDebounceRef.current)
      wsRef.current?.close()
    }
  }, [sessionId, currentBranch, fetchTree])

  useEffect(() => {
    if (creating) inputRef.current?.focus()
  }, [creating])

  const toggleDir = (path: string) => {
    setExpanded(prev => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }

  const startCreating = (type: 'file' | 'directory') => {
    setNewPath('')
    setCreating(type)
  }

  const commitCreate = async () => {
    const trimmed = newPath.trim()
    if (!trimmed) { setCreating(null); return }
    const fullPath = `/app/${trimmed.replace(/^\/+/, '')}`
    try {
      await fetch(
        `${API_URL}/sessions/${sessionId}/files/new?path=${encodeURIComponent(fullPath)}&branch=${encodeURIComponent(currentBranch)}`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: creating }) }
      )
    } catch (e) {
      console.error('Create failed:', e)
    }
    setCreating(null)
    setNewPath('')
  }

  const handleInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') commitCreate()
    if (e.key === 'Escape') { setCreating(null); setNewPath('') }
  }

  const uploadFiles = useCallback(async (files: { path: string; file: File }[]) => {
    setUploading(true)
    try {
      await Promise.all(files.map(async ({ path, file }) => {
        const form = new FormData()
        form.append('path', path)
        form.append('file', file)
        await fetch(
          `${API_URL}/sessions/${sessionId}/files/upload?branch=${encodeURIComponent(currentBranch)}`,
          { method: 'POST', body: form }
        )
      }))
    } finally {
      setUploading(false)
    }
  }, [sessionId, currentBranch])

  const handleDragOver = useCallback((e: React.DragEvent, dirPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(dirPath)
  }, [])

  const handleDragLeave = useCallback(() => {
    setDropTarget(null)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent, dirPath: string) => {
    e.preventDefault()
    e.stopPropagation()
    setDropTarget(null)
    const files = await readDroppedEntries(e.dataTransfer.items, dirPath)
    if (files.length > 0) await uploadFiles(files)
  }, [uploadFiles])

  const handleRootDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    setDropTarget(null)
    const files = await readDroppedEntries(e.dataTransfer.items, '/app')
    if (files.length > 0) await uploadFiles(files)
  }, [uploadFiles])

  const downloadProject = () => {
    const url = `${API_URL}/sessions/${sessionId}/files/download?branch=${encodeURIComponent(currentBranch)}`
    const a = document.createElement('a')
    a.href = url
    a.download = 'project.tar.gz'
    a.click()
  }

  const btnStyle: React.CSSProperties = {
    background: 'none',
    border: 'none',
    color: 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: '0.75rem',
    fontFamily: 'var(--font-ui)',
    padding: '2px 5px',
    borderRadius: '3px',
    lineHeight: 1,
  }

  return (
    <div
      style={{ height: '100%', overflowY: 'auto', borderRight: '1px solid var(--bg-border)', display: 'flex', flexDirection: 'column' }}
      onDragOver={e => { e.preventDefault(); setDropTarget('/app') }}
      onDragLeave={() => setDropTarget(null)}
      onDrop={handleRootDrop}
    >
      {/* Header */}
      <div style={{
        padding: '0.4rem 0.5rem 0.4rem 0.75rem',
        fontSize: '0.68rem',
        color: 'var(--text-muted)',
        textTransform: 'uppercase',
        letterSpacing: '0.1em',
        fontFamily: 'var(--font-ui)',
        borderBottom: '1px solid var(--bg-border)',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <span>Files {uploading && <span style={{ textTransform: 'none', fontSize: '0.65rem', color: 'var(--accent)' }}>uploading...</span>}</span>
        <div style={{ display: 'flex', gap: '2px', alignItems: 'center' }}>
          <button style={btnStyle} title="New file" onClick={() => startCreating('file')}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
            + file
          </button>
          <button style={btnStyle} title="New folder" onClick={() => startCreating('directory')}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
            + dir
          </button>
          <button style={btnStyle} title="Download project as tar.gz" onClick={downloadProject}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'}>
            ⬇
          </button>
        </div>
      </div>

      {/* Inline create input */}
      {creating && (
        <div style={{ padding: '6px 8px', borderBottom: '1px solid var(--bg-border)', flexShrink: 0 }}>
          <input
            ref={inputRef}
            value={newPath}
            onChange={e => setNewPath(e.target.value)}
            onKeyDown={handleInputKeyDown}
            onBlur={commitCreate}
            placeholder={creating === 'file' ? 'src/new-file.ts' : 'src/new-folder'}
            style={{
              width: '100%',
              background: 'var(--bg-elevated)',
              border: '1px solid var(--accent)',
              borderRadius: '3px',
              color: 'var(--text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '0.75rem',
              padding: '4px 6px',
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {/* Tree */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: '4px' }}>
        {loading ? (
          <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>loading...</div>
        ) : !tree || !tree.children?.length ? (
          <div style={{ padding: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.78rem' }}>
            empty · drop files here
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
              dropTarget={dropTarget}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            />
          ))
        )}
      </div>
    </div>
  )
}
