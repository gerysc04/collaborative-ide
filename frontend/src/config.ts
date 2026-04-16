export const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'
export const API_WS_URL = API_URL.replace(/^http/, 'ws')
export const COLLAB_WS_URL = import.meta.env.VITE_COLLAB_WS_URL ?? 'ws://localhost:1234'
