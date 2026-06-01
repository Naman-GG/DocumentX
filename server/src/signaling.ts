import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import { verifyToken, resolveAccess } from './access.js'

/**
 * WebRTC signaling relay. The server never sees audio — it only brokers the
 * offer/answer/ICE exchange so peers can connect directly. Connections must
 * present a valid Firebase ID token (`?token=`) and have access to the room's
 * document. State is a simple `roomId -> (peerId -> socket)` map.
 */

interface JoinMessage {
  type: 'join'
  roomId: string
  peerId: string
  name?: string
  color?: string
}
interface SignalMessage {
  type: 'signal'
  to: string
  from: string
  data: unknown
}
type IncomingSignal = JoinMessage | SignalMessage

interface PeerConn {
  ws: WebSocket
  name?: string
  color?: string
}

const rooms = new Map<string, Map<string, PeerConn>>()

function safeSend(ws: WebSocket, payload: unknown) {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(payload))
}

function parseConn(req: IncomingMessage): { docId: string; token: string | null } {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean) // ['signal', '<docId>']
  return { docId: parts[1] ?? 'default', token: url.searchParams.get('token') }
}

export function setupSignaling(ws: WebSocket, req: IncomingMessage) {
  const { docId, token } = parseConn(req)

  // Buffer messages that arrive during authentication, then replay.
  const buffered: string[] = []
  const onEarly = (m: Buffer) => buffered.push(m.toString())
  ws.on('message', onEarly)

  ;(async () => {
    const user = await verifyToken(token)
    if (!user) {
      ws.close(1008, 'unauthorized')
      return
    }
    const role = await resolveAccess(docId, user)
    if (!role) {
      ws.close(1008, 'forbidden')
      return
    }
    ws.off('message', onEarly)
    attachSignaling(ws)
    for (const m of buffered) handleMessage(ws, m)
  })().catch(() => {
    try {
      ws.close(1011, 'server error')
    } catch {
      /* noop */
    }
  })

  let joinedRoom: string | null = null
  let selfPeerId: string | null = null

  function handleMessage(socket: WebSocket, raw: string) {
    let msg: IncomingSignal
    try {
      msg = JSON.parse(raw)
    } catch {
      return
    }

    switch (msg.type) {
      case 'join': {
        joinedRoom = msg.roomId
        selfPeerId = msg.peerId

        let room = rooms.get(msg.roomId)
        if (!room) {
          room = new Map()
          rooms.set(msg.roomId, room)
        }

        const existingPeers = Array.from(room.entries()).map(([peerId, conn]) => ({
          peerId,
          name: conn.name,
          color: conn.color,
        }))
        safeSend(socket, { type: 'existing-peers', peers: existingPeers })

        room.set(msg.peerId, { ws: socket, name: msg.name, color: msg.color })

        for (const [peerId, conn] of room) {
          if (peerId === msg.peerId) continue
          safeSend(conn.ws, {
            type: 'peer-joined',
            peerId: msg.peerId,
            name: msg.name,
            color: msg.color,
          })
        }
        break
      }
      case 'signal': {
        if (!joinedRoom) return
        const room = rooms.get(joinedRoom)
        const target = room?.get(msg.to)
        if (target) {
          safeSend(target.ws, { type: 'signal', from: msg.from, to: msg.to, data: msg.data })
        }
        break
      }
    }
  }

  function attachSignaling(socket: WebSocket) {
    socket.on('message', (raw: Buffer) => handleMessage(socket, raw.toString()))
  }

  const cleanup = () => {
    if (joinedRoom && selfPeerId) {
      const room = rooms.get(joinedRoom)
      if (room) {
        room.delete(selfPeerId)
        for (const [, conn] of room) {
          safeSend(conn.ws, { type: 'peer-left', peerId: selfPeerId })
        }
        if (room.size === 0) rooms.delete(joinedRoom)
      }
    }
  }

  ws.on('close', cleanup)
  ws.on('error', cleanup)
}
