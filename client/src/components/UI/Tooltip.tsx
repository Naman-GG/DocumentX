import { useState, type ReactNode } from 'react'

interface TooltipProps {
  label: string
  children: ReactNode
  side?: 'top' | 'bottom'
}

/** Lightweight hover/focus tooltip. The trigger child must forward DOM events. */
export function Tooltip({ label, children, side = 'bottom' }: TooltipProps) {
  const [open, setOpen] = useState(false)

  return (
    <span
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
    >
      {children}
      {open && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute left-1/2 z-50 -translate-x-1/2 whitespace-nowrap rounded-md bg-text-primary px-2 py-1 text-xs font-medium text-bg-primary shadow-md ${
            side === 'bottom' ? 'top-full mt-1.5' : 'bottom-full mb-1.5'
          }`}
        >
          {label}
        </span>
      )}
    </span>
  )
}
