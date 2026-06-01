import 'dotenv/config'
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import cors from 'cors'
import { setupYjsServer } from './yjs-server.js'
import { setupSignaling } from './signaling.js'
import { initPersistence } from './yjs-persistence.js'
import { aiRouter } from './ai.js'

// Wire Firestore-backed persistence into the Yjs server.
initPersistence()

const app = express()
// In production set CLIENT_ORIGIN to the deployed client URL(s) (comma-separated)
// to lock down CORS; if unset (local dev), all origins are allowed.
const clientOrigin = process.env.CLIENT_ORIGIN
app.use(cors(clientOrigin ? { origin: clientOrigin.split(',').map((o) => o.trim()) } : {}))
app.use(express.json({ limit: '2mb' }))

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'documentx-server' })
})

app.use('/api/ai', aiRouter)

const server = createServer(app)
const wss = new WebSocketServer({ server })

// Single WS endpoint, routed by path:
//   /yjs/<roomId>     → Yjs document sync
//   /signal/<roomId>  → WebRTC signaling
wss.on('connection', (ws, req) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  if (url.pathname.startsWith('/yjs')) {
    setupYjsServer(ws, req)
  } else if (url.pathname.startsWith('/signal')) {
    setupSignaling(ws, req)
  } else {
    ws.close(1008, 'Unknown WebSocket path')
  }
})

const PORT = Number(process.env.PORT) || 3001
server.listen(PORT, () => {
  console.log(`▸ DocumentX server listening on http://localhost:${PORT}`)
  console.log(`  Yjs sync:    ws://localhost:${PORT}/yjs/<roomId>`)
  console.log(`  Signaling:   ws://localhost:${PORT}/signal/<roomId>`)
  if (!process.env.GROQ_API_KEY) {
    console.warn('  ⚠ GROQ_API_KEY is not set — AI features will fail.')
  }
})
