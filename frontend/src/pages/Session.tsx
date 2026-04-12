import { useParams, useLocation } from 'react-router-dom'
import { PanelGroup, Panel, PanelResizeHandle } from 'react-resizable-panels'
import { useCollaboration } from '../hooks/useCollaboration'
import { useExecution } from '../hooks/useExecution'
import CodeEditor from '../components/CodeEditor'
import FileTree from '../components/FileTree'
import Chat from '../components/Chat'
import TerminalPanel from '../components/TerminalPanel'
import '../styles/Session.css'

export default function Session() {
  const { sessionId } = useParams()
  const location = useLocation()
  const username = location.state?.username || sessionStorage.getItem('username') || 'anonymous'
  const { editorRef, handleEditorMount } = useCollaboration(sessionId)
  const { output, running, error, runCode } = useExecution(sessionId, editorRef)

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
            <FileTree />
          </Panel>

          <PanelResizeHandle className="resize-handle resize-handle--vertical" />

          <Panel defaultSize={55} minSize={30}>
            <PanelGroup direction="vertical" style={{ height: '100%' }}>
              <Panel defaultSize={65} minSize={30}>
                <CodeEditor onMount={handleEditorMount} />
              </Panel>

              <PanelResizeHandle className="resize-handle resize-handle--horizontal" />

              <Panel defaultSize={35} minSize={15}>
                <TerminalPanel />
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