import { useCollaboration } from '../hooks/useCollaboration'
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
  const { ydoc, provider, status, titleText } = useCollaboration(roomId)
  const editor = useDocumentEditor(ydoc, provider)
  const sidebarOpen = useStore((s) => s.sidebarOpen)

  return (
    <div className="flex h-full flex-col">
      <Header titleText={titleText} status={status} />
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
