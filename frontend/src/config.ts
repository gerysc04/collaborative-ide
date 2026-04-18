export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const API_WS_URL = API_URL.replace(/^http/, 'ws')
export const COLLAB_WS_URL = import.meta.env.VITE_COLLAB_WS_URL ?? 'ws://localhost:1234'

const _apiPort = new URL(API_URL).port || '80'
const _proxyHost = import.meta.env.VITE_PROXY_HOST ?? `lvh.me:${_apiPort}`
export const proxyUrl = (sessionId: string, port: number) =>
  `http://${sessionId.slice(0, 8)}-${port}.${_proxyHost}/`
