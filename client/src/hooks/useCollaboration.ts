import { useEffect, useMemo, useRef, useState } from 'react'
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'
import { useStore, type AwarenessUser } from '../store/useStore'

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3001'

export interface Collaboration {
  ydoc: Y.Doc
  provider: WebsocketProvider
  status: 'connecting' | 'connected' | 'disconnected'
  /** Shared document title (Y.Text). */
  titleText: Y.Text
}

/**
 * Sets up the Yjs document and y-websocket provider for a room, wires the local
 * user into awareness, and mirrors all participants' awareness state into the
 * Zustand store. Voice state (mute/speaking) is also propagated over awareness
 * so it's the single source of truth across clients.
 */
export function useCollaboration(roomId: string): Collaboration {
  const { peerId, name, color, setUsers, setDocTitle, inVoice, isMuted, isSpeaking } =
    useStore()

  // Create the doc + provider exactly once per room.
  const { ydoc, provider, titleText } = useMemo(() => {
    const doc = new Y.Doc()
    const prov = new WebsocketProvider(`${WS_URL}/yjs`, roomId, doc)
    return { ydoc: doc, provider: prov, titleText: doc.getText('title') }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId])

  const [status, setStatus] = useState<Collaboration['status']>('connecting')

  // Keep the latest voice state in a ref so the awareness writer always reads
  // fresh values without re-subscribing.
  const voiceRef = useRef({ inVoice, isMuted, isSpeaking })
  voiceRef.current = { inVoice, isMuted, isSpeaking }

  // Connection status.
  useEffect(() => {
    const onStatus = (e: { status: string }) => {
      setStatus(e.status === 'connected' ? 'connected' : 'disconnected')
    }
    provider.on('status', onStatus)
    return () => provider.off('status', onStatus)
  }, [provider])

  // Publish + maintain local awareness state.
  useEffect(() => {
    const { awareness } = provider
    awareness.setLocalStateField('user', {
      peerId,
      name,
      color,
      ...voiceRef.current,
    })

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
    return () => awareness.off('change', syncFromStates)
  }, [provider, peerId, name, color, setUsers])

  // Re-publish whenever identity or voice state changes.
  useEffect(() => {
    provider.awareness.setLocalStateField('user', {
      peerId,
      name,
      color,
      inVoice,
      isMuted,
      isSpeaking,
    })
  }, [provider, peerId, name, color, inVoice, isMuted, isSpeaking])

  // Mirror the shared title into the store for the header.
  useEffect(() => {
    const update = () => setDocTitle(titleText.toString() || 'Untitled document')
    titleText.observe(update)
    update()
    return () => titleText.unobserve(update)
  }, [titleText, setDocTitle])

  // Tear down on unmount.
  useEffect(() => {
    return () => {
      provider.destroy()
      ydoc.destroy()
    }
  }, [provider, ydoc])

  return { ydoc, provider, status, titleText }
}
