import { useStore } from '../../store/useStore'
import { initialsOf } from '../../utils/colors'

/**
 * Stacked presence avatars for remote collaborators currently in the document.
 * The live caret + name labels themselves are drawn by Tiptap's
 * CollaborationCursor extension; this is the at-a-glance "who's here" overlay.
 */
export function CollaboratorCursors() {
  const users = useStore((s) => s.users)
  const remote = users.filter((u) => !u.isSelf)

  if (remote.length === 0) return null

  return (
    <div className="pointer-events-none absolute right-4 top-4 flex -space-x-2">
      {remote.slice(0, 5).map((u) => (
        <div
          key={u.clientId}
          title={u.name}
          className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg-primary text-[10px] font-semibold text-white animate-fade-in"
          style={{ background: u.color }}
        >
          {initialsOf(u.name)}
        </div>
      ))}
      {remote.length > 5 && (
        <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-bg-primary bg-bg-tertiary text-[10px] font-semibold text-text-secondary">
          +{remote.length - 5}
        </div>
      )}
    </div>
  )
}
