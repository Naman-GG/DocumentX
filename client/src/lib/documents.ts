import { v4 as uuidv4 } from 'uuid'
import {
  collection, doc, setDoc, getDoc, getDocs, query, where,
  updateDoc, deleteDoc, serverTimestamp, onSnapshot, Timestamp,
} from 'firebase/firestore'
import type { User } from 'firebase/auth'
import { db } from './firebase'

export type Role = 'owner' | 'editor' | 'viewer'
export type ShareRole = 'editor' | 'viewer'
export type LinkAccess = 'none' | 'viewer' | 'editor'

export interface Invite {
  email: string
  role: ShareRole
}

export interface DocMeta {
  id: string
  ownerId: string
  ownerEmail: string
  title: string
  createdAt: number | null
  updatedAt: number | null
  memberIds: string[]
  memberEmails: Record<string, string>
  roles: Record<string, ShareRole>
  invitedEmails: string[]
  invites: Invite[]
  linkAccess: LinkAccess
}

const COL = 'documents'

function toMillis(v: unknown): number | null {
  return v instanceof Timestamp ? v.toMillis() : null
}

function fromSnapshot(id: string, data: Record<string, unknown>): DocMeta {
  return {
    id,
    ownerId: String(data.ownerId ?? ''),
    ownerEmail: String(data.ownerEmail ?? ''),
    title: String(data.title ?? 'Untitled document'),
    createdAt: toMillis(data.createdAt),
    updatedAt: toMillis(data.updatedAt),
    memberIds: (data.memberIds as string[]) ?? [],
    memberEmails: (data.memberEmails as Record<string, string>) ?? {},
    roles: (data.roles as Record<string, ShareRole>) ?? {},
    invitedEmails: (data.invitedEmails as string[]) ?? [],
    invites: (data.invites as Invite[]) ?? [],
    linkAccess: (data.linkAccess as LinkAccess) ?? 'none',
  }
}

/** Resolve a user's role for a document. Mirrors the server-side check. */
export function resolveAccess(
  meta: DocMeta,
  uid: string | null,
  email: string | null
): Role | null {
  if (uid && meta.ownerId === uid) return 'owner'
  if (uid && meta.roles[uid]) return meta.roles[uid]
  if (email) {
    const e = email.toLowerCase()
    if (meta.invitedEmails.includes(e)) {
      return meta.invites.find((i) => i.email === e)?.role ?? 'editor'
    }
  }
  if (meta.linkAccess !== 'none') return meta.linkAccess
  return null
}

export async function createDocument(user: User): Promise<string> {
  const id = uuidv4()
  await setDoc(doc(db, COL, id), {
    ownerId: user.uid,
    ownerEmail: user.email ?? '',
    title: 'Untitled document',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    memberIds: [user.uid],
    memberEmails: { [user.uid]: user.email ?? '' },
    roles: {},
    invitedEmails: [],
    invites: [],
    linkAccess: 'none',
  })
  return id
}

export async function getDocument(id: string): Promise<DocMeta | null> {
  const snap = await getDoc(doc(db, COL, id))
  return snap.exists() ? fromSnapshot(snap.id, snap.data()) : null
}

/** Live updates for a single document's metadata (access/title changes). */
export function subscribeDocument(
  id: string,
  cb: (meta: DocMeta | null) => void
): () => void {
  return onSnapshot(
    doc(db, COL, id),
    (snap) => cb(snap.exists() ? fromSnapshot(snap.id, snap.data()) : null),
    () => cb(null)
  )
}

export async function listMyDocuments(uid: string): Promise<DocMeta[]> {
  // Sort client-side (by updatedAt desc) to avoid needing a composite index.
  const snap = await getDocs(query(collection(db, COL), where('ownerId', '==', uid)))
  return snap.docs
    .map((d) => fromSnapshot(d.id, d.data()))
    .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export async function listSharedDocuments(uid: string, email: string | null): Promise<DocMeta[]> {
  const byMember = getDocs(query(collection(db, COL), where('memberIds', 'array-contains', uid)))
  const byInvite = email
    ? getDocs(query(collection(db, COL), where('invitedEmails', 'array-contains', email.toLowerCase())))
    : Promise.resolve(null)

  const [memberSnap, inviteSnap] = await Promise.all([byMember, byInvite])
  const map = new Map<string, DocMeta>()
  for (const snap of [memberSnap, inviteSnap]) {
    snap?.docs.forEach((d) => {
      const meta = fromSnapshot(d.id, d.data())
      if (meta.ownerId !== uid) map.set(meta.id, meta) // exclude my own
    })
  }
  return Array.from(map.values()).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0))
}

export async function updateTitle(id: string, title: string): Promise<void> {
  await updateDoc(doc(db, COL, id), { title, updatedAt: serverTimestamp() })
}

export async function shareWithEmail(id: string, email: string, role: ShareRole): Promise<void> {
  const meta = await getDocument(id)
  if (!meta) return
  const e = email.trim().toLowerCase()
  const invites = meta.invites.filter((i) => i.email !== e)
  invites.push({ email: e, role })
  const invitedEmails = Array.from(new Set([...meta.invitedEmails, e]))
  await updateDoc(doc(db, COL, id), { invites, invitedEmails, updatedAt: serverTimestamp() })
}

export async function removeShare(id: string, email: string): Promise<void> {
  const meta = await getDocument(id)
  if (!meta) return
  const e = email.trim().toLowerCase()
  const invites = meta.invites.filter((i) => i.email !== e)
  const invitedEmails = meta.invitedEmails.filter((x) => x !== e)
  await updateDoc(doc(db, COL, id), { invites, invitedEmails, updatedAt: serverTimestamp() })
}

/** Revoke a resolved member's access (removes them from memberIds + roles). */
export async function removeMember(id: string, uid: string): Promise<void> {
  const meta = await getDocument(id)
  if (!meta) return
  const memberIds = meta.memberIds.filter((m) => m !== uid)
  const roles = { ...meta.roles }
  delete roles[uid]
  const memberEmails = { ...meta.memberEmails }
  delete memberEmails[uid]
  await updateDoc(doc(db, COL, id), { memberIds, memberEmails, roles, updatedAt: serverTimestamp() })
}

export async function setLinkAccess(id: string, linkAccess: LinkAccess): Promise<void> {
  await updateDoc(doc(db, COL, id), { linkAccess, updatedAt: serverTimestamp() })
}

export async function deleteDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, COL, id))
  // Best-effort cleanup of persisted Yjs state.
  await deleteDoc(doc(db, 'docState', id)).catch(() => {})
}
