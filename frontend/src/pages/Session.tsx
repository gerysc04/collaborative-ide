import { useParams, useLocation } from 'react-router-dom'
import { API_URL } from '../config'
import { useState, useRef, useCallback } from 'react'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useCollaboration } from '../hooks/useCollaboration'
import { useExecution } from '../hooks/useExecution'
import CodeEditor from '../components/CodeEditor'
import FileTree from '../components/FileTree'
import Chat from '../components/Chat'
import TerminalPanel from '../components/TerminalPanel'
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
  const { editorRef, monacoRef, handleEditorMount } = useCollaboration(sessionId)
  const { running, error, runCode } = useExecution(sessionId, editorRef)

  const [selectedFile, setSelectedFile] = useState<string | undefined>(undefined)
  const selectedFileRef = useRef<string | undefined>(undefined)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const handleEditorMountWithSave = useCallback((editor: any, monaco: any) => {
    handleEditorMount(editor, monaco)

    editor.onDidChangeModelContent(() => {
      if (!selectedFileRef.current) return
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
      const path = selectedFileRef.current
      saveTimeoutRef.current = setTimeout(async () => {
        const content = editor.getValue()
        await fetch(
          `${API_URL}/sessions/${sessionId}/files/content?path=${encodeURIComponent(path)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ content }),
          }
        )
      }, 800)
    })
  }, [handleEditorMount, sessionId])

  const handleFileSelect = useCallback(async (path: string) => {
    setSelectedFile(path)
    selectedFileRef.current = path

    try {
      const res = await fetch(
        `${API_URL}/sessions/${sessionId}/files/content?path=${encodeURIComponent(path)}`
      )
      const data = await res.json()
      if (editorRef.current) {
        editorRef.current.setValue(data.content ?? '')
      }
      if (monacoRef.current && editorRef.current) {
        const model = editorRef.current.getModel()
        if (model) monacoRef.current.editor.setModelLanguage(model, detectLanguage(path))
      }
    } catch (e) {
      console.error('Failed to load file:', e)
    }
  }, [sessionId, editorRef, monacoRef])

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href)
  }

  return (
    <div className="session">
      <div className="session__toolbar">
        <div className="session__toolbar-left">
          <span className="session__logo">Collide</span>
          <span className="session__id">{sessionId}</span>
        </div>
        <div className="session__toolbar-right">
          <span className="session__id">{username}</span>
          <button className="session__btn session__btn--share" onClick={copyLink}>
            Copy Link
          </button>
          <button className="session__btn session__btn--run" onClick={runCode} disabled={running}>
            {running ? 'Running...' : '▶ Run'}
          </button>
        </div>
      </div>

      <div className="session__body">
        <PanelGroup direction="horizontal" style={{ height: '100%' }}>
          <Panel defaultSize={20} minSize={15} maxSize={30}>
            <FileTree
              sessionId={sessionId}
              onFileSelect={handleFileSelect}
              selectedFile={selectedFile}
            />
          </Panel>

          <PanelResizeHandle className="resize-handle resize-handle--vertical" />

          <Panel defaultSize={55} minSize={30}>
            <PanelGroup direction="vertical" style={{ height: '100%' }}>
              <Panel defaultSize={65} minSize={30}>
                <CodeEditor onMount={handleEditorMountWithSave} />
              </Panel>

              <PanelResizeHandle className="resize-handle resize-handle--horizontal" />
              <Panel defaultSize={35} minSize={15}>
                <TerminalPanel sessionId={sessionId} />
              </Panel>
            </PanelGroup>
          </Panel>

          <PanelResizeHandle className="resize-handle resize-handle--vertical" />

          <Panel defaultSize={25} minSize={20} maxSize={35}>
            <Chat />
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
