import { useState, type ReactNode } from 'react'
import { Loader2, Mail, Lock, User as UserIcon, AlertCircle } from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { Modal } from './UI/Modal'

/** Map Firebase link errors to friendly messages. */
function friendlyError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? ''
  switch (code) {
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
    case 'auth/account-exists-with-different-credential':
      return 'An account already uses that email. Sign out and sign in to it instead — note that documents you created as a guest stay with the guest session.'
    case 'auth/weak-password':
      return 'Password should be at least 6 characters.'
    case 'auth/invalid-email':
      return 'That email address looks invalid.'
    case 'auth/popup-closed-by-user':
      return 'Sign-up was cancelled.'
    case 'auth/requires-recent-login':
      return 'Your guest session is too old to upgrade. Sign out and create an account.'
    default:
      return 'Something went wrong. Please try again.'
  }
}

/**
 * Converts the current anonymous guest into a permanent account by linking a
 * credential to the *same* uid — so every document the guest created stays
 * theirs.
 */
export function UpgradeAccountModal({
  open, onClose, onUpgraded,
}: {
  open: boolean
  onClose: () => void
  onUpgraded?: () => void
}) {
  const { upgradeWithEmail, upgradeWithGoogle } = useAuth()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const run = async (fn: () => Promise<void>) => {
    setError(null)
    setBusy(true)
    try {
      await fn()
      onUpgraded?.()
      onClose()
    } catch (err) {
      setError(friendlyError(err))
    } finally {
      setBusy(false)
    }
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    void run(() => upgradeWithEmail(email.trim(), password, name.trim() || email.split('@')[0]))
  }

  return (
    <Modal open={open} title="Save your work" onClose={onClose}>
      <p className="mb-4 text-sm text-text-secondary">
        Create an account to keep your documents, reach them from any device, and share them with
        others. Everything you've written as a guest carries over.
      </p>

      <form onSubmit={submit} className="space-y-3">
        <Field icon={<UserIcon size={15} />}>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            autoComplete="name"
            className={inputClass}
          />
        </Field>
        <Field icon={<Mail size={15} />}>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            className={inputClass}
          />
        </Field>
        <Field icon={<Lock size={15} />}>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="new-password"
            className={inputClass}
          />
        </Field>

        {error && (
          <div className="flex items-start gap-2 rounded-md bg-red-subtle px-3 py-2 text-xs text-red">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          {busy && <Loader2 size={15} className="animate-spin-slow" />}
          Create account
        </button>
      </form>

      <div className="my-4 flex items-center gap-3 text-xs text-text-muted">
        <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
      </div>

      <button
        type="button"
        onClick={() => void run(upgradeWithGoogle)}
        disabled={busy}
        className="flex w-full items-center justify-center gap-2.5 rounded-lg border border-border bg-bg-primary px-3 py-2.5 text-sm font-medium text-text-primary transition-colors hover:bg-bg-secondary disabled:opacity-50"
      >
        <GoogleIcon />
        Continue with Google
      </button>
    </Modal>
  )
}

const inputClass =
  'w-full bg-transparent py-2.5 pl-9 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:outline-none'

function Field({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="relative flex items-center rounded-lg border border-border focus-within:border-accent">
      <span className="pointer-events-none absolute left-3 text-text-muted">{icon}</span>
      {children}
    </div>
  )
}

function GoogleIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  )
}
