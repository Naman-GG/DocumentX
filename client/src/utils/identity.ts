import { v4 as uuidv4 } from 'uuid'
import { randomColor, randomName } from './colors'

export interface LocalIdentity {
  /** Stable per-browser peer id, used for WebRTC signaling. */
  peerId: string
  name: string
  color: string
}

const STORAGE_KEY = 'documentx.identity'

export function loadIdentity(): LocalIdentity {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<LocalIdentity>
      if (parsed.peerId && parsed.name && parsed.color) {
        return parsed as LocalIdentity
      }
    }
  } catch {
    /* fall through to fresh identity */
  }
  const identity: LocalIdentity = {
    peerId: uuidv4(),
    name: randomName(),
    color: randomColor(),
  }
  saveIdentity(identity)
  return identity
}

export function saveIdentity(identity: LocalIdentity): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(identity))
}

const THEME_KEY = 'documentx.theme'
export type Theme = 'light' | 'dark'

export function loadTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY)
  if (stored === 'dark' || stored === 'light') return stored
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function saveTheme(theme: Theme): void {
  localStorage.setItem(THEME_KEY, theme)
}
