import { useParams } from 'react-router-dom'
import { useCollaboration } from '../hooks/useCollaboration'
import { useExecution } from '../hooks/useExecution'
import CodeEditor from '../components/CodeEditor'
import Terminal from '../components/Terminal'

export default function Session() {
  const { sessionId } = useParams()
  const { editorRef, handleEditorMount } = useCollaboration(sessionId)
  const { output, running, runCode } = useExecution(sessionId, editorRef)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span>Session: {sessionId}</span>
        <button onClick={runCode} disabled={running}>
          {running ? 'Running...' : 'Run'}
        </button>
      </div>
      <CodeEditor onMount={handleEditorMount} />
      <Terminal output={output} />
    </div>
  )
}