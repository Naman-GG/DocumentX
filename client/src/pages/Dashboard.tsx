import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Plus, LogOut, Moon, Sun, FileText, Loader2, MoreVertical, Pencil, Trash2, Users,
} from 'lucide-react'
import { useAuth } from '../auth/AuthProvider'
import { useStore } from '../store/useStore'
import { initialsOf } from '../utils/colors'
import { Modal } from '../components/UI/Modal'
import {
  createDocument, listMyDocuments, listSharedDocuments, updateTitle, deleteDocument,
  resolveAccess, type DocMeta,
} from '../lib/documents'

export function Dashboard() {
  const navigate = useNavigate()
  const { user, signOutUser } = useAuth()
  const { name, color, theme, toggleTheme } = useStore()

  const [mine, setMine] = useState<DocMeta[]>([])
  const [shared, setShared] = useState<DocMeta[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<DocMeta | null>(null)
  const [creating, setCreating] = useState(false)

  const load = useCallback(async () => {
    if (!user) return
    setLoading(true)
    setError(null)
    try {
      const [m, s] = await Promise.all([
        listMyDocuments(user.uid),
        listSharedDocuments(user.uid, user.email),
      ])
      setMine(m)
      setShared(s)
    } catch (e) {
      console.error(e)
      setError('Could not load your documents. Check your connection and Firestore rules.')
    } finally {
      setLoading(false)
    }
  }, [user])

  useEffect(() => {
    load()
  }, [load])

  const newDoc = async () => {
    if (!user || creating) return
    setCreating(true)
    try {
      const id = await createDocument(user)
      navigate(`/doc/${id}`)
    } catch (e) {
      console.error(e)
      setError('Could not create a document.')
      setCreating(false)
    }
  }

  const signOut = async () => {
    await signOutUser()
    navigate('/login', { replace: true })
  }

  const onDelete = async (d: DocMeta) => {
    if (!window.confirm(`Delete "${d.title}"? This can't be undone.`)) return
    await deleteDocument(d.id)
    load()
  }

  return (
    <div className="flex h-full flex-col bg-bg-secondary">
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-primary px-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
            <span className="document-title text-base leading-none">D</span>
          </div>
          <span className="text-sm font-semibold text-text-primary">DocumentX</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Toggle theme"
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-secondary"
          >
            {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
          </button>
          <div
            className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
            style={{ background: color }}
            title={name}
          >
            {initialsOf(name || '?')}
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex h-8 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium text-text-secondary hover:bg-bg-secondary"
          >
            <LogOut size={15} />
            <span className="hidden sm:inline">Sign out</span>
          </button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl flex-1 overflow-y-auto scroll-thin px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="document-title text-2xl text-text-primary">
              {greeting()}, {name?.split(' ')[0] || 'there'}
            </h1>
            <p className="text-sm text-text-secondary">Create and manage your documents</p>
          </div>
          <button
            type="button"
            onClick={newDoc}
            disabled={creating}
            className="flex items-center gap-2 rounded-lg bg-accent px-3.5 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {creating ? <Loader2 size={16} className="animate-spin-slow" /> : <Plus size={16} />}
            New document
          </button>
        </div>

        {error && (
          <div className="mb-4 rounded-md bg-red-subtle px-3 py-2 text-sm text-red">{error}</div>
        )}

        {loading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-text-secondary">
            <Loader2 size={20} className="animate-spin-slow" />
            <span className="text-sm">Loading documents…</span>
          </div>
        ) : (
          <div className="space-y-8">
            <Section title="My documents">
              {mine.length === 0 ? (
                <EmptyState onCreate={newDoc} />
              ) : (
                mine.map((d) => (
                  <DocRow
                    key={d.id}
                    doc={d}
                    onOpen={() => navigate(`/doc/${d.id}`)}
                    owner
                    onRename={() => setRenaming(d)}
                    onDelete={() => onDelete(d)}
                  />
                ))
              )}
            </Section>

            {shared.length > 0 && (
              <Section title="Shared with me">
                {shared.map((d) => (
                  <DocRow
                    key={d.id}
                    doc={d}
                    onOpen={() => navigate(`/doc/${d.id}`)}
                    roleLabel={roleLabel(d, user?.uid ?? null, user?.email ?? null)}
                  />
                ))}
              </Section>
            )}
          </div>
        )}
      </main>

      {/* Rename modal */}
      <RenameModal
        doc={renaming}
        onClose={() => setRenaming(null)}
        onSaved={() => {
          setRenaming(null)
          load()
        }}
      />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</h2>
      <div className="overflow-hidden rounded-xl border border-border bg-bg-primary">{children}</div>
    </section>
  )
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-center">
      <FileText size={26} className="text-text-muted" />
      <p className="text-sm text-text-secondary">No documents yet.</p>
      <button type="button" onClick={onCreate} className="text-sm font-medium text-accent hover:underline">
        Create your first document
      </button>
    </div>
  )
}

function DocRow({
  doc, onOpen, owner, roleLabel, onRename, onDelete,
}: {
  doc: DocMeta
  onOpen: () => void
  owner?: boolean
  roleLabel?: string
  onRename?: () => void
  onDelete?: () => void
}) {
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="group flex items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-bg-secondary">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 text-left">
        <FileText size={18} className="shrink-0 text-text-muted" />
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-text-primary">{doc.title}</p>
          <p className="truncate text-xs text-text-muted">
            {owner ? 'Owned by you' : `Shared by ${doc.ownerEmail}`}
            {doc.updatedAt ? ` · ${formatDate(doc.updatedAt)}` : ''}
          </p>
        </div>
      </button>

      {roleLabel && (
        <span className="hidden shrink-0 rounded-full bg-bg-tertiary px-2 py-0.5 text-xs text-text-secondary sm:inline">
          {roleLabel}
        </span>
      )}

      {owner && (
        <div className="relative shrink-0">
          <button
            type="button"
            aria-label="Document actions"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary opacity-0 hover:bg-bg-tertiary group-hover:opacity-100"
          >
            <MoreVertical size={16} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 z-20 mt-1 w-36 overflow-hidden rounded-lg border border-border bg-bg-primary py-1 shadow-lg">
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onRename?.() }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-text-primary hover:bg-bg-secondary"
                >
                  <Pencil size={14} /> Rename
                </button>
                <button
                  type="button"
                  onClick={() => { setMenuOpen(false); onDelete?.() }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-sm text-red hover:bg-red-subtle"
                >
                  <Trash2 size={14} /> Delete
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {!owner && <Users size={15} className="shrink-0 text-text-muted" />}
    </div>
  )
}

function RenameModal({
  doc, onClose, onSaved,
}: {
  doc: DocMeta | null
  onClose: () => void
  onSaved: () => void
}) {
  const [title, setTitle] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (doc) setTitle(doc.title)
  }, [doc])

  const save = async () => {
    if (!doc) return
    setBusy(true)
    await updateTitle(doc.id, title.trim() || 'Untitled document')
    setBusy(false)
    onSaved()
  }

  return (
    <Modal open={!!doc} title="Rename document" onClose={onClose}>
      <div className="space-y-3">
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && save()}
          className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
          placeholder="Document title"
        />
        <button
          type="button"
          onClick={save}
          disabled={busy}
          className="ml-auto flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-50"
        >
          {busy && <Loader2 size={14} className="animate-spin-slow" />}
          Save
        </button>
      </div>
    </Modal>
  )
}

function roleLabel(d: DocMeta, uid: string | null, email: string | null): string {
  const r = resolveAccess(d, uid, email)
  if (r === 'viewer') return 'Viewer'
  if (r === 'editor') return 'Editor'
  return 'Shared'
}

function greeting(): string {
  const h = new Date().getHours()
  if (h < 12) return 'Good morning'
  if (h < 18) return 'Good afternoon'
  return 'Good evening'
}

function formatDate(ms: number): string {
  const d = new Date(ms)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) {
    return `Today ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' })
}
