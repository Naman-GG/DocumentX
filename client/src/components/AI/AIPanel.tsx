import { useState, useRef, useCallback } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Sparkles, FileText, SpellCheck, ClipboardList, X, Loader2,
  Mic, Square, CornerDownLeft, Check,
} from 'lucide-react'
import { aiRequest, aiStream, useTranscription } from './useAI'
import { mdToHtml } from './markdown'
import { wordDiff, type DiffPart } from './diff'
import { useStore } from '../../store/useStore'

type Tab = 'generate' | 'summarize' | 'grammar' | 'minutes'

const TABS: { id: Tab; label: string; icon: typeof Sparkles }[] = [
  { id: 'generate', label: 'Generate', icon: Sparkles },
  { id: 'summarize', label: 'Summarize', icon: FileText },
  { id: 'grammar', label: 'Grammar', icon: SpellCheck },
  { id: 'minutes', label: 'Minutes', icon: ClipboardList },
]

interface AIPanelProps {
  editor: Editor | null
}

export function AIPanel({ editor }: AIPanelProps) {
  const { aiPanelOpen, toggleAIPanel } = useStore()
  const [tab, setTab] = useState<Tab>('generate')

  if (!aiPanelOpen) return null

  return (
    <aside
      className="absolute right-0 top-0 z-30 flex h-full w-full max-w-[380px] flex-col border-l border-border bg-bg-primary shadow-xl animate-slide-in sm:w-[380px]"
      aria-label="AI assistant"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles size={16} className="text-accent" />
          <h2 className="text-sm font-semibold text-text-primary">AI Assistant</h2>
        </div>
        <button
          type="button"
          aria-label="Close AI panel"
          onClick={() => toggleAIPanel(false)}
          className="flex h-7 w-7 items-center justify-center rounded-md text-text-secondary hover:bg-bg-secondary"
        >
          <X size={16} />
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border px-2" role="tablist">
        {TABS.map((t) => {
          const Icon = t.icon
          const active = tab === t.id
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              className={`flex flex-1 flex-col items-center gap-1 border-b-2 px-1 py-2 text-xs font-medium transition-colors ${
                active
                  ? 'border-accent text-accent'
                  : 'border-transparent text-text-secondary hover:text-text-primary'
              }`}
            >
              <Icon size={16} />
              {t.label}
            </button>
          )
        })}
      </div>

      <div className="flex-1 overflow-y-auto scroll-thin p-4">
        {tab === 'generate' && <GenerateTab editor={editor} />}
        {tab === 'summarize' && <SummarizeTab editor={editor} />}
        {tab === 'grammar' && <GrammarTab editor={editor} />}
        {tab === 'minutes' && <MinutesTab editor={editor} />}
      </div>
    </aside>
  )
}

// ── Shared bits ──────────────────────────────────────────────
function PrimaryButton({
  onClick, disabled, loading, children,
}: {
  onClick: () => void
  disabled?: boolean
  loading?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || loading}
      className="flex w-full items-center justify-center gap-2 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
    >
      {loading && <Loader2 size={15} className="animate-spin-slow" />}
      {children}
    </button>
  )
}

function ErrorNote({ message }: { message: string }) {
  return (
    <div className="mt-3 rounded-md bg-red-subtle px-3 py-2 text-xs text-red">{message}</div>
  )
}

// ── Generate ─────────────────────────────────────────────────
function GenerateTab({ editor }: { editor: Editor | null }) {
  const [prompt, setPrompt] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [output, setOutput] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!editor || !prompt.trim()) return
    setStreaming(true)
    setError(null)
    setOutput('')
    editor.chain().focus().run()
    try {
      await aiStream('generate', { prompt }, (chunk) => {
        setOutput((o) => o + chunk)
        // Insert at the live cursor with a typewriter feel.
        editor.commands.insertContent(chunk)
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed.')
    } finally {
      setStreaming(false)
    }
  }, [editor, prompt])

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        Describe what to write. The result streams into the document at your cursor.
      </p>
      <textarea
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
        placeholder="e.g. Write an introduction about climate change"
        rows={3}
        className="w-full resize-none rounded-lg border border-border bg-bg-primary p-2.5 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
      />
      <PrimaryButton onClick={run} loading={streaming} disabled={!prompt.trim()}>
        <Sparkles size={15} />
        {streaming ? 'Generating…' : 'Generate & Insert'}
      </PrimaryButton>
      {output && (
        <div className="rounded-lg border border-border bg-bg-secondary p-3">
          <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-text-muted">
            Streaming output
          </p>
          <p className={`whitespace-pre-wrap font-mono text-xs text-text-primary ${streaming ? 'typewriter-caret' : ''}`}>
            {output}
          </p>
        </div>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  )
}

// ── Summarize ────────────────────────────────────────────────
function SummarizeTab({ editor }: { editor: Editor | null }) {
  const [loading, setLoading] = useState(false)
  const [summary, setSummary] = useState('')
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!editor) return
    const text = editor.getText().trim()
    if (!text) {
      setError('The document is empty.')
      return
    }
    setLoading(true)
    setError(null)
    setSummary('')
    try {
      setSummary(await aiRequest('summarize', { content: text }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Summarize failed.')
    } finally {
      setLoading(false)
    }
  }, [editor])

  const insert = useCallback(() => {
    if (!editor || !summary) return
    editor.chain().focus().insertContent(mdToHtml(`## Summary\n${summary}`)).run()
  }, [editor, summary])

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        Condense the whole document into a few key bullet points.
      </p>
      <PrimaryButton onClick={run} loading={loading}>
        <FileText size={15} />
        {loading ? 'Summarizing…' : 'Summarize Document'}
      </PrimaryButton>
      {summary && (
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-bg-secondary p-3 text-sm text-text-primary">
            <pre className="whitespace-pre-wrap font-sans">{summary}</pre>
          </div>
          <button
            type="button"
            onClick={insert}
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-border px-3 py-2 text-sm font-medium text-text-primary hover:bg-bg-secondary"
          >
            <CornerDownLeft size={15} />
            Insert into document
          </button>
        </div>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  )
}

// ── Grammar ──────────────────────────────────────────────────
function GrammarTab({ editor }: { editor: Editor | null }) {
  const [loading, setLoading] = useState(false)
  const [diff, setDiff] = useState<DiffPart[] | null>(null)
  const [corrected, setCorrected] = useState('')
  const [scope, setScope] = useState<{ from: number; to: number } | null>(null)
  const [error, setError] = useState<string | null>(null)

  const run = useCallback(async () => {
    if (!editor) return
    const { from, to, empty } = editor.state.selection
    const useSelection = !empty
    const original = useSelection
      ? editor.state.doc.textBetween(from, to, '\n', ' ')
      : editor.getText()
    if (!original.trim()) {
      setError('Nothing to check — type or select some text first.')
      return
    }
    setLoading(true)
    setError(null)
    setDiff(null)
    try {
      const result = (await aiRequest('grammar', { content: original })).trim()
      setCorrected(result)
      setDiff(wordDiff(original, result))
      setScope(
        useSelection
          ? { from, to }
          : { from: 0, to: editor.state.doc.content.size }
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Grammar check failed.')
    } finally {
      setLoading(false)
    }
  }, [editor])

  const accept = useCallback(() => {
    if (!editor || !scope || !corrected) return
    editor
      .chain()
      .focus()
      .insertContentAt({ from: scope.from, to: scope.to }, corrected)
      .run()
    setDiff(null)
    setCorrected('')
    setScope(null)
  }, [editor, scope, corrected])

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        Fix grammar & spelling in your selection (or the whole document if nothing
        is selected).
      </p>
      <PrimaryButton onClick={run} loading={loading}>
        <SpellCheck size={15} />
        {loading ? 'Checking…' : 'Fix Grammar & Spelling'}
      </PrimaryButton>
      {diff && (
        <div className="space-y-2">
          <div className="rounded-lg border border-border bg-bg-secondary p-3 text-sm leading-relaxed">
            {diff.map((part, i) => {
              if (part.type === 'same') return <span key={i}>{part.text}</span>
              if (part.type === 'del')
                return (
                  <span key={i} className="rounded bg-red-subtle text-red line-through">
                    {part.text}
                  </span>
                )
              return (
                <span key={i} className="rounded bg-green-subtle text-green">
                  {part.text}
                </span>
              )
            })}
          </div>
          <button
            type="button"
            onClick={accept}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-green px-3 py-2 text-sm font-medium text-white hover:opacity-90"
          >
            <Check size={15} />
            Accept All
          </button>
        </div>
      )}
      {error && <ErrorNote message={error} />}
    </div>
  )
}

// ── Minutes ──────────────────────────────────────────────────
function MinutesTab({ editor }: { editor: Editor | null }) {
  const transcription = useTranscription()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const generate = useCallback(async () => {
    if (!editor || transcription.segments.length === 0) return
    const transcript = transcription.segments
      .map((s) => `[${s.timestamp}] ${s.text}`)
      .join('\n')
    setLoading(true)
    setError(null)
    try {
      const minutes = await aiRequest('minutes', { content: transcript })
      editor.chain().focus().insertContent(mdToHtml(minutes)).run()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not generate minutes.')
    } finally {
      setLoading(false)
    }
  }, [editor, transcription.segments])

  return (
    <div className="space-y-3">
      <p className="text-xs text-text-secondary">
        Transcribe what you say during the session, then turn it into formatted
        meeting minutes.
      </p>

      {!transcription.supported ? (
        <div className="rounded-md bg-amber-subtle px-3 py-2 text-xs text-amber">
          Speech recognition isn't available in this browser. Use Chrome or Edge for
          transcription.
        </div>
      ) : (
        <button
          type="button"
          onClick={transcription.recording ? transcription.stop : transcription.start}
          className={`flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
            transcription.recording
              ? 'bg-red-subtle text-red hover:bg-red hover:text-white'
              : 'bg-accent text-white hover:bg-accent-hover'
          }`}
        >
          {transcription.recording ? <Square size={15} /> : <Mic size={15} />}
          {transcription.recording ? 'Stop Transcribing' : 'Transcribe Session'}
        </button>
      )}

      {transcription.recording && (
        <p className="flex items-center justify-center gap-1.5 text-[11px] text-red">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red" />
          Listening…
        </p>
      )}

      <div ref={listRef} className="max-h-48 space-y-1.5 overflow-y-auto scroll-thin">
        {transcription.segments.length === 0 ? (
          <p className="text-xs text-text-muted">No transcript yet.</p>
        ) : (
          transcription.segments.map((s, i) => (
            <div key={i} className="rounded-md bg-bg-secondary px-2.5 py-1.5 text-xs">
              <span className="mr-1.5 font-mono text-[10px] text-text-muted">{s.timestamp}</span>
              <span className="text-text-primary">{s.text}</span>
            </div>
          ))
        )}
      </div>

      <div className="flex gap-2">
        <PrimaryButton
          onClick={generate}
          loading={loading}
          disabled={transcription.segments.length === 0}
        >
          <ClipboardList size={15} />
          {loading ? 'Generating…' : 'Generate Minutes'}
        </PrimaryButton>
        {transcription.segments.length > 0 && (
          <button
            type="button"
            onClick={transcription.clear}
            className="rounded-lg border border-border px-3 text-sm text-text-secondary hover:bg-bg-secondary"
          >
            Clear
          </button>
        )}
      </div>
      {error && <ErrorNote message={error} />}
    </div>
  )
}
