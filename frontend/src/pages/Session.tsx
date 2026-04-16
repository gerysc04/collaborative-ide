import { useParams, useLocation } from 'react-router-dom'
import { useState, useRef, useCallback, useEffect } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useCollaboration } from '../hooks/useCollaboration'
import { useExecution } from '../hooks/useExecution'
import CodeEditor from '../components/CodeEditor'
import EditorTabs from '../components/EditorTabs'
import FileTree from '../components/FileTree'
import Chat from '../components/Chat'
import TerminalPanel from '../components/TerminalPanel'
import PortsPanel from '../components/PortsPanel'
import { API_URL } from '../config'
import '../styles/Session.css'

const EXT_LANGUAGE: Record<string, string> = {
  js: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript',
  py: 'python', json: 'json', html: 'html', css: 'css', scss: 'scss',
  md: 'markdown', sh: 'shell', bash: 'shell', yaml: 'yaml', yml: 'yaml',
  txt: 'plaintext', go: 'go', rs: 'rust', rb: 'ruby', java: 'java',
  c: 'c', cpp: 'cpp', cs: 'csharp',
}

function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? ''
  return EXT_LANGUAGE[ext] ?? 'plaintext'
}

export default function Session() {
  const { sessionId } = useParams()
  const location = useLocation()
  const username = location.state?.username || sessionStorage.getItem('username') || 'anonymous'
  const { editorRef, handleEditorMount, switchFile } = useCollaboration(sessionId)
  const { running, error, runCode } = useExecution(sessionId, editorRef)

  const [repoName, setRepoName] = useState<string>(location.state?.repo_full_name ?? '')
  const [codeCopied, setCodeCopied] = useState(false)
  const [showPorts, setShowPorts] = useState(false)

  useEffect(() => {
    if (repoName || !sessionId) return
    fetch(`${API_URL}/sessions/${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.repo_url) {
          const parts = data.repo_url.replace('.git', '').split('/')
          setRepoName(parts.slice(-2).join('/'))
        }
      })
      .catch(() => {})
  }, [sessionId, repoName])

  const copySessionCode = () => {
    if (!sessionId) return
    navigator.clipboard.writeText(sessionId)
    setCodeCopied(true)
    setTimeout(() => setCodeCopied(false), 1500)
  }

  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [activeFile, setActiveFile] = useState<string | null>(null)
  const activeFileRef = useRef<string | null>(null)
  const openFilesRef = useRef<string[]>([])
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const closeTabRef = useRef<(path: string) => void>(() => {})

  const handleEditorMountWithSave = useCallback((editor: any, monaco: any) => {
    handleEditorMount(editor, monaco)

    // Intercept Ctrl+W inside Monaco before the browser sees it
    editor.onKeyDown((e: any) => {
      if ((e.ctrlKey || e.metaKey) && e.code === 'KeyW') {
        e.preventDefault()
        e.stopPropagation()
        if (activeFileRef.current) closeTabRef.current(activeFileRef.current)
      }
    })

    editor.onDidChangeModelContent(() => {
      if (!activeFileRef.current) return
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      const path = activeFileRef.current
      saveTimeoutRef.current = setTimeout(async () => {
        await fetch(
          `${API_URL}/sessions/${sessionId}/files/content?path=${encodeURIComponent(path)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content: editor.getValue() }),
          }
        )
      }, 800)
    })
  }, [handleEditorMount, sessionId])

  const handleFileSelect = useCallback(async (path: string) => {
    setOpenFiles(prev => {
      const next = prev.includes(path) ? prev : [...prev, path]
      openFilesRef.current = next
      return next
    })
    setActiveFile(path)
    activeFileRef.current = path

    try {
      const res = await fetch(
        `${API_URL}/sessions/${sessionId}/files/content?path=${encodeURIComponent(path)}`
      )
      const data = await res.json()
      switchFile(path, data.content ?? '', detectLanguage(path))
      editorRef.current?.focus()
    } catch (e) {
      console.error('Failed to load file:', e)
    }
  }, [sessionId, switchFile, editorRef])

  const handleTabClose = useCallback((path: string) => {
    const current = openFilesRef.current
    const idx = current.indexOf(path)
    const next = current.filter(p => p !== path)

    setOpenFiles(next)
    openFilesRef.current = next

    if (activeFileRef.current === path) {
      const nextActive = next[idx] ?? next[idx - 1] ?? null
      if (nextActive) {
        handleFileSelect(nextActive)
      } else {
        setActiveFile(null)
        activeFileRef.current = null
        editorRef.current?.setValue('')
      }
    }
  }, [handleFileSelect, editorRef])
  closeTabRef.current = handleTabClose

  return (
    <div className="session">
      <div className="session__toolbar">
        <div className="session__toolbar-left">
          <span className="session__logo">Collide</span>
          {repoName && <span className="session__repo">{repoName}</span>}
        </div>
        <div className="session__toolbar-right">
          <span className="session__id">{username}</span>
          <span
            className="session__code"
            onClick={copySessionCode}
            title="Click to copy session code"
          >
            session code: <span className="session__code-value">{codeCopied ? 'copied!' : sessionId}</span>
          </span>
          <button
            className={`session__btn session__btn--ports${showPorts ? ' session__btn--ports-active' : ''}`}
            onClick={() => setShowPorts(p => !p)}
          >
            Ports
          </button>
          <button className="session__btn session__btn--run" onClick={runCode} disabled={running}>
            {running ? 'Running...' : '▶ Run'}
          </button>
        </div>
      </div>

      {showPorts && (
        <PortsPanel sessionId={sessionId} onClose={() => setShowPorts(false)} />
      )}

      <div className="session__body">
        <PanelGroup direction="horizontal" style={{ height: '100%' }}>
          <Panel defaultSize={20} minSize={15} maxSize={30}>
            <FileTree
              sessionId={sessionId}
              onFileSelect={handleFileSelect}
              selectedFile={activeFile ?? undefined}
            />
          </Panel>

          <PanelResizeHandle className="resize-handle resize-handle--vertical" />

          <Panel defaultSize={55} minSize={30}>
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
              <EditorTabs
                tabs={openFiles}
                activeFile={activeFile}
                onSelect={handleFileSelect}
                onClose={handleTabClose}
              />
              <PanelGroup direction="vertical" style={{ flex: 1, minHeight: 0 }}>
                <Panel defaultSize={65} minSize={30}>
                  <CodeEditor onMount={handleEditorMountWithSave} />
                </Panel>
                <PanelResizeHandle className="resize-handle resize-handle--horizontal" />
                <Panel defaultSize={35} minSize={15}>
                  <TerminalPanel sessionId={sessionId} />
                </Panel>
              </PanelGroup>
            </div>
          </Panel>

          <PanelResizeHandle className="resize-handle resize-handle--vertical" />

          <Panel defaultSize={25} minSize={20} maxSize={35}>
            <Chat sessionId={sessionId} username={username} />
          </Panel>
        </PanelGroup>
      </div>

      {error && (
        <div style={{ position: 'fixed', bottom: '1rem', right: '1rem', color: '#ff4d4d', fontFamily: 'var(--font-mono)', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}
    </div>
  )
}
