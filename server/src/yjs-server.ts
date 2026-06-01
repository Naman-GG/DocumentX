import type { IncomingMessage } from 'http'
import type { WebSocket } from 'ws'
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

/**
 * A self-contained y-websocket compatible server.
 *
 * We implement the y-websocket wire protocol directly (rather than importing
 * `y-websocket/bin/utils`, which ships no types and is awkward under ESM) so the
 * server has zero hidden moving parts. Each `roomId` maps to a single shared
 * Y.Doc kept in memory for as long as at least one client is connected.
 */

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

const PING_TIMEOUT = 30_000

class WSSharedDoc extends Y.Doc {
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
    // Broadcast awareness update to all connections.
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

function getYDoc(docName: string): WSSharedDoc {
  let doc = docs.get(docName)
  if (doc === undefined) {
    doc = new WSSharedDoc(docName)
    docs.set(docName, doc)
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
      // No more connections — drop the doc so memory is reclaimed.
      doc.destroy()
      docs.delete(doc.name)
    }
  }
  try {
    conn.close()
  } catch {
    /* already closed */
  }
}

function messageListener(conn: WebSocket, doc: WSSharedDoc, message: Uint8Array) {
  try {
    const encoder = encoding.createEncoder()
    const decoder = decoding.createDecoder(message)
    const messageType = decoding.readVarUint(decoder)
    switch (messageType) {
      case MESSAGE_SYNC: {
        encoding.writeVarUint(encoder, MESSAGE_SYNC)
        syncProtocol.readSyncMessage(decoder, encoder, doc, conn)
        // Only reply if there is something to send (sync step 1/2 responses).
        if (encoding.length(encoder) > 1) {
          send(doc, conn, encoding.toUint8Array(encoder))
        }
        break
      }
      case MESSAGE_AWARENESS: {
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

/**
 * Derive the room name from the connection URL. The client connects to
 * `ws://host/yjs/<roomId>`, so the room is the trailing path segment.
 */
function roomFromReq(req: IncomingMessage): string {
  const url = new URL(req.url ?? '/', `http://${req.headers.host}`)
  const parts = url.pathname.split('/').filter(Boolean) // ['yjs', '<roomId>']
  return parts[1] ?? 'default'
}

export function setupYjsServer(conn: WebSocket, req: IncomingMessage) {
  conn.binaryType = 'arraybuffer'
  const docName = roomFromReq(req)
  const doc = getYDoc(docName)
  doc.conns.set(conn, new Set())

  conn.on('message', (message: ArrayBuffer) => {
    messageListener(conn, doc, new Uint8Array(message))
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

  // Send initial sync step 1 so the client can reconcile its state.
  {
    const encoder = encoding.createEncoder()
    encoding.writeVarUint(encoder, MESSAGE_SYNC)
    syncProtocol.writeSyncStep1(encoder, doc)
    send(doc, conn, encoding.toUint8Array(encoder))

    // Send current awareness states to the newcomer.
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
}
