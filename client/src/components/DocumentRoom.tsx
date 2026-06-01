import { Loader2 } from 'lucide-react'
import { useCollaboration, type Collaboration } from '../hooks/useCollaboration'
import { useDocumentEditor, EditorCore } from './Editor/EditorCore'
import { Toolbar } from './Editor/Toolbar'
import { Header } from './Header'
import { UsersList } from './Sidebar/UsersList'
import { VoicePanel } from './VoiceChat/VoicePanel'
import { AIPanel } from './AI/AIPanel'
import { ErrorBoundary } from './ErrorBoundary'
import { useStore } from '../store/useStore'

interface DocumentRoomProps {
  roomId: string
}

/** Top-level workspace for a single document room. */
export function DocumentRoom({ roomId }: DocumentRoomProps) {
  const collab = useCollaboration(roomId)

  if (!collab) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 text-text-secondary">
        <Loader2 size={28} className="animate-spin-slow text-accent" />
        <p className="text-sm">Connecting to the document…</p>
      </div>
    )
  }

  // Keyed by the doc so the editor is rebuilt if the connection is recreated.
  return <RoomWorkspace key={collab.ydoc.guid} roomId={roomId} collab={collab} />
}

function RoomWorkspace({ roomId, collab }: { roomId: string; collab: Collaboration }) {
  const editor = useDocumentEditor(collab.ydoc, collab.provider)
  const sidebarOpen = useStore((s) => s.sidebarOpen)

  return (
    <div className="flex h-full flex-col">
      <Header titleText={collab.titleText} status={collab.status} />
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
          <VoicePanel roomId={roomId} />
        </aside>

        <AIPanel editor={editor} />
      </div>
    </div>
  )
}
