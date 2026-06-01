import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'

/**
 * WebRTC signaling relay.
 *
 * The server never sees audio — it only brokers the offer/answer/ICE exchange
 * needed for peers to establish a direct WebRTC connection. State is a simple
 * `roomId -> (peerId -> socket)` map.
 */

interface SignalMessageBase {
  type: string
}

interface JoinMessage extends SignalMessageBase {
  type: 'join'
  roomId: string
  peerId: string
  name?: string
  color?: string
}

interface SignalMessage extends SignalMessageBase {
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
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(payload))
  }
}

export function setupSignaling(ws: WebSocket, _req: IncomingMessage) {
  let joinedRoom: string | null = null
  let selfPeerId: string | null = null

  ws.on('message', (raw: Buffer) => {
    let msg: IncomingSignal
    try {
      msg = JSON.parse(raw.toString())
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

        // Tell the newcomer who is already here so it can wait for their offers.
        const existingPeers = Array.from(room.entries()).map(([peerId, conn]) => ({
          peerId,
          name: conn.name,
          color: conn.color,
        }))
        safeSend(ws, { type: 'existing-peers', peers: existingPeers })

        room.set(msg.peerId, { ws, name: msg.name, color: msg.color })

        // Notify everyone else; existing peers become the WebRTC initiators.
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
          safeSend(target.ws, {
            type: 'signal',
            from: msg.from,
            to: msg.to,
            data: msg.data,
          })
        }
        break
      }
    }
  })

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
