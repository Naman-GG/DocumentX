import { useState } from 'react'
import type * as Y from 'yjs'
import { Sparkles, Moon, Sun, Users, Wifi, WifiOff, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { useStore } from '../store/useStore'
import { initialsOf } from '../utils/colors'
import { Modal } from './UI/Modal'
import { Tooltip } from './UI/Tooltip'

interface HeaderProps {
  titleText: Y.Text
  status: 'connecting' | 'connected' | 'disconnected'
}

export function Header({ titleText, status }: HeaderProps) {
  const {
    name, color, setName, theme, toggleTheme,
    aiPanelOpen, toggleAIPanel, sidebarOpen, toggleSidebar,
    docTitle, users,
  } = useStore()

  const [nameModalOpen, setNameModalOpen] = useState(false)
  const [draftName, setDraftName] = useState(name)

  const onTitleChange = (value: string) => {
    // Replace the shared title text (it's short; whole-value replacement is fine).
    titleText.doc?.transact(() => {
      titleText.delete(0, titleText.length)
      titleText.insert(0, value)
    })
  }

  const saveName = () => {
    const trimmed = draftName.trim()
    if (trimmed) setName(trimmed)
    setNameModalOpen(false)
  }

  return (
    <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border bg-bg-primary px-3 sm:px-4">
      {/* Logo */}
      <div className="flex shrink-0 items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent text-white">
          <span className="document-title text-base leading-none">D</span>
        </div>
        <span className="hidden text-sm font-semibold text-text-primary sm:inline">DocumentX</span>
      </div>

      <div className="mx-1 hidden h-5 w-px bg-border sm:block" />

      {/* Editable title */}
      <input
        aria-label="Document title"
        value={docTitle}
        onChange={(e) => onTitleChange(e.target.value)}
        className="document-title min-w-0 flex-1 truncate bg-transparent text-lg text-text-primary outline-none placeholder:text-text-muted focus:underline"
        placeholder="Untitled document"
      />

      {/* Connection status */}
      <Tooltip label={status === 'connected' ? 'Connected' : status === 'connecting' ? 'Connecting…' : 'Disconnected'}>
        <span className="hidden items-center sm:flex">
          {status === 'connected' ? (
            <Wifi size={16} className="text-voice-active" />
          ) : (
            <WifiOff size={16} className="text-text-muted" />
          )}
        </span>
      </Tooltip>

      {/* Users online */}
      <div className="hidden items-center gap-1.5 rounded-full bg-bg-secondary px-2.5 py-1 text-xs font-medium text-text-secondary sm:flex">
        <Users size={13} />
        {users.length} online
      </div>

      {/* Self avatar — click to rename */}
      <Tooltip label="Change your name">
        <button
          type="button"
          onClick={() => {
            setDraftName(name)
            setNameModalOpen(true)
          }}
          className="flex h-8 w-8 items-center justify-center rounded-full text-[11px] font-semibold text-white ring-2 ring-bg-primary"
          style={{ background: color }}
          aria-label="Change your name"
        >
          {initialsOf(name)}
        </button>
      </Tooltip>

      {/* Sidebar toggle */}
      <Tooltip label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}>
        <button
          type="button"
          onClick={() => toggleSidebar()}
          aria-label="Toggle sidebar"
          aria-pressed={sidebarOpen}
          className="hidden h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-secondary lg:flex"
        >
          {sidebarOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}
        </button>
      </Tooltip>

      {/* AI panel toggle */}
      <button
        type="button"
        onClick={() => toggleAIPanel()}
        aria-pressed={aiPanelOpen}
        className={`flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-sm font-medium transition-colors ${
          aiPanelOpen ? 'bg-accent text-white' : 'bg-accent-subtle text-accent hover:bg-accent hover:text-white'
        }`}
      >
        <Sparkles size={15} />
        <span className="hidden sm:inline">AI</span>
      </button>

      {/* Theme toggle */}
      <Tooltip label={theme === 'dark' ? 'Light mode' : 'Dark mode'}>
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Toggle theme"
          className="flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-secondary"
        >
          {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
        </button>
      </Tooltip>

      <Modal open={nameModalOpen} title="Your display name" onClose={() => setNameModalOpen(false)}>
        <div className="space-y-3">
          <input
            autoFocus
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && saveName()}
            className="w-full rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
            placeholder="Enter your name"
          />
          <div className="flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-full text-xs font-semibold text-white"
              style={{ background: color }}
            >
              {initialsOf(draftName || name)}
            </div>
            <button
              type="button"
              onClick={saveName}
              className="ml-auto rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover"
            >
              Save
            </button>
          </div>
        </div>
      </Modal>
    </header>
  )
}
