import Editor from '@monaco-editor/react'

interface Props {
  onMount: (editor: any) => void
}

export default function CodeEditor({ onMount }: Props) {
  return (
    <Editor
      height="70vh"
      defaultLanguage="javascript"
      theme="vs-dark"
      onMount={onMount}
    />
  )
}