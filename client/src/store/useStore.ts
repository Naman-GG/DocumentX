import { create } from 'zustand'
import { loadIdentity, saveIdentity, loadTheme, saveTheme, type Theme } from '../utils/identity'

/** A remote (or local) participant as seen through Yjs awareness. */
export interface AwarenessUser {
  clientId: number
  peerId: string
  name: string
  color: string
  isMuted: boolean
  isSpeaking: boolean
  inVoice: boolean
  isSelf: boolean
}

interface UIState {
  // Local identity
  peerId: string
  name: string
  color: string
  setName: (name: string) => void

  // Theme
  theme: Theme
  toggleTheme: () => void

  // Panels
  aiPanelOpen: boolean
  toggleAIPanel: (open?: boolean) => void
  sidebarOpen: boolean
  toggleSidebar: (open?: boolean) => void

  // Presence (mirrored from Yjs awareness)
  users: AwarenessUser[]
  setUsers: (users: AwarenessUser[]) => void

  // Local voice state
  inVoice: boolean
  isMuted: boolean
  isSpeaking: boolean
  setInVoice: (v: boolean) => void
  setMuted: (v: boolean) => void
  setSpeaking: (v: boolean) => void

  // Document title (stored in Yjs, mirrored here for the header)
  docTitle: string
  setDocTitle: (title: string) => void
}

const identity = loadIdentity()
const theme = loadTheme()

export const useStore = create<UIState>((set, get) => ({
  peerId: identity.peerId,
  name: identity.name,
  color: identity.color,
  setName: (name) => {
    const next = { ...identity, name, color: get().color, peerId: get().peerId }
    saveIdentity(next)
    set({ name })
  },

  theme,
  toggleTheme: () => {
    const next: Theme = get().theme === 'dark' ? 'light' : 'dark'
    saveTheme(next)
    document.documentElement.setAttribute('data-theme', next)
    set({ theme: next })
  },

  aiPanelOpen: false,
  toggleAIPanel: (open) =>
    set((s) => ({ aiPanelOpen: open ?? !s.aiPanelOpen })),
  sidebarOpen: true,
  toggleSidebar: (open) => set((s) => ({ sidebarOpen: open ?? !s.sidebarOpen })),

  users: [],
  setUsers: (users) => set({ users }),

  inVoice: false,
  isMuted: false,
  isSpeaking: false,
  setInVoice: (inVoice) => set({ inVoice }),
  setMuted: (isMuted) => set({ isMuted }),
  setSpeaking: (isSpeaking) => set({ isSpeaking }),

  docTitle: 'Untitled document',
  setDocTitle: (docTitle) => set({ docTitle }),
}))
