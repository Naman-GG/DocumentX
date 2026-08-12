import {
  createContext, useContext, useEffect, useReducer, useState, type ReactNode,
} from 'react'
import {
  onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, signInAnonymously, linkWithCredential, linkWithPopup,
  EmailAuthProvider, GoogleAuthProvider, updateProfile, signOut, type User,
} from 'firebase/auth'
import { Navigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { auth } from '../lib/firebase'
import { useStore } from '../store/useStore'
import { getTabId } from '../utils/identity'
import { colorForUid } from '../utils/colors'
import { backfillOwnerEmail } from '../lib/documents'

interface AuthContextValue {
  user: User | null
  loading: boolean
  /** True while signed in as an anonymous ("continue without login") guest. */
  isGuest: boolean
  signUpEmail: (email: string, password: string, name: string) => Promise<void>
  signInEmail: (email: string, password: string) => Promise<void>
  signInGoogle: () => Promise<void>
  signInGuest: () => Promise<void>
  /** Upgrade the current guest to a permanent account, keeping their documents. */
  upgradeWithEmail: (email: string, password: string, name: string) => Promise<void>
  upgradeWithGoogle: () => Promise<void>
  signOutUser: () => Promise<void>
  updateName: (name: string) => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

/** Mirror the authenticated user into the identity fields of the UI store. */
function syncIdentity(u: User | null) {
  const { setIdentity } = useStore.getState()
  if (!u) {
    setIdentity({ peerId: '', name: '', color: '#2563EB' })
    return
  }
  const name = u.displayName || u.email?.split('@')[0] || (u.isAnonymous ? 'Guest' : 'User')
  setIdentity({ peerId: `${u.uid}:${getTabId()}`, name, color: colorForUid(u.uid) })
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [, force] = useReducer((n: number) => n + 1, 0)

  useEffect(() => {
    return onAuthStateChanged(auth, (u) => {
      setUser(u)
      setLoading(false)
      syncIdentity(u)
    })
  }, [])

  const value: AuthContextValue = {
    user,
    loading,
    isGuest: !!user?.isAnonymous,
    async signUpEmail(email, password, name) {
      const cred = await createUserWithEmailAndPassword(auth, email, password)
      await updateProfile(cred.user, { displayName: name })
      syncIdentity(cred.user)
      force()
    },
    async signInEmail(email, password) {
      await signInWithEmailAndPassword(auth, email, password)
    },
    async signInGoogle() {
      await signInWithPopup(auth, new GoogleAuthProvider())
    },
    async signInGuest() {
      const cred = await signInAnonymously(auth)
      // Give the guest a readable display name (used in awareness/avatars).
      await updateProfile(cred.user, { displayName: 'Guest' })
      syncIdentity(cred.user)
      force()
    },
    async upgradeWithEmail(email, password, name) {
      const current = auth.currentUser
      if (!current) throw new Error('No guest session to upgrade.')
      const cred = await linkWithCredential(current, EmailAuthProvider.credential(email, password))
      await updateProfile(cred.user, { displayName: name })
      await backfillOwnerEmail(cred.user)
      syncIdentity(cred.user)
      force()
    },
    async upgradeWithGoogle() {
      const current = auth.currentUser
      if (!current) throw new Error('No guest session to upgrade.')
      const cred = await linkWithPopup(current, new GoogleAuthProvider())
      await backfillOwnerEmail(cred.user)
      syncIdentity(cred.user)
      force()
    },
    async signOutUser() {
      await signOut(auth)
    },
    async updateName(name) {
      if (!auth.currentUser) return
      await updateProfile(auth.currentUser, { displayName: name })
      syncIdentity(auth.currentUser)
      force()
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within <AuthProvider>')
  return ctx
}

/** Returns a fresh Firebase ID token for authenticating WebSocket connections. */
export async function getIdToken(): Promise<string | null> {
  return auth.currentUser ? auth.currentUser.getIdToken() : null
}

/** Route guard: redirects unauthenticated users to /login (preserving destination). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth()
  const location = useLocation()

  if (loading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
        <Loader2 size={28} className="animate-spin-slow text-accent" />
        <p className="text-sm">Loading…</p>
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  return <>{children}</>
}
