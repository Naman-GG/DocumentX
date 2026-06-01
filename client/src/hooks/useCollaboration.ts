import { useEffect, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useStore, type AwarenessUser } from '../store/useStore'
import { getIdToken } from '../auth/AuthProvider'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'

interface Connection {
  ydoc: Y.Doc
  provider: WebsocketProvider
  titleText: Y.Text
}

export interface Collaboration extends Connection {
  status: 'connecting' | 'connected' | 'disconnected'
}

/**
 * Sets up the Yjs document and y-websocket provider for a room, wires the local
 * user into awareness, and mirrors all participants' awareness state into the
 * Zustand store. Voice state (mute/speaking) is propagated over awareness so
 * it's the single source of truth across clients.
 *
 * Returns `null` until the connection is created. The doc/provider are created
 * and destroyed *inside* an effect (not memoized) so that React StrictMode's
 * mount → unmount → remount cycle correctly tears down and rebuilds them,
 * instead of leaving a destroyed provider behind.
 */
export function useCollaboration(roomId: string): Collaboration | null {
  const { peerId, name, color, setUsers, setDocTitle, inVoice, isMuted, isSpeaking } =
    useStore()

  const [conn, setConn] = useState<Connection | null>(null)
  const [status, setStatus] = useState<Collaboration['status']>('connecting')

  // Keep the latest voice/identity state in a ref so the awareness writer reads
  // fresh values without re-subscribing.
  const voiceRef = useRef({ inVoice, isMuted, isSpeaking })
  voiceRef.current = { inVoice, isMuted, isSpeaking }

  // Create the doc + provider for this room, and tear them down on unmount.
  // The Firebase ID token is sent as a query param so the server can verify
  // the connection and enforce document access.
  useEffect(() => {
    const ydoc = new Y.Doc()
    const titleText = ydoc.getText('title')
    let provider: WebsocketProvider | null = null
    let cancelled = false

    const onStatus = (e: { status: string }) => {
      setStatus(e.status === 'connected' ? 'connected' : 'disconnected')
    }

    void (async () => {
      const token = await getIdToken()
      if (cancelled) return
      provider = new WebsocketProvider(`${WS_URL}/yjs`, roomId, ydoc, {
        params: token ? { token } : {},
      })
      provider.on('status', onStatus)
      setConn({ ydoc, provider, titleText })
    })()

    return () => {
      cancelled = true
      provider?.off('status', onStatus)
      provider?.destroy()
      ydoc.destroy()
      setConn(null)
      setStatus('connecting')
    }
  }, [roomId])

  // Publish local awareness + mirror everyone's state into the store.
  useEffect(() => {
    if (!conn) return
    const { awareness } = conn.provider
    awareness.setLocalStateField('user', { peerId, name, color, ...voiceRef.current })

    const syncFromStates = () => {
      const list: AwarenessUser[] = []
      awareness.getStates().forEach((state, clientId) => {
        const u = (state as { user?: Record<string, unknown> }).user
        if (!u) return
        list.push({
          clientId,
          peerId: String(u.peerId ?? ''),
          name: String(u.name ?? 'Anonymous'),
          color: String(u.color ?? '#888'),
          isMuted: Boolean(u.isMuted),
          isSpeaking: Boolean(u.isSpeaking),
          inVoice: Boolean(u.inVoice),
          isSelf: clientId === awareness.clientID,
        })
      })
      setUsers(list)
    }

    awareness.on('change', syncFromStates)
    syncFromStates()
    return () => {
      awareness.off('change', syncFromStates)
      setUsers([])
    }
  }, [conn, peerId, name, color, setUsers])

  // Re-publish whenever identity or voice state changes.
  useEffect(() => {
    if (!conn) return
    conn.provider.awareness.setLocalStateField('user', {
      peerId,
      name,
      color,
      inVoice,
      isMuted,
      isSpeaking,
    })
  }, [conn, peerId, name, color, inVoice, isMuted, isSpeaking])

  // Mirror the shared title into the store for the header.
  useEffect(() => {
    if (!conn) return
    const { titleText } = conn
    const update = () => setDocTitle(titleText.toString() || 'Untitled document')
    titleText.observe(update)
    update()
    return () => titleText.unobserve(update)
  }, [conn, setDocTitle])

  return conn ? { ...conn, status } : null
}
