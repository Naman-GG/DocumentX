import { useState } from 'react'
import { Link2, Copy, Check, X, UserPlus, Globe } from 'lucide-react'
import { Modal } from './UI/Modal'
import {
  shareWithEmail, removeShare, removeMember, setLinkAccess,
  type DocMeta, type ShareRole, type LinkAccess,
} from '../lib/documents'

interface ShareModalProps {
  open: boolean
  onClose: () => void
  meta: DocMeta
}

export function ShareModal({ open, onClose, meta }: ShareModalProps) {
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<ShareRole>('editor')
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const link = `${window.location.origin}/doc/${meta.id}`

  const add = async () => {
    const e = email.trim().toLowerCase()
    if (!e || !e.includes('@')) {
      setError('Enter a valid email address.')
      return
    }
    if (e === meta.ownerEmail.toLowerCase()) {
      setError('That person is the owner.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await shareWithEmail(meta.id, e, role)
      setEmail('')
    } catch {
      setError('Could not share. Try again.')
    } finally {
      setBusy(false)
    }
  }

  const copy = async () => {
    await navigator.clipboard.writeText(link).catch(() => {})
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const members = meta.memberIds.filter((uid) => uid !== meta.ownerId)

  return (
    <Modal open={open} title="Share document" onClose={onClose}>
      <div className="space-y-4">
        {/* Add people */}
        <div className="flex gap-2">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && add()}
            placeholder="Add people by email"
            className="min-w-0 flex-1 rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as ShareRole)}
            className="rounded-lg border border-border bg-bg-primary px-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            aria-label="Role for invited person"
          >
            <option value="editor">Editor</option>
            <option value="viewer">Viewer</option>
          </select>
          <button
            type="button"
            aria-label="Add person"
            onClick={add}
            disabled={busy}
            className="flex items-center gap-1.5 rounded-lg bg-accent px-3 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
          >
            <UserPlus size={15} />
          </button>
        </div>
        {error && <p className="text-xs text-red">{error}</p>}

        {/* People with access */}
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
            People with access
          </p>
          <Row email={meta.ownerEmail} sub="Owner" />
          {members.map((uid) => (
            <Row
              key={uid}
              email={meta.memberEmails[uid] || 'Member'}
              sub={meta.roles[uid] === 'viewer' ? 'Viewer' : 'Editor'}
              onRemove={() => removeMember(meta.id, uid)}
            />
          ))}
          {meta.invites.map((inv) => (
            <Row
              key={inv.email}
              email={inv.email}
              sub={`${inv.role === 'viewer' ? 'Viewer' : 'Editor'} · pending`}
              onRemove={() => removeShare(meta.id, inv.email)}
            />
          ))}
        </div>

        {/* General / link access */}
        <div className="space-y-2 border-t border-border pt-3">
          <div className="flex items-center gap-2">
            <Globe size={15} className="text-text-secondary" />
            <span className="text-sm font-medium text-text-primary">Anyone with the link</span>
            <select
              value={meta.linkAccess}
              onChange={(e) => setLinkAccess(meta.id, e.target.value as LinkAccess)}
              className="ml-auto rounded-lg border border-border bg-bg-primary px-2 py-1 text-sm text-text-primary focus:border-accent focus:outline-none"
              aria-label="Link access"
            >
              <option value="none">No access</option>
              <option value="viewer">Can view</option>
              <option value="editor">Can edit</option>
            </select>
          </div>
          <button
            type="button"
            onClick={copy}
            className="flex w-full items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-text-primary hover:bg-bg-secondary"
          >
            {copied ? <Check size={15} className="text-green" /> : <Link2 size={15} />}
            <span className="truncate">{copied ? 'Link copied!' : link}</span>
            {!copied && <Copy size={14} className="ml-auto shrink-0 text-text-muted" />}
          </button>
          {meta.linkAccess !== 'none' && (
            <p className="text-xs text-text-muted">
              Anyone with the link can {meta.linkAccess === 'editor' ? 'edit' : 'view'} this document.
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}

function Row({
  email, sub, onRemove,
}: {
  email: string
  sub: string
  onRemove?: () => void
}) {
  return (
    <div className="flex items-center gap-2 rounded-md px-1 py-1.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-bg-tertiary text-[11px] font-semibold text-text-secondary">
        {(email[0] || '?').toUpperCase()}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm text-text-primary">{email}</p>
        <p className="text-xs text-text-muted">{sub}</p>
      </div>
      {onRemove && (
        <button
          type="button"
          aria-label={`Remove ${email}`}
          onClick={onRemove}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-muted hover:bg-red-subtle hover:text-red"
        >
          <X size={15} />
        </button>
      )}
    </div>
  )
}
