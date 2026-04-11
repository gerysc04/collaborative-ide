import { useEffect, useRef, useState } from 'react'

export function useExecution(sessionId: string | undefined, editorRef: React.RefObject<any>) {
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    wsRef.current = new WebSocket(`ws://localhost:8000/ws/execute/${sessionId}`)
    
    wsRef.current.onmessage = (event) => {
      setOutput(event.data)
      setRunning(false)
      setError('')
    }

    wsRef.current.onerror = () => {
      setError('Connection error — could not reach execution server')
      setRunning(false)
    }

    wsRef.current.onclose = () => {
      setError('Connection closed unexpectedly')
      setRunning(false)
    }

    return () => wsRef.current?.close()
  }, [sessionId])

  const runCode = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
      setError('Not connected to execution server')
      return
    }
    const code = editorRef.current?.getValue() || ''
    setRunning(true)
    setOutput('')
    setError('')
    wsRef.current.send(code)
  }

  return { output, running, error, runCode }
}