import { useParams, useLocation } from 'react-router-dom'
import { useState, useRef, useCallback, useEffect } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import type { ImperativePanelHandle } from 'react-resizable-panels'
import { useCollaboration } from '../hooks/useCollaboration'
import CodeEditor from '../components/CodeEditor'
import EditorTabs from '../components/EditorTabs'
import FileTree from '../components/FileTree'
import Chat from '../components/Chat'
import TerminalPanel from '../components/TerminalPanel'
import PortsPanel from '../components/PortsPanel'
import ProvidersPanel from '../components/ProvidersPanel'
import BranchSwitcher from '../components/BranchSwitcher'
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
  const githubToken = sessionStorage.getItem('github_token') ?? ''
  const { editorRef, handleEditorMount, switchFile, setAwarenessBranch, closeFile, providerRef } = useCollaboration(sessionId, username)
  const [repoName, setRepoName] = useState<string>(location.state?.repo_full_name ?? '')
  const [currentBranch, setCurrentBranch] = useState<string>('main')
  const currentBranchRef = useRef<string>('main')
  const [codeCopied, setCodeCopied] = useState(false)
  const [showPorts, setShowPorts] = useState(false)
  const [showProviders, setShowProviders] = useState(false)
  const [isResuming, setIsResuming] = useState(false)
  const [fileTreeCollapsed, setFileTreeCollapsed] = useState(false)
  const [chatCollapsed, setChatCollapsed] = useState(false)
  const fileTreePanelRef = useRef<ImperativePanelHandle>(null)
  const chatPanelRef = useRef<ImperativePanelHandle>(null)

  const toggleFileTree = useCallback(() => {
    if (fileTreeCollapsed) { fileTreePanelRef.current?.expand(); setFileTreeCollapsed(false) }
    else { fileTreePanelRef.current?.collapse(); setFileTreeCollapsed(true) }
  }, [fileTreeCollapsed])

  const toggleChat = useCallback(() => {
    if (chatCollapsed) { chatPanelRef.current?.expand(); setChatCollapsed(false) }
    else { chatPanelRef.current?.collapse(); setChatCollapsed(true) }
  }, [chatCollapsed])

  useEffect(() => {
    if (!sessionId) return
    fetch(`${API_URL}/sessions/${sessionId}`)
      .then(r => r.json())
      .then(async data => {
        if (data.repo_url && !repoName) {
          const parts = data.repo_url.replace('.git', '').split('/')
          setRepoName(parts.slice(-2).join('/'))
        }
        const branch = data.default_branch || 'main'
        setCurrentBranch(branch)
        currentBranchRef.current = branch

        if (data.status === 'stopped') {
          setIsResuming(true)
          try {
            await fetch(`${API_URL}/sessions/${sessionId}/resume`, { method: 'POST' })
          } catch (_) {}
          setIsResuming(false)
        }
      })
      .catch(() => {})
  }, [sessionId])

  const handleBranchChange = useCallback((branch: string) => {
    setAwarenessBranch(branch)
    setCurrentBranch(branch)
    currentBranchRef.current = branch
    setOpenFiles([])
    setActiveFile(null)
    activeFileRef.current = null
    editorRef.current?.setValue('')
  }, [editorRef, setAwarenessBranch])

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
      const branch = currentBranchRef.current
      saveTimeoutRef.current = setTimeout(async () => {
        await fetch(
          `${API_URL}/sessions/${sessionId}/files/content?path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`,
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
      const branch = currentBranchRef.current
      const res = await fetch(
        `${API_URL}/sessions/${sessionId}/files/content?path=${encodeURIComponent(path)}&branch=${encodeURIComponent(branch)}`
      )
      const data = await res.json()
      switchFile(path, data.content ?? '', detectLanguage(path), currentBranchRef.current)
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
    closeFile(path, currentBranchRef.current)

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
  }, [handleFileSelect, editorRef, closeFile])
  closeTabRef.current = handleTabClose

  return (
    <div className="session">
      <div className="session__toolbar">
        <div className="session__toolbar-left">
          <span className="session__logo">Collide</span>
          {repoName && <span className="session__repo">{repoName}</span>}
          <BranchSwitcher
            sessionId={sessionId}
            currentBranch={currentBranch}
            username={username}
            githubToken={githubToken}
            providerRef={providerRef}
            onBranchChange={handleBranchChange}
          />
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
            className={`session__btn session__btn--ports${showProviders ? ' session__btn--ports-active' : ''}`}
            onClick={() => { setShowProviders(p => !p); setShowPorts(false) }}
          >
            AI
          </button>
          <button
            className={`session__btn session__btn--ports${showPorts ? ' session__btn--ports-active' : ''}`}
            onClick={() => { setShowPorts(p => !p); setShowProviders(false) }}
          >
            Ports
          </button>
        </div>
      </div>

      {showPorts && (
        <PortsPanel sessionId={sessionId} onClose={() => setShowPorts(false)} />
      )}

      {showProviders && (
        <ProvidersPanel sessionId={sessionId} onClose={() => setShowProviders(false)} />
      )}

      {isResuming && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.75)',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          gap: '0.75rem',
        }}>
          <span style={{ color: 'var(--accent)', fontFamily: 'var(--font-mono)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>
            resuming session...
          </span>
          <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.72rem' }}>
            restoring containers from snapshot
          </span>
        </div>
      )}

      <div className="session__body">
        <PanelGroup direction="horizontal" style={{ height: '100%' }}>
          <Panel ref={fileTreePanelRef} defaultSize={20} minSize={15} maxSize={30} collapsible collapsedSize={0} onCollapse={() => setFileTreeCollapsed(true)} onExpand={() => setFileTreeCollapsed(false)}>
            <FileTree
              sessionId={sessionId}
              currentBranch={currentBranch}
              onFileSelect={handleFileSelect}
              selectedFile={activeFile ?? undefined}
              isCollapsed={fileTreeCollapsed}
              onToggle={toggleFileTree}
            />
          </Panel>

          <PanelResizeHandle className="resize-handle resize-handle--vertical">
            <button
              onClick={(e) => { e.stopPropagation(); toggleFileTree() }}
              title={fileTreeCollapsed ? 'Open file tree' : 'Close file tree'}
              className="panel-bookmark panel-bookmark--left"
            >
              {fileTreeCollapsed ? '›' : '‹'}
            </button>
          </PanelResizeHandle>

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
                  <TerminalPanel
                    key={currentBranch}
                    sessionId={sessionId}
                    currentBranch={currentBranch}
                  />
                </Panel>
              </PanelGroup>
            </div>
          </Panel>

          <PanelResizeHandle className="resize-handle resize-handle--vertical">
            <button
              onClick={(e) => { e.stopPropagation(); toggleChat() }}
              title={chatCollapsed ? 'Open chat' : 'Close chat'}
              className="panel-bookmark panel-bookmark--right"
            >
              {chatCollapsed ? '‹' : '›'}
            </button>
          </PanelResizeHandle>

          <Panel ref={chatPanelRef} defaultSize={25} minSize={20} maxSize={35} collapsible collapsedSize={0} onCollapse={() => setChatCollapsed(true)} onExpand={() => setChatCollapsed(false)}>
            <Chat sessionId={sessionId} username={username} currentBranch={currentBranch} isCollapsed={chatCollapsed} onToggle={toggleChat} />
          </Panel>
        </PanelGroup>
      </div>

    </div>
  )
}
