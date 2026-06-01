import { useEffect, useRef, useState } from 'react'
import SimplePeer from 'simple-peer'
import { useStore } from '../../store/useStore'
import { getIdToken } from '../../auth/AuthProvider'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'

// ICE servers for traversing NATs over the internet. Google's public STUN works
// for most networks; an optional TURN relay (e.g. Metered Open Relay free tier)
// handles restrictive/symmetric NATs where a direct connection isn't possible.
const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  ...(import.meta.env.VITE_TURN_URL
    ? [
        {
          urls: import.meta.env.VITE_TURN_URL,
          username: import.meta.env.VITE_TURN_USERNAME,
          credential: import.meta.env.VITE_TURN_CREDENTIAL,
        },
      ]
    : []),
]

interface ExistingPeer {
  peerId: string
}

/**
 * Establishes peer-to-peer WebRTC audio with everyone in the room. The server
 * only relays signaling (offer/answer/ICE); audio never touches it. Existing
 * peers act as initiators when a newcomer joins.
 */
export function useWebRTC(
  roomId: string,
  localStream: MediaStream | null,
  inVoice: boolean
): Record<string, MediaStream> {
  const myPeerId = useStore((s) => s.peerId)
  const myName = useStore((s) => s.name)
  const myColor = useStore((s) => s.color)

  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({})
  const peersRef = useRef<Map<string, SimplePeer.Instance>>(new Map())
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!inVoice || !localStream) return

    let ws: WebSocket | null = null
    let cancelled = false
    const peers = peersRef.current

    const send = (msg: unknown) => {
      const s = wsRef.current
      if (s && s.readyState === WebSocket.OPEN) s.send(JSON.stringify(msg))
    }

    const createPeer = (remotePeerId: string, initiator: boolean) => {
      if (peers.has(remotePeerId)) return peers.get(remotePeerId)!
      const peer = new SimplePeer({
        initiator,
        trickle: true,
        stream: localStream,
        config: { iceServers: ICE_SERVERS },
      })

      peer.on('signal', (data) => {
        send({ type: 'signal', to: remotePeerId, from: myPeerId, data })
      })
      peer.on('stream', (stream) => {
        setRemoteStreams((prev) => ({ ...prev, [remotePeerId]: stream }))
      })
      peer.on('close', () => removePeer(remotePeerId))
      peer.on('error', (err) => {
        console.warn('[webrtc] peer error', remotePeerId, err.message)
        removePeer(remotePeerId)
      })

      peers.set(remotePeerId, peer)
      return peer
    }

    const removePeer = (remotePeerId: string) => {
      const peer = peers.get(remotePeerId)
      if (peer) {
        peer.destroy()
        peers.delete(remotePeerId)
      }
      setRemoteStreams((prev) => {
        if (!(remotePeerId in prev)) return prev
        const next = { ...prev }
        delete next[remotePeerId]
        return next
      })
    }

    const onMessage = (event: MessageEvent) => {
      let msg: { type: string; [k: string]: unknown }
      try {
        msg = JSON.parse(event.data)
      } catch {
        return
      }

      switch (msg.type) {
        case 'existing-peers': {
          // We just joined — wait for existing peers' offers (non-initiator).
          for (const p of msg.peers as ExistingPeer[]) {
            createPeer(p.peerId, false)
          }
          break
        }
        case 'peer-joined': {
          // A newcomer arrived — we initiate the connection to them.
          createPeer(String(msg.peerId), true)
          break
        }
        case 'signal': {
          const from = String(msg.from)
          const peer = peers.get(from) ?? createPeer(from, false)
          try {
            peer.signal(msg.data as SimplePeer.SignalData)
          } catch (err) {
            console.warn('[webrtc] signal apply failed', err)
          }
          break
        }
        case 'peer-left': {
          removePeer(String(msg.peerId))
          break
        }
      }
    }

    // Fetch a fresh auth token, then open the signaling socket.
    void (async () => {
      const token = await getIdToken()
      if (cancelled) return
      const qs = token ? `?token=${encodeURIComponent(token)}` : ''
      ws = new WebSocket(`${WS_URL}/signal/${roomId}${qs}`)
      wsRef.current = ws
      ws.onopen = () => {
        send({ type: 'join', roomId, peerId: myPeerId, name: myName, color: myColor })
      }
      ws.onmessage = onMessage
    })()

    return () => {
      cancelled = true
      peers.forEach((p) => p.destroy())
      peers.clear()
      setRemoteStreams({})
      ws?.close()
      wsRef.current = null
    }
  }, [roomId, inVoice, localStream, myPeerId, myName, myColor])

  return remoteStreams
}
