import { useCallback, useEffect, useRef, useState } from 'react'
import { useStore } from '../store/useStore'

export interface VoiceControls {
  localStream: MediaStream | null
  inVoice: boolean
  isMuted: boolean
  /** Local microphone amplitude, 0–1, for the visualizer. */
  level: number
  join: () => Promise<void>
  leave: () => void
  toggleMute: () => void
  error: string | null
}

const SPEAKING_THRESHOLD = 20 // out of 255

/**
 * Owns the local microphone: capture, mute (disables the audio track without
 * stopping the stream), and real-time speaking detection via the Web Audio API.
 * Speaking/mute state is pushed into the store, which propagates over Yjs
 * awareness so every peer sees it live.
 */
export function useVoice(): VoiceControls {
  const { setInVoice, setMuted, setSpeaking, inVoice, isMuted } = useStore()
  const [localStream, setLocalStream] = useState<MediaStream | null>(null)
  const [level, setLevel] = useState(0)
  const [error, setError] = useState<string | null>(null)

  const audioCtxRef = useRef<AudioContext | null>(null)
  const rafRef = useRef<number | null>(null)
  const mutedRef = useRef(isMuted)
  mutedRef.current = isMuted

  const stopAnalyser = useCallback(() => {
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    audioCtxRef.current?.close().catch(() => {})
    audioCtxRef.current = null
    setLevel(0)
    setSpeaking(false)
  }, [setSpeaking])

  const startAnalyser = useCallback(
    (stream: MediaStream) => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
      const ctx = new AudioCtx()
      audioCtxRef.current = ctx
      const source = ctx.createMediaStreamSource(stream)
      const analyser = ctx.createAnalyser()
      analyser.fftSize = 512
      source.connect(analyser)
      const data = new Uint8Array(analyser.frequencyBinCount)

      let lastSpeaking = false
      let lastSampled = 0
      const loop = (t: number) => {
        analyser.getByteFrequencyData(data)
        let sum = 0
        for (let i = 0; i < data.length; i++) sum += data[i]
        const avg = sum / data.length

        // Sample state ~every 100ms to avoid awareness spam.
        if (t - lastSampled > 100) {
          lastSampled = t
          setLevel(Math.min(1, avg / 80))
          const speaking = !mutedRef.current && avg > SPEAKING_THRESHOLD
          if (speaking !== lastSpeaking) {
            lastSpeaking = speaking
            setSpeaking(speaking)
          }
        }
        rafRef.current = requestAnimationFrame(loop)
      }
      rafRef.current = requestAnimationFrame(loop)
    },
    [setSpeaking]
  )

  const join = useCallback(async () => {
    if (inVoice) return
    setError(null)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      })
      setLocalStream(stream)
      setInVoice(true)
      setMuted(false)
      startAnalyser(stream)
    } catch (err) {
      console.error('[voice] getUserMedia failed', err)
      setError('Microphone access was denied or is unavailable.')
    }
  }, [inVoice, setInVoice, setMuted, startAnalyser])

  const leave = useCallback(() => {
    stopAnalyser()
    setLocalStream((s) => {
      s?.getTracks().forEach((t) => t.stop())
      return null
    })
    setInVoice(false)
    setMuted(false)
    setSpeaking(false)
  }, [stopAnalyser, setInVoice, setMuted, setSpeaking])

  const toggleMute = useCallback(() => {
    setLocalStream((stream) => {
      if (stream) {
        const next = !mutedRef.current
        stream.getAudioTracks().forEach((tr) => (tr.enabled = !next))
        setMuted(next)
        if (next) setSpeaking(false)
      }
      return stream
    })
  }, [setMuted, setSpeaking])

  // Clean up on unmount.
  useEffect(() => {
    return () => {
      stopAnalyser()
      localStream?.getTracks().forEach((t) => t.stop())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { localStream, inVoice, isMuted, level, join, leave, toggleMute, error }
}
