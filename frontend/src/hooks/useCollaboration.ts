import { useRef } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { COLLAB_WS_URL } from '../config'

export function useCollaboration(sessionId: string | undefined) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco

    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(COLLAB_WS_URL, sessionId!, ydoc)
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

  return { editorRef, monacoRef, handleEditorMount }
}