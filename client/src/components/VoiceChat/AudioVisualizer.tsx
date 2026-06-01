interface AudioVisualizerProps {
  /** Amplitude 0–1. */
  level: number
  active: boolean
}

/** A compact 5-bar mic-level meter. */
export function AudioVisualizer({ level, active }: AudioVisualizerProps) {
  const bars = 5
  return (
    <div className="flex h-4 items-end gap-0.5" aria-hidden>
      {Array.from({ length: bars }).map((_, i) => {
        // Each bar lights up as level crosses its threshold.
        const threshold = (i + 1) / bars
        const on = active && level >= threshold * 0.6
        const height = on ? `${30 + threshold * 70}%` : '20%'
        return (
          <span
            key={i}
            className="w-0.5 rounded-full transition-all duration-100"
            style={{
              height,
              background: on ? 'var(--voice-active)' : 'var(--border-strong)',
            }}
          />
        )
      })}
    </div>
  )
}
