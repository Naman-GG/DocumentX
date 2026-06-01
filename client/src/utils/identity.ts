import { v4 as uuidv4 } from 'uuid'

/**
 * A stable id for this browser tab, used to build a unique WebRTC peer id even
 * when the same account is open in multiple tabs. Persists across reloads of
 * the same tab via sessionStorage.
 */
export function getTabId(): string {
  const KEY = 'documentx.tabId'
  let id = sessionStorage.getItem(KEY)
  if (!id) {
    id = uuidv4()
    sessionStorage.setItem(KEY, id)
  }
  return id
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
