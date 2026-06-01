import { useEffect, useRef, useState, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

const SERVER_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001'

export type AITask = 'generate' | 'summarize' | 'grammar' | 'minutes' | 'autocomplete'

interface AIBody {
  content?: string
  prompt?: string
}

/** Single-shot AI request (summarize / grammar / minutes). */
export async function aiRequest(task: AITask, body: AIBody): Promise<string> {
  const res = await fetch(`${SERVER_URL}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, ...body }),
  })
  if (!res.ok) throw new Error(`AI request failed (${res.status})`)
  const data = (await res.json()) as { result?: string; error?: string }
  if (data.error) throw new Error(data.error)
  return data.result ?? ''
}

/** Streaming AI request (generate / autocomplete). Calls `onText` per chunk. */
export async function aiStream(
  task: AITask,
  body: AIBody,
  onText: (chunk: string) => void,
  signal?: AbortSignal
): Promise<void> {
  const res = await fetch(`${SERVER_URL}/api/ai`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ task, ...body }),
    signal,
  })
  if (!res.ok || !res.body) throw new Error(`AI request failed (${res.status})`)

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const payload = trimmed.slice(5).trim()
      if (payload === '[DONE]') return
      try {
        const parsed = JSON.parse(payload) as { text?: string; error?: string }
        if (parsed.error) throw new Error(parsed.error)
        if (parsed.text) onText(parsed.text)
      } catch {
        /* ignore malformed keep-alive lines */
      }
    }
  }
}

// ── Ghost-text autocomplete ──────────────────────────────────
const autocompleteKey = new PluginKey<DecorationSet>('ai-autocomplete')

interface SuggestionMeta {
  text: string | null
  pos: number | null
}

/**
 * Shows an AI ghost-text suggestion after the cursor once the user pauses
 * typing for 2s. Press Tab to accept, Escape to dismiss. In-flight requests are
 * cancelled when the user resumes typing.
 */
export function useAutocomplete(editor: Editor | null) {
  const suggestionRef = useRef<SuggestionMeta>({ text: null, pos: null })
  const abortRef = useRef<AbortController | null>(null)
  const timerRef = useRef<number | null>(null)

  const clearSuggestion = useCallback(() => {
    if (!editor) return
    suggestionRef.current = { text: null, pos: null }
    const tr = editor.state.tr.setMeta(autocompleteKey, { text: null, pos: null })
    editor.view.dispatch(tr)
  }, [editor])

  // Register the decoration plugin + key handlers once per editor.
  useEffect(() => {
    if (!editor) return

    const plugin = new Plugin<DecorationSet>({
      key: autocompleteKey,
      state: {
        init: () => DecorationSet.empty,
        apply(tr, old) {
          const meta = tr.getMeta(autocompleteKey) as SuggestionMeta | undefined
          if (meta) {
            if (!meta.text || meta.pos == null) return DecorationSet.empty
            const widget = document.createElement('span')
            widget.className = 'autocomplete-ghost'
            widget.textContent = meta.text
            return DecorationSet.create(tr.doc, [
              Decoration.widget(meta.pos, widget, { side: 1 }),
            ])
          }
          // User typed — drop the suggestion.
          if (tr.docChanged) return DecorationSet.empty
          return old.map(tr.mapping, tr.doc)
        },
      },
      props: {
        decorations(state) {
          return autocompleteKey.getState(state)
        },
        handleKeyDown(view, event) {
          const { text, pos } = suggestionRef.current
          if (!text || pos == null) return false
          if (event.key === 'Tab') {
            event.preventDefault()
            view.dispatch(
              view.state.tr
                .insertText(text, pos)
                .setMeta(autocompleteKey, { text: null, pos: null })
            )
            suggestionRef.current = { text: null, pos: null }
            return true
          }
          if (event.key === 'Escape') {
            clearSuggestion()
            return true
          }
          return false
        },
      },
    })

    editor.registerPlugin(plugin)
    return () => {
      editor.unregisterPlugin(autocompleteKey)
    }
  }, [editor, clearSuggestion])

  // Debounced fetch on idle.
  useEffect(() => {
    if (!editor) return

    const schedule = () => {
      if (timerRef.current) window.clearTimeout(timerRef.current)
      abortRef.current?.abort()
      if (suggestionRef.current.text) clearSuggestion()

      timerRef.current = window.setTimeout(async () => {
        const { state } = editor
        const { from, empty } = state.selection
        // Only suggest at a collapsed cursor inside a paragraph with context.
        if (!empty || editor.isActive('codeBlock')) return
        const before = state.doc.textBetween(Math.max(0, from - 500), from, '\n', ' ')
        if (before.trim().length < 12) return

        const controller = new AbortController()
        abortRef.current = controller
        let acc = ''
        try {
          await aiStream(
            'autocomplete',
            { content: before },
            (chunk) => (acc += chunk),
            controller.signal
          )
        } catch {
          return // aborted or failed — silently skip
        }
        const suggestion = acc.trim()
        // Make sure the cursor hasn't moved since we asked.
        if (suggestion && editor.state.selection.from === from) {
          suggestionRef.current = { text: suggestion, pos: from }
          editor.view.dispatch(
            editor.state.tr.setMeta(autocompleteKey, { text: suggestion, pos: from })
          )
        }
      }, 2000)
    }

    editor.on('update', schedule)
    editor.on('selectionUpdate', clearSuggestion)
    return () => {
      editor.off('update', schedule)
      editor.off('selectionUpdate', clearSuggestion)
      if (timerRef.current) window.clearTimeout(timerRef.current)
      abortRef.current?.abort()
    }
  }, [editor, clearSuggestion])
}

// ── Web Speech API transcription ─────────────────────────────
export interface TranscriptSegment {
  text: string
  timestamp: string
}

export interface Transcription {
  supported: boolean
  recording: boolean
  segments: TranscriptSegment[]
  start: () => void
  stop: () => void
  clear: () => void
}

export function useTranscription(): Transcription {
  const [recording, setRecording] = useState(false)
  const [segments, setSegments] = useState<TranscriptSegment[]>([])
  const recognitionRef = useRef<SpeechRecognition | null>(null)

  const SpeechRecognitionImpl =
    window.SpeechRecognition || window.webkitSpeechRecognition
  const supported = Boolean(SpeechRecognitionImpl)

  const start = useCallback(() => {
    if (!SpeechRecognitionImpl || recording) return
    const recognition = new SpeechRecognitionImpl()
    recognition.continuous = true
    recognition.interimResults = false
    recognition.lang = 'en-US'

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        if (result.isFinal) {
          const text = result[0].transcript.trim()
          if (text) {
            const timestamp = new Date().toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
            })
            setSegments((prev) => [...prev, { text, timestamp }])
          }
        }
      }
    }
    recognition.onerror = () => {/* keep going on transient errors */}
    recognition.onend = () => {
      // Auto-restart while the user still wants to record.
      if (recognitionRef.current === recognition) {
        try {
          recognition.start()
        } catch {
          setRecording(false)
        }
      }
    }

    recognitionRef.current = recognition
    recognition.start()
    setRecording(true)
  }, [SpeechRecognitionImpl, recording])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    recognitionRef.current = null
    recognition?.stop()
    setRecording(false)
  }, [])

  const clear = useCallback(() => setSegments([]), [])

  useEffect(() => () => recognitionRef.current?.stop(), [])

  return { supported, recording, segments, start, stop, clear }
}
