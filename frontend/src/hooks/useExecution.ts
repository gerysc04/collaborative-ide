import { useRef, useState } from 'react'

export function useExecution(sessionId: string | undefined, editorRef: React.RefObject<any>) {
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  const runCode = () => {
    setRunning(true)
    setOutput('')
    setError('')

    const ws = new WebSocket(`ws://localhost:8000/ws/execute/${sessionId}`)
    wsRef.current = ws

    ws.onopen = () => {
      const code = editorRef.current?.getValue() || ''
      ws.send(code)
    }

    ws.onmessage = (event) => {
      setOutput(event.data)
      setRunning(false)
      ws.close()
    }

    ws.onerror = () => {
      setError('Connection error — could not reach execution server')
      setRunning(false)
    }

    ws.onclose = () => {
      setRunning(false)
    }
  }

  return { output, running, error, runCode }
}