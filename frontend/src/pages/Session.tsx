import { useParams, useLocation } from 'react-router-dom'
import { useCollaboration } from '../hooks/useCollaboration'
import { useExecution } from '../hooks/useExecution'
import CodeEditor from '../components/CodeEditor'
import '../styles/Session.css'

export default function Session() {
  const { sessionId } = useParams()
  const location = useLocation()
  const username = location.state?.username || sessionStorage.getItem('username') || 'anonymous'
  const { editorRef, handleEditorMount } = useCollaboration(sessionId)
  const { output, running, runCode } = useExecution(sessionId, editorRef)

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
      <div className="session__editor">
        <CodeEditor onMount={handleEditorMount} />
      </div>
      <div className="session__terminal">
        <div className="session__terminal-header">output</div>
        <div className="session__terminal-output">
          <pre className={output ? '' : 'session__terminal-output--muted'}>
            {output || '// run your code to see output'}
          </pre>
        </div>
      </div>
    </div>
  )
}