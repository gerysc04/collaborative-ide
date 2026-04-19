const http = require('http')
const WebSocket = require('ws')
const Y = require('yjs')
const { setupWSConnection, setPersistence } = require('y-websocket/bin/utils')
const { MongodbPersistence } = require('y-mongodb-provider')

const MONGODB_URL = process.env.MONGODB_URL || 'mongodb://localhost:27017'

const mdb = new MongodbPersistence(MONGODB_URL, {
  collectionName: 'yjs_docs',
  flushSize: 400,
})

setPersistence({
  provider: mdb,
  bindState: async (docName, ydoc) => {
    const persistedDoc = await mdb.getYDoc(docName)
    const persistedState = Y.encodeStateAsUpdate(persistedDoc)
    Y.applyUpdate(ydoc, persistedState)
    ydoc.on('update', (update) => {
      mdb.storeUpdate(docName, update)
    })
  },
  writeState: async (_docName, _ydoc) => {},
})

const server = http.createServer()
const wss = new WebSocket.Server({ server })

wss.on('connection', (ws, req) => {
  setupWSConnection(ws, req)
})

const PORT = process.env.PORT || 1234
server.listen(PORT, () => {
  console.log(`Collab server running on port ${PORT} (MongoDB persistence enabled)`)
})
