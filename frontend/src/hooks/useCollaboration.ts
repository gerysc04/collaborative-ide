import { useRef, useCallback } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { COLLAB_WS_URL } from '../config'

export function useCollaboration(sessionId: string | undefined) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const ydocRef = useRef<Y.Doc | null>(null)
  const currentYtextRef = useRef<Y.Text | null>(null)
  const ytextObserverRef = useRef<((e: any) => void) | null>(null)
  const editorListenerRef = useRef<{ dispose: () => void } | null>(null)

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco

    const ydoc = new Y.Doc()
    ydocRef.current = ydoc
    new WebsocketProvider(COLLAB_WS_URL, sessionId!, ydoc)
  }

  const switchFile = useCallback((path: string, initialContent: string, language: string) => {
    const editor = editorRef.current
    const ydoc = ydocRef.current
    const monaco = monacoRef.current
    if (!editor || !ydoc) return

    // Tear down previous file bindings
    if (currentYtextRef.current && ytextObserverRef.current) {
      currentYtextRef.current.unobserve(ytextObserverRef.current)
    }
    if (editorListenerRef.current) {
      editorListenerRef.current.dispose()
    }

    const ytext = ydoc.getText(path)
    currentYtextRef.current = ytext

    // Seed Yjs from the container if this file hasn't been opened yet
    if (ytext.length === 0 && initialContent.length > 0) {
      ydoc.transact(() => {
        ytext.insert(0, initialContent)
      })
    }

    editor.setValue(ytext.toString())

    // Yjs → editor
    const observer = () => {
      const newVal = ytext.toString()
      if (editor.getValue() !== newVal) editor.setValue(newVal)
    }
    ytextObserverRef.current = observer
    ytext.observe(observer)

    // Editor → Yjs
    editorListenerRef.current = editor.onDidChangeModelContent(() => {
      const val = editor.getValue()
      if (val !== ytext.toString()) {
        ydoc.transact(() => {
          ytext.delete(0, ytext.length)
          ytext.insert(0, val)
        })
      }
    })

    if (monaco) {
      const model = editor.getModel()
      if (model) monaco.editor.setModelLanguage(model, language)
    }
  }, [])

  return { editorRef, monacoRef, handleEditorMount, switchFile }
}
