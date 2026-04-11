import { useEffect, useRef, useState } from 'react'

export function useExecution(sessionId: string | undefined, editorRef: React.RefObject<any>) {
  const [output, setOutput] = useState('')
  const [running, setRunning] = useState(false)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    wsRef.current = new WebSocket(`ws://localhost:8000/ws/execute/${sessionId}`)
    wsRef.current.onmessage = (event) => {
      setOutput(event.data)
      setRunning(false)
    }
    return () => wsRef.current?.close()
  }, [sessionId])

  const runCode = () => {
    if (!wsRef.current) return
    const code = editorRef.current?.getValue() || ''
    setRunning(true)
    setOutput('')
    wsRef.current.send(code)
  }

  return { output, running, runCode }
}