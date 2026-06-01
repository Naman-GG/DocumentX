import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'
import { verifyToken, resolveAccess, type Role } from './access.js'

/**
 * A self-contained y-websocket compatible server with Firebase auth and
 * role-based access:
 *  - Every connection must present a valid Firebase ID token (`?token=`) and
 *    have access to the document (owner/editor/viewer); others are rejected.
 *  - `viewer` connections receive document state but their inbound updates are
 *    dropped, enforcing read-only at the protocol level (not just the UI).
 *
 * Each `docId` maps to one shared Y.Doc kept in memory while clients are
 * connected. (Durable persistence is layered on in yjs-persistence.)
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

const PING_TIMEOUT = 30_000

export class WSSharedDoc extends Y.Doc {
  name: string
  conns: Map<WebSocket, Set<number>>
  awareness: awarenessProtocol.Awareness

  constructor(name: string) {
    super({ gc: true })
    this.name = name
    this.conns = new Map()
    this.awareness = new awarenessProtocol.Awareness(this)
    this.awareness.setLocalState(null)

    this.awareness.on('update', this.awarenessChangeHandler)
    this.on('update', this.updateHandler)
  }

  private awarenessChangeHandler = (
    { added, updated, removed }: { added: number[]; updated: number[]; removed: number[] },
    conn: WebSocket | null
  ) => {
    const changedClients = added.concat(updated, removed)
    if (conn !== null) {
      const connControlledIDs = this.conns.get(conn)
      if (connControlledIDs !== undefined) {
        added.forEach((clientID) => connControlledIDs.add(clientID))
        removed.forEach((clientID) => connControlledIDs.delete(clientID))
      }
    }
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
    encoding.writeVarUint8Array(
      encoder,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
    )
    const buff = encoding.toUint8Array(encoder)
    this.conns.forEach((_, c) => send(this, c, buff))
  }

  private updateHandler = (update: Uint8Array, _origin: unknown) => {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeUpdate(encoder, update)
    const message = encoding.toUint8Array(encoder)
    this.conns.forEach((_, conn) => send(this, conn, message))
  }
}

const docs = new Map<string, WSSharedDoc>()

/** Hook points for durable persistence (wired up in yjs-persistence). */
export interface PersistenceHooks {
  bindState?: (doc: WSSharedDoc) => Promise<void>
  writeState?: (doc: WSSharedDoc) => Promise<void>
}
let persistence: PersistenceHooks = {}
export function setPersistence(hooks: PersistenceHooks) {
  persistence = hooks
}

async function getYDoc(docName: string): Promise<WSSharedDoc> {
  let doc = docs.get(docName)
  if (doc === undefined) {
    doc = new WSSharedDoc(docName)
    docs.set(docName, doc)
    if (persistence.bindState) {
      await persistence.bindState(doc)
    }
  }
  return doc
}

function send(doc: WSSharedDoc, conn: WebSocket, message: Uint8Array) {
  if (conn.readyState !== conn.OPEN) {
    closeConn(doc, conn)
    return
  }
  try {
    conn.send(message, (err) => {
      if (err != null) closeConn(doc, conn)
    })
  } catch {
    closeConn(doc, conn)
  }
}

function closeConn(doc: WSSharedDoc, conn: WebSocket) {
  const controlledIds = doc.conns.get(conn)
  if (controlledIds !== undefined) {
    doc.conns.delete(conn)
    awarenessProtocol.removeAwarenessStates(doc.awareness, Array.from(controlledIds), null)
    if (doc.conns.size === 0) {
      // Persist a final snapshot, then drop the doc to reclaim memory.
      const finalize = persistence.writeState
        ? persistence.writeState(doc)
        : Promise.resolve()
      finalize.finally(() => {
        if (doc.conns.size === 0) {
          doc.destroy()
          docs.delete(doc.name)
        }
      })
    }
  }
  try {
    conn.close()
  } catch {
    /* already closed */
  }
}

function messageListener(
  conn: WebSocket,
  doc: WSSharedDoc,
  message: Uint8Array,
  role: Role
) {
  try {
    const encoder = encoding.createEncoder()
    const decoder = decoding.createDecoder(message)
    const messageType = decoding.readVarUint(decoder)
    switch (messageType) {
      case MESSAGE_SYNC: {
        encoding.writeVarUint(encoder, MESSAGE_SYNC)
        const syncType = decoding.readVarUint(decoder)
        if (syncType === syncProtocol.messageYjsSyncStep1) {
          // Client requests our state — always answer (read access).
          syncProtocol.readSyncStep1(decoder, encoder, doc)
        } else if (syncType === syncProtocol.messageYjsSyncStep2) {
          // Client sending updates — viewers are not allowed to write.
          if (role !== 'viewer') syncProtocol.readSyncStep2(decoder, doc, conn)
        } else if (syncType === syncProtocol.messageYjsUpdate) {
          if (role !== 'viewer') syncProtocol.readUpdate(decoder, doc, conn)
        }
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder))
        }
        break
      }
      case MESSAGE_AWARENESS: {
        // Awareness (cursors/presence) is allowed for everyone, including viewers.
        awarenessProtocol.applyAwarenessUpdate(
          doc.awareness,
          decoding.readVarUint8Array(decoder),
          conn
        )
        break
      }
    }
  } catch (err) {
    console.error('[yjs] message handling error', err)
  }
}

function parseConn(req: IncomingMessage): { docName: string; token: string | null } {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean) // ['yjs', '<docId>']
  return { docName: parts[1] ?? 'default', token: url.searchParams.get('token') }
}

export function setupYjsServer(conn: WebSocket, req: IncomingMessage) {
  conn.binaryType = 'arraybuffer'
  const { docName, token } = parseConn(req)

  // Buffer any messages that arrive while we authenticate, then replay them.
  const buffered: ArrayBuffer[] = []
  const onEarly = (m: ArrayBuffer) => buffered.push(m)
  conn.on('message', onEarly)

  ;(async () => {
    const user = await verifyToken(token)
    if (!user) {
      conn.close(1008, 'unauthorized')
      return
    }
    const role = await resolveAccess(docName, user)
    if (!role) {
      conn.close(1008, 'forbidden')
      return
    }

    const doc = await getYDoc(docName)
    doc.conns.set(conn, new Set())
    conn.off('message', onEarly)

    conn.on('message', (message: ArrayBuffer) => {
      messageListener(conn, doc, new Uint8Array(message), role)
    })

    // Liveness check — terminate dead connections.
    let pongReceived = true
    const pingInterval = setInterval(() => {
      if (!pongReceived) {
        if (doc.conns.has(conn)) closeConn(doc, conn)
        clearInterval(pingInterval)
        return
      }
      if (doc.conns.has(conn)) {
        pongReceived = false
        try {
          conn.ping()
        } catch {
          closeConn(doc, conn)
          clearInterval(pingInterval)
        }
      }
    }, PING_TIMEOUT)
    conn.on('pong', () => {
      pongReceived = true
    })
    conn.on('close', () => {
      closeConn(doc, conn)
      clearInterval(pingInterval)
    })

    // Send initial sync step 1 + current awareness to the newcomer.
    {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(encoder, doc)
      send(doc, conn, encoding.toUint8Array(encoder))

      const awarenessStates = doc.awareness.getStates()
      if (awarenessStates.size > 0) {
        const awEncoder = encoding.createEncoder()
        encoding.writeVarUint(awEncoder, MESSAGE_AWARENESS)
        encoding.writeVarUint8Array(
          awEncoder,
          awarenessProtocol.encodeAwarenessUpdate(
            doc.awareness,
            Array.from(awarenessStates.keys())
          )
        )
        send(doc, conn, encoding.toUint8Array(awEncoder))
      }
    }

    // Replay anything buffered during authentication.
    for (const m of buffered) {
      messageListener(conn, doc, new Uint8Array(m), role)
    }
  })().catch((err) => {
    console.error('[yjs] connection setup failed', err)
    try {
      conn.close(1011, 'server error')
    } catch {
      /* noop */
    }
  })
}
