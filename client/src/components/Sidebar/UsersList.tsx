import { Mic, MicOff, Circle } from 'lucide-react'
import { useStore } from '../../store/useStore'
import { initialsOf } from '../../utils/colors'

/** Online users with avatar, cursor color, and live voice status. */
export function UsersList() {
  const users = useStore((s) => s.users)
  // Sort: self first, then alphabetical.
  const sorted = [...users].sort((a, b) => {
    if (a.isSelf !== b.isSelf) return a.isSelf ? -1 : 1
    return a.name.localeCompare(b.name)
  })

  return (
    <div className="px-3 py-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Online
        </h3>
        <span className="rounded-full bg-bg-tertiary px-2 py-0.5 text-xs font-medium text-text-secondary">
          {users.length}
        </span>
      </div>

      <div className="space-y-0.5">
        {sorted.map((u) => (
          <div
            key={u.clientId}
            className="flex items-center gap-2.5 rounded-md px-1.5 py-1.5 animate-fade-in hover:bg-bg-secondary"
          >
            <div className="relative shrink-0">
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                style={{ background: u.color }}
              >
                {initialsOf(u.name)}
              </div>
              <Circle
                size={9}
                className="absolute -bottom-0.5 -right-0.5 fill-voice-active text-bg-primary"
                strokeWidth={3}
              />
            </div>
            <span className="flex-1 truncate text-sm text-text-primary">
              {u.name} {u.isSelf && <span className="text-text-muted">(you)</span>}
            </span>
            {u.inVoice &&
              (u.isMuted ? (
                <MicOff size={14} className="shrink-0 text-voice-muted" />
              ) : (
                <Mic
                  size={14}
                  className={`shrink-0 ${u.isSpeaking ? 'text-voice-active' : 'text-text-muted'}`}
                />
              ))}
          </div>
        ))}
      </div>
    </div>
  )
}
