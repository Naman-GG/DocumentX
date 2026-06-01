import { useEffect, useRef } from 'react'
import { Mic, MicOff, PhoneOff, Headphones, AlertCircle } from 'lucide-react'
import { useVoice } from '../../hooks/useVoice'
import { useWebRTC } from './useWebRTC'
import { AudioVisualizer } from './AudioVisualizer'
import { useStore } from '../../store/useStore'
import { initialsOf } from '../../utils/colors'

/** Plays a remote peer's audio track. */
function RemoteAudio({ stream }: { stream: MediaStream }) {
  const ref = useRef<HTMLAudioElement>(null)
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream
  }, [stream])
  return <audio ref={ref} autoPlay playsInline />
}

interface VoicePanelProps {
  roomId: string
}

export function VoicePanel({ roomId }: VoicePanelProps) {
  const voice = useVoice()
  const remoteStreams = useWebRTC(roomId, voice.localStream, voice.inVoice)
  const { users, isSpeaking } = useStore()

  const voiceUsers = users.filter((u) => u.inVoice)

  return (
    <div className="border-t border-border px-3 py-4">
      <div className="mb-3 flex items-center gap-2">
        <Headphones size={15} className="text-text-secondary" />
        <h3 className="text-xs font-semibold uppercase tracking-wide text-text-secondary">
          Voice Chat
        </h3>
      </div>

      {/* Hidden audio sinks for remote peers */}
      {Object.entries(remoteStreams).map(([peerId, stream]) => (
        <RemoteAudio key={peerId} stream={stream} />
      ))}

      {voice.error && (
        <div className="mb-3 flex items-start gap-2 rounded-md bg-red-subtle px-2.5 py-2 text-xs text-red">
          <AlertCircle size={14} className="mt-0.5 shrink-0" />
          <span>{voice.error}</span>
        </div>
      )}

      {!voice.inVoice ? (
        <button
          type="button"
          onClick={voice.join}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover"
        >
          <Mic size={16} />
          Join Voice
        </button>
      ) : (
        <>
          <div className="mb-3 space-y-1.5">
            {voiceUsers.length === 0 && (
              <p className="text-xs text-text-muted">Waiting for others to join…</p>
            )}
            {voiceUsers.map((u) => (
              <div
                key={u.clientId}
                className="flex items-center gap-2.5 rounded-md px-1.5 py-1"
              >
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white ${
                    u.isSpeaking && !u.isMuted ? 'is-speaking' : ''
                  }`}
                  style={{ background: u.color }}
                >
                  {initialsOf(u.name)}
                </div>
                <span className="flex-1 truncate text-sm text-text-primary">
                  {u.name} {u.isSelf && <span className="text-text-muted">(you)</span>}
                </span>
                {u.isMuted ? (
                  <MicOff size={15} className="shrink-0 text-voice-muted" />
                ) : (
                  <Mic size={15} className="shrink-0 text-voice-active" />
                )}
              </div>
            ))}
          </div>

          {/* Local controls */}
          <div className="flex items-center justify-between gap-2 rounded-lg bg-bg-secondary px-3 py-2">
            <AudioVisualizer level={voice.level} active={voice.inVoice && !voice.isMuted} />
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={voice.isMuted ? 'Unmute microphone' : 'Mute microphone'}
                aria-pressed={voice.isMuted}
                onClick={voice.toggleMute}
                className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors ${
                  voice.isMuted
                    ? 'border-transparent bg-voice-muted text-white'
                    : 'border-voice-active bg-bg-primary text-voice-active hover:bg-green-subtle'
                }`}
              >
                {voice.isMuted ? <MicOff size={16} /> : <Mic size={16} />}
              </button>
              <button
                type="button"
                aria-label="Leave voice chat"
                onClick={voice.leave}
                className="flex h-9 items-center gap-1.5 rounded-full bg-red-subtle px-3 text-sm font-medium text-red transition-colors hover:bg-red hover:text-white"
              >
                <PhoneOff size={15} />
                Leave
              </button>
            </div>
          </div>
          {/* Subtle speaking hint */}
          {isSpeaking && !voice.isMuted && (
            <p className="mt-2 text-center text-[11px] text-voice-active">Speaking…</p>
          )}
        </>
      )}
    </div>
  )
}
