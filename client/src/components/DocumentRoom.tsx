import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Loader2, Lock } from 'lucide-react'
import { useCollaboration, type Collaboration } from '../hooks/useCollaboration'
import { useDocumentEditor, EditorCore } from './Editor/EditorCore'
import { Toolbar } from './Editor/Toolbar'
import { Header } from './Header'
import { UsersList } from './Sidebar/UsersList'
import { VoicePanel } from './VoiceChat/VoicePanel'
import { AIPanel } from './AI/AIPanel'
import { ShareModal } from './ShareModal'
import { ErrorBoundary } from './ErrorBoundary'
import { useStore } from '../store/useStore'
import { useAuth } from '../auth/AuthProvider'
import { subscribeDocument, resolveAccess, updateTitle, type DocMeta, type Role } from '../lib/documents'

type AccessState = 'loading' | 'ok' | 'noaccess'

interface DocumentRoomProps {
  docId: string
}

/** Loads document metadata, resolves the user's role, and gates the editor. */
export function DocumentRoom({ docId }: DocumentRoomProps) {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [state, setState] = useState<AccessState>('loading')
  const [meta, setMeta] = useState<DocMeta | null>(null)
  const [role, setRole] = useState<Role | null>(null)

  useEffect(() => {
    if (!user) return
    setState('loading')
    // Live subscription so access changes (e.g. revoked sharing) take effect.
    const unsub = subscribeDocument(docId, (m) => {
      if (!m) {
        setState('noaccess')
        return
      }
      const r = resolveAccess(m, user.uid, user.email)
      if (!r) {
        setState('noaccess')
        return
      }
      setMeta(m)
      setRole(r)
      setState('ok')
    })
    return unsub
  }, [docId, user])

  if (state === 'loading') {
    return <CenteredMessage spinner text="Opening document…" />
  }
  if (state === 'noaccess' || !meta || !role) {
    return (
      <CenteredMessage
        icon={<Lock size={28} className="text-text-muted" />}
        text="This document doesn't exist, or you don't have access to it."
        action={{ label: 'Back to my documents', onClick: () => navigate('/') }}
      />
    )
  }

  return <RoomGate docId={docId} role={role} meta={meta} />
}

/** Establishes the collaboration connection once access is confirmed. */
function RoomGate({ docId, role, meta }: { docId: string; role: Role; meta: DocMeta }) {
  const collab = useCollaboration(docId)
  if (!collab) return <CenteredMessage spinner text="Connecting…" />
  return <RoomWorkspace key={collab.ydoc.guid} docId={docId} collab={collab} role={role} meta={meta} />
}

function RoomWorkspace({
  docId, collab, role, meta,
}: {
  docId: string
  collab: Collaboration
  role: Role
  meta: DocMeta
}) {
  const editable = role !== 'viewer'
  const editor = useDocumentEditor(collab.ydoc, collab.provider, editable)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const docTitle = useStore((s) => s.docTitle)
  const [shareOpen, setShareOpen] = useState(false)
  const titleTimer = useRef<number | null>(null)

  // Sync the (Yjs) title into Firestore so it shows on the dashboard.
  // Debounced; only editors/owners may write (server + rules also enforce this).
  useEffect(() => {
    if (!editable) return
    if (titleTimer.current) window.clearTimeout(titleTimer.current)
    titleTimer.current = window.setTimeout(() => {
      if (docTitle && docTitle !== meta.title) {
        updateTitle(docId, docTitle).catch(() => {})
      }
    }, 1500)
    return () => {
      if (titleTimer.current) window.clearTimeout(titleTimer.current)
    }
  }, [docTitle, editable, docId, meta.title])

  return (
    <div className="flex h-full flex-col">
      <Header
        titleText={collab.titleText}
        status={collab.status}
        role={role}
        canShare={role === 'owner'}
        onShare={() => setShareOpen(true)}
      />
      <Toolbar editor={editor} />

      <div className="relative flex min-h-0 flex-1">
        <ErrorBoundary>
          <main className="flex min-w-0 flex-1 flex-col bg-bg-secondary">
            <EditorCore editor={editor} />
          </main>
        </ErrorBoundary>

        {/* Sidebar — always mounted (keeps voice alive); visibility toggled. */}
        <aside
          className={`${
            sidebarOpen ? 'flex' : 'hidden'
          } w-60 shrink-0 flex-col overflow-y-auto scroll-thin border-l border-border bg-bg-primary`}
        >
          <UsersList />
          <VoicePanel roomId={docId} />
        </aside>

        <AIPanel editor={editor} />
      </div>

      {role === 'owner' && (
        <ShareModal open={shareOpen} onClose={() => setShareOpen(false)} meta={meta} />
      )}
    </div>
  )
}

function CenteredMessage({
  text, spinner, icon, action,
}: {
  text: string
  spinner?: boolean
  icon?: React.ReactNode
  action?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-6 text-center text-text-secondary">
      {spinner && <Loader2 size={26} className="animate-spin-slow text-accent" />}
      {icon}
      <p className="max-w-sm text-sm">{text}</p>
      {action && (
        <button
          type="button"
          onClick={action.onClick}
          className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
        >
          {action.label}
        </button>
      )}
    </div>
  )
}
