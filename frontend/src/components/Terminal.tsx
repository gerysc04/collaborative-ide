interface Props {
  output: string
}

export default function Terminal({ output }: Props) {
  return (
    <div style={{ height: '30vh', backgroundColor: '#1e1e1e', color: '#fff', padding: '1rem', overflowY: 'auto', fontFamily: 'monospace' }}>
      <pre>{output || 'Output will appear here...'}</pre>
    </div>
  )
}