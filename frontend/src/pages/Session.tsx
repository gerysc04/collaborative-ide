import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import Editor from '@monaco-editor/react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

export default function Session() {
  const { sessionId } = useParams()
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)
  const editorRef = useRef<any>(null)

  useEffect(() => {
    wsRef.current = new WebSocket(`ws://localhost:8000/ws/execute/${sessionId}`)
    wsRef.current.onmessage = (event) => {
      setOutput(event.data)
      setRunning(false)
    }
    return () => wsRef.current?.close()
  }, [sessionId])

  const handleEditorMount = (editor: any) => {
    editorRef.current = editor

    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider('ws://localhost:1234', sessionId!, ydoc)
    const ytext = ydoc.getText('monaco')

    ytext.observe(() => {
      const currentValue = editor.getValue()
      const newValue = ytext.toString()
      if (currentValue !== newValue) {
        editor.setValue(newValue)
      }
    })

    editor.onDidChangeModelContent(() => {
      const currentValue = editor.getValue()
      if (currentValue !== ytext.toString()) {
        ydoc.transact(() => {
          ytext.delete(0, ytext.length)
          ytext.insert(0, currentValue)
        })
      }
    })

    return () => {
      provider.destroy()
      ydoc.destroy()
    }
  }

  const runCode = () => {
    if (!wsRef.current) return
    const code = editorRef.current?.getValue() || ''
    setRunning(true)
    setOutput('')
    wsRef.current.send(code)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ padding: '0.5rem 1rem', borderBottom: '1px solid #333', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <span>Session: {sessionId}</span>
        <button onClick={runCode} disabled={running}>
          {running ? 'Running...' : 'Run'}
        </button>
      </div>
      <div style={{ flex: 1 }}>
        <Editor
          height="70vh"
          defaultLanguage="javascript"
          theme="vs-dark"
          onMount={handleEditorMount}
        />
      </div>
      <div style={{ height: '30vh', backgroundColor: '#1e1e1e', color: '#fff', padding: '1rem', overflowY: 'auto', fontFamily: 'monospace' }}>
        <pre>{output || 'Output will appear here...'}</pre>
      </div>
    </div>
  )
}