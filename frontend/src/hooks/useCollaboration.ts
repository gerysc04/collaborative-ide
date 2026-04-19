import { useRef, useCallback, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { COLLAB_WS_URL } from '../config'

function userColor(username: string): string {
  let hash = 0
  for (const c of username) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 70%, 65%)`
}

function safeClass(username: string): string {
  return username.replace(/[^a-zA-Z0-9]/g, '_')
}

function ensureCursorStyle(username: string, color: string) {
  const id = `collide-cursor-${safeClass(username)}`
  if (document.getElementById(id)) return
  const s = document.createElement('style')
  s.id = id
  const cls = safeClass(username)
  s.textContent = `
    .rc-sel-${cls} { background: ${color}40 !important; }
    .rc-cur-${cls} { border-left: 2px solid ${color} !important; margin-left: -1px; }
  `
  document.head.appendChild(s)
}

interface FileEntry {
  ydoc: Y.Doc
  provider: WebsocketProvider
  ytext: Y.Text
}

export interface OnlineUser {
  username: string
  branch: string
}

export function useCollaboration(sessionId: string | undefined, username: string) {
  const editorRef = useRef<any>(null)
  const monacoRef = useRef<any>(null)
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([])

  // Session-level provider — awareness only, no file content
  const providerRef = useRef<WebsocketProvider | null>(null)

  // Per-file providers: `branch:path` → FileEntry
  const fileProvidersRef = useRef<Map<string, FileEntry>>(new Map())

  const currentYtextRef = useRef<Y.Text | null>(null)
  const ytextObserverRef = useRef<((e: any) => void) | null>(null)
  const editorListenerRef = useRef<{ dispose: () => void } | null>(null)
  const cursorListenerRef = useRef<{ dispose: () => void } | null>(null)
  const selectionListenerRef = useRef<{ dispose: () => void } | null>(null)
  const currentPathRef = useRef<string | null>(null)
  const currentBranchRef = useRef<string>('main')
  const decorationsRef = useRef<Map<string, string[]>>(new Map())
  const widgetsRef = useRef<Map<string, any>>(new Map())

  const renderRemoteCursors = useCallback(() => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    const provider = providerRef.current
    if (!editor || !monaco || !provider) return

    const states = provider.awareness.getStates()
    const localId = provider.awareness.clientID
    const currentPath = currentPathRef.current
    const currentBranch = currentBranchRef.current
    const activeUsernames = new Set<string>()

    states.forEach((state: any, clientId: number) => {
      if (clientId === localId) return
      const remoteUser = state.username
      if (!remoteUser) return
      activeUsernames.add(remoteUser)

      const cursor = state.cursor
      const color = userColor(remoteUser)
      ensureCursorStyle(remoteUser, color)
      const cls = safeClass(remoteUser)

      if (!cursor || cursor.path !== currentPath || cursor.branch !== currentBranch) {
        const old = decorationsRef.current.get(remoteUser) ?? []
        decorationsRef.current.set(remoteUser, editor.deltaDecorations(old, []))
        const widget = widgetsRef.current.get(remoteUser)
        if (widget) {
          editor.removeContentWidget(widget)
          widgetsRef.current.delete(remoteUser)
        }
        return
      }

      const { lineNumber, column, selection } = cursor
      const newDecos: any[] = []

      newDecos.push({
        range: new monaco.Range(lineNumber, column, lineNumber, column + 1),
        options: { inlineClassName: `rc-cur-${cls}` },
      })

      if (selection) {
        const { startLine, startColumn, endLine, endColumn } = selection
        if (startLine !== endLine || startColumn !== endColumn) {
          newDecos.push({
            range: new monaco.Range(startLine, startColumn, endLine, endColumn),
            options: { className: `rc-sel-${cls}` },
          })
        }
      }

      const old = decorationsRef.current.get(remoteUser) ?? []
      decorationsRef.current.set(remoteUser, editor.deltaDecorations(old, newDecos))

      let widget = widgetsRef.current.get(remoteUser)
      if (!widget) {
        const domNode = document.createElement('div')
        domNode.style.cssText = [
          `background:${color}`,
          'color:#fff',
          'font-size:10px',
          'padding:1px 5px',
          'border-radius:2px 2px 2px 0',
          'pointer-events:none',
          'white-space:nowrap',
          'font-family:var(--font-ui)',
          'line-height:1.4',
          'z-index:10',
        ].join(';')
        domNode.textContent = remoteUser
        widget = {
          _line: lineNumber,
          _col: column,
          getId: () => `rc-widget-${remoteUser}`,
          getDomNode: () => domNode,
          getPosition: () => ({
            position: { lineNumber: widget._line, column: widget._col },
            preference: [monaco.editor.ContentWidgetPositionPreference.ABOVE],
          }),
        }
        editor.addContentWidget(widget)
        widgetsRef.current.set(remoteUser, widget)
      }
      widget._line = lineNumber
      widget._col = column
      editor.layoutContentWidget(widget)
    })

    widgetsRef.current.forEach((widget, uname) => {
      if (!activeUsernames.has(uname)) {
        editor.removeContentWidget(widget)
        widgetsRef.current.delete(uname)
        const old = decorationsRef.current.get(uname) ?? []
        decorationsRef.current.set(uname, editor.deltaDecorations(old, []))
      }
    })
  }, [])

  const handleEditorMount = (editor: any, monaco: any) => {
    editorRef.current = editor
    monacoRef.current = monaco

    // Session-level doc — awareness only
    const ydoc = new Y.Doc()
    const provider = new WebsocketProvider(COLLAB_WS_URL, sessionId!, ydoc)
    providerRef.current = provider
    provider.awareness.setLocalStateField('username', username)
    provider.awareness.setLocalStateField('branch', 'main')
    provider.awareness.setLocalStateField('cursor', null)
    const updatePresence = () => {
      const states = provider.awareness.getStates()
      const localId = provider.awareness.clientID
      const users: OnlineUser[] = []
      states.forEach((state: any, clientId: number) => {
        if (clientId !== localId && state.username) {
          users.push({ username: state.username, branch: state.branch ?? 'main' })
        }
      })
      setOnlineUsers(users)
    }

    provider.awareness.on('change', renderRemoteCursors)
    provider.awareness.on('change', updatePresence)
  }

  const getOrCreateFileProvider = (path: string, branch: string): FileEntry => {
    const key = `${branch}:${path}`
    if (fileProvidersRef.current.has(key)) {
      return fileProvidersRef.current.get(key)!
    }
    const ydoc = new Y.Doc()
    const roomName = `${sessionId}/${encodeURIComponent(branch)}:${encodeURIComponent(path)}`
    const provider = new WebsocketProvider(COLLAB_WS_URL, roomName, ydoc)
    const ytext = ydoc.getText('content')
    const entry: FileEntry = { ydoc, provider, ytext }
    fileProvidersRef.current.set(key, entry)
    return entry
  }

  const closeFile = useCallback((path: string, branch: string) => {
    const key = `${branch}:${path}`
    const entry = fileProvidersRef.current.get(key)
    if (entry) {
      entry.provider.destroy()
      entry.ydoc.destroy()
      fileProvidersRef.current.delete(key)
    }
  }, [])

  const setAwarenessBranch = useCallback((branch: string) => {
    currentBranchRef.current = branch
    providerRef.current?.awareness.setLocalStateField('branch', branch)
    providerRef.current?.awareness.setLocalStateField('cursor', null)
  }, [])

  const switchFile = useCallback((path: string, initialContent: string, language: string, branch: string = 'main') => {
    const editor = editorRef.current
    const monaco = monacoRef.current
    if (!editor) return

    currentPathRef.current = path
    currentBranchRef.current = branch
    providerRef.current?.awareness.setLocalStateField('cursor', null)

    // Tear down listeners for the previous file (but keep its provider alive)
    if (currentYtextRef.current && ytextObserverRef.current) {
      currentYtextRef.current.unobserve(ytextObserverRef.current)
    }
    editorListenerRef.current?.dispose()
    cursorListenerRef.current?.dispose()
    selectionListenerRef.current?.dispose()

    const { ydoc, ytext } = getOrCreateFileProvider(path, branch)
    currentYtextRef.current = ytext

    if (ytext.length === 0 && initialContent.length > 0) {
      ydoc.transact(() => { ytext.insert(0, initialContent) })
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

    // Cursor → awareness (on session provider so all users see it)
    cursorListenerRef.current = editor.onDidChangeCursorPosition((e: any) => {
      providerRef.current?.awareness.setLocalStateField('cursor', {
        path,
        branch,
        lineNumber: e.position.lineNumber,
        column: e.position.column,
        selection: null,
      })
    })

    selectionListenerRef.current = editor.onDidChangeCursorSelection((e: any) => {
      const sel = e.selection
      providerRef.current?.awareness.setLocalStateField('cursor', {
        path,
        branch,
        lineNumber: sel.positionLineNumber,
        column: sel.positionColumn,
        selection: sel.isEmpty() ? null : {
          startLine: sel.startLineNumber,
          startColumn: sel.startColumn,
          endLine: sel.endLineNumber,
          endColumn: sel.endColumn,
        },
      })
    })

    if (monaco) {
      const model = editor.getModel()
      if (model) monaco.editor.setModelLanguage(model, language)
    }
  }, [])

  return { editorRef, monacoRef, handleEditorMount, switchFile, setAwarenessBranch, closeFile, providerRef, onlineUsers }
}
