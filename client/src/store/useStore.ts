import { create } from 'zustand'
import { loadTheme, saveTheme, type Theme } from '../utils/identity'

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
  // Local identity (populated from the authenticated Firebase user).
  peerId: string
  name: string
  color: string
  setIdentity: (identity: { peerId: string; name: string; color: string }) => void
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

const theme = loadTheme()

export const useStore = create<UIState>((set) => ({
  peerId: '',
  name: '',
  color: '#2563EB',
  setIdentity: (identity) => set(identity),
  setName: (name) => set({ name }),

  theme,
  toggleTheme: () => {
    set((s) => {
      const next: Theme = s.theme === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      document.documentElement.setAttribute('data-theme', next)
      return { theme: next }
    })
  },

  aiPanelOpen: false,
  toggleAIPanel: (open) => set((s) => ({ aiPanelOpen: open ?? !s.aiPanelOpen })),
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

  docTitle: '',
  setDocTitle: (docTitle) => set({ docTitle }),
}))
