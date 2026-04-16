export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const API_WS_URL = API_URL.replace(/^http/, 'ws')
export const COLLAB_WS_URL = import.meta.env.VITE_COLLAB_WS_URL ?? 'ws://localhost:1234'

// Proxy host for port forwarding. On localhost uses lvh.me (resolves to 127.0.0.1).
// On VPS set VITE_PROXY_HOST=collide.yourdomain.com
const _apiUrl = new URL(API_URL)
const _proxyHost = import.meta.env.VITE_PROXY_HOST ?? `lvh.me:${_apiUrl.port || 80}`
export const proxyUrl = (sessionId: string, port: number) =>
  `http://${sessionId}-${port}.${_proxyHost}/`
