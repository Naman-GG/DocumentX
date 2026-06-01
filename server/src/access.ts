import { adminAuth, adminDb, FieldValue } from './firebase.js'

export interface AuthedUser {
  uid: string
  email: string | null
}

export type Role = 'owner' | 'editor' | 'viewer'

/** Verify a Firebase ID token; returns the user, or null if invalid/missing. */
export async function verifyToken(token?: string | null): Promise<AuthedUser | null> {
  if (!token) return null
  try {
    const decoded = await adminAuth.verifyIdToken(token)
    return { uid: decoded.uid, email: decoded.email ?? null }
  } catch {
    return null
  }
}

interface DocData {
  ownerId?: string
  memberIds?: string[]
  roles?: Record<string, 'editor' | 'viewer'>
  invitedEmails?: string[]
  invites?: { email: string; role: 'editor' | 'viewer' }[]
  linkAccess?: 'none' | 'viewer' | 'editor'
}

/**
 * Resolve a user's role for a document, authoritatively (server-side).
 * If the user was invited by email, they are promoted to a member on first
 * access so subsequent lookups (and the "shared with me" query) work by uid.
 * Returns null if the user has no access.
 */
export async function resolveAccess(
  docId: string,
  user: AuthedUser
): Promise<Role | null> {
  const ref = adminDb.collection('documents').doc(docId)
  const snap = await ref.get()
  if (!snap.exists) return null
  const data = (snap.data() ?? {}) as DocData

  if (data.ownerId === user.uid) return 'owner'
  if (data.roles?.[user.uid]) return data.roles[user.uid]

  const email = user.email?.toLowerCase() ?? null
  if (email && (data.invitedEmails ?? []).includes(email)) {
    const role = (data.invites ?? []).find((i) => i.email === email)?.role ?? 'editor'
    // Promote invited email → resolved member.
    await ref.update({
      memberIds: FieldValue.arrayUnion(user.uid),
      [`memberEmails.${user.uid}`]: email,
      [`roles.${user.uid}`]: role,
      invitedEmails: FieldValue.arrayRemove(email),
      invites: (data.invites ?? []).filter((i) => i.email !== email),
    })
    return role
  }

  if (data.linkAccess && data.linkAccess !== 'none') return data.linkAccess
  return null
}
