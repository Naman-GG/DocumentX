import * as Y from 'yjs'
import { adminDb, FieldValue } from './firebase.js'
import { setPersistence, type WSSharedDoc } from './yjs-server.js'

/**
 * Durable persistence for Yjs documents, backed by Firestore (`docState/{docId}`).
 * The compacted document state is stored as a base64 blob; it's loaded when a
 * room is first opened and saved (debounced) as edits happen, plus a final save
 * when the last client disconnects. This is what lets documents survive server
 * restarts and Render's idle sleep.
 */

const SAVE_DEBOUNCE_MS = 3000
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>()

const toBase64 = (u8: Uint8Array) => Buffer.from(u8).toString('base64')
const fromBase64 = (s: string) => new Uint8Array(Buffer.from(s, 'base64'))

async function loadState(doc: WSSharedDoc): Promise<void> {
  const snap = await adminDb.collection('docState').doc(doc.name).get()
  const update = snap.data()?.update as string | undefined
  if (update) {
    // Origin 'persistence' so our save handler doesn't echo this back as a write.
    Y.applyUpdate(doc, fromBase64(update), 'persistence')
  }
}

async function saveState(doc: WSSharedDoc): Promise<void> {
  const update = Y.encodeStateAsUpdate(doc)
  await adminDb.collection('docState').doc(doc.name).set({
    update: toBase64(update),
    updatedAt: FieldValue.serverTimestamp(),
  })
  // Bump the document's updatedAt so the dashboard can sort by recent activity.
  await adminDb
    .collection('documents')
    .doc(doc.name)
    .update({ updatedAt: FieldValue.serverTimestamp() })
    .catch(() => {})
}

function scheduleSave(doc: WSSharedDoc): void {
  const existing = saveTimers.get(doc.name)
  if (existing) clearTimeout(existing)
  saveTimers.set(
    doc.name,
    setTimeout(() => {
      saveTimers.delete(doc.name)
      saveState(doc).catch((err) => console.error('[persist] save failed', err))
    }, SAVE_DEBOUNCE_MS)
  )
}

export function initPersistence(): void {
  setPersistence({
    bindState: async (doc) => {
      await loadState(doc)
      doc.on('update', (_update: Uint8Array, origin: unknown) => {
        if (origin === 'persistence') return // ignore our own load
        scheduleSave(doc)
      })
    },
    writeState: async (doc) => {
      const t = saveTimers.get(doc.name)
      if (t) {
        clearTimeout(t)
        saveTimers.delete(doc.name)
      }
      await saveState(doc).catch((err) => console.error('[persist] final save failed', err))
    },
  })
}
