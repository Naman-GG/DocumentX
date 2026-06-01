import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import type { Editor } from '@tiptap/react'
import {
  Undo2, Redo2, Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  Code, AlignLeft, AlignCenter, AlignRight, AlignJustify, List, ListOrdered,
  ListChecks, Quote, Code2, Minus, Link as LinkIcon, Table as TableIcon,
  Image as ImageIcon, Baseline, Highlighter,
} from 'lucide-react'
import { Tooltip } from '../UI/Tooltip'

interface ToolbarProps {
  editor: Editor | null
}

/** Force a re-render whenever the editor's selection or content changes, so
 *  active-state highlighting on toolbar buttons stays accurate. */
function useEditorTick(editor: Editor | null) {
  const [, tick] = useReducer((n: number) => n + 1, 0)
  useEffect(() => {
    if (!editor) return
    editor.on('transaction', tick)
    editor.on('selectionUpdate', tick)
    return () => {
      editor.off('transaction', tick)
      editor.off('selectionUpdate', tick)
    }
  }, [editor])
}

function IconButton({
  label, onClick, active, disabled, children,
}: {
  label: string
  onClick: () => void
  active?: boolean
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <Tooltip label={label}>
      <button
        type="button"
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClick}
        className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
          active
            ? 'bg-accent-subtle text-accent'
            : 'text-text-secondary hover:bg-bg-secondary hover:text-text-primary'
        }`}
      >
        {children}
      </button>
    </Tooltip>
  )
}

function Separator() {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden />
}

const FONT_FAMILIES = [
  { label: 'Sans', value: 'DM Sans, sans-serif' },
  { label: 'Serif', value: 'Georgia, serif' },
  { label: 'Mono', value: 'ui-monospace, monospace' },
]
const FONT_SIZES = ['8', '10', '12', '14', '16', '18', '24', '32', '48', '72']

const selectClass =
  'h-8 rounded-md border border-border bg-bg-primary px-2 text-sm text-text-primary ' +
  'hover:border-border-strong focus:border-accent focus:outline-none cursor-pointer'

export function Toolbar({ editor }: ToolbarProps) {
  useEditorTick(editor)
  const textColorRef = useRef<HTMLInputElement>(null)
  const highlightColorRef = useRef<HTMLInputElement>(null)
  const [tableOpen, setTableOpen] = useState(false)

  const setLink = useCallback(() => {
    if (!editor) return
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('Link URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }, [editor])

  const addImage = useCallback(() => {
    if (!editor) return
    const url = window.prompt('Image URL')
    if (url) editor.chain().focus().setImage({ src: url }).run()
  }, [editor])

  if (!editor) {
    return <div className="h-12 border-b border-border bg-bg-primary" />
  }

  const headingValue = editor.isActive('heading', { level: 1 })
    ? '1'
    : editor.isActive('heading', { level: 2 })
      ? '2'
      : editor.isActive('heading', { level: 3 })
        ? '3'
        : editor.isActive('heading', { level: 4 })
          ? '4'
          : 'p'

  const currentFontSize = (editor.getAttributes('textStyle').fontSize as string | undefined)
    ?.replace('px', '') ?? ''

  return (
    <div className="sticky top-0 z-20 border-b border-border bg-bg-primary">
      <div className="flex items-center gap-0.5 overflow-x-auto scroll-thin px-2 py-1.5">
        {/* History */}
        <IconButton label="Undo (Ctrl+Z)" onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()}>
          <Undo2 size={17} />
        </IconButton>
        <IconButton label="Redo (Ctrl+Y)" onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()}>
          <Redo2 size={17} />
        </IconButton>
        <Separator />

        {/* Block type */}
        <select
          aria-label="Text style"
          className={selectClass}
          value={headingValue}
          onChange={(e) => {
            const v = e.target.value
            if (v === 'p') editor.chain().focus().setParagraph().run()
            else editor.chain().focus().toggleHeading({ level: Number(v) as 1 | 2 | 3 | 4 }).run()
          }}
        >
          <option value="p">Paragraph</option>
          <option value="1">Heading 1</option>
          <option value="2">Heading 2</option>
          <option value="3">Heading 3</option>
          <option value="4">Heading 4</option>
        </select>

        {/* Font family */}
        <select
          aria-label="Font family"
          className={`${selectClass} ml-1`}
          value={editor.getAttributes('textStyle').fontFamily ?? ''}
          onChange={(e) => {
            const v = e.target.value
            if (v) editor.chain().focus().setFontFamily(v).run()
            else editor.chain().focus().unsetFontFamily().run()
          }}
        >
          <option value="">Font</option>
          {FONT_FAMILIES.map((f) => (
            <option key={f.value} value={f.value}>{f.label}</option>
          ))}
        </select>

        {/* Font size */}
        <select
          aria-label="Font size"
          className={`${selectClass} ml-1 w-16`}
          value={currentFontSize}
          onChange={(e) => {
            const v = e.target.value
            if (v) editor.chain().focus().setFontSize(`${v}px`).run()
            else editor.chain().focus().unsetFontSize().run()
          }}
        >
          <option value="">Size</option>
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <Separator />

        {/* Style marks */}
        <IconButton label="Bold (Ctrl+B)" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
          <Bold size={17} />
        </IconButton>
        <IconButton label="Italic (Ctrl+I)" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
          <Italic size={17} />
        </IconButton>
        <IconButton label="Underline (Ctrl+U)" active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()}>
          <UnderlineIcon size={17} />
        </IconButton>
        <IconButton label="Strikethrough" active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()}>
          <Strikethrough size={17} />
        </IconButton>
        <IconButton label="Inline code" active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()}>
          <Code size={17} />
        </IconButton>
        <Separator />

        {/* Colors */}
        <Tooltip label="Text color">
          <button
            type="button"
            aria-label="Text color"
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-secondary"
            onClick={() => textColorRef.current?.click()}
          >
            <Baseline size={17} />
            <span
              className="absolute bottom-1 h-1 w-4 rounded"
              style={{ background: (editor.getAttributes('textStyle').color as string) || 'var(--text-primary)' }}
            />
            <input
              ref={textColorRef}
              type="color"
              className="sr-only"
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            />
          </button>
        </Tooltip>
        <Tooltip label="Highlight color">
          <button
            type="button"
            aria-label="Highlight color"
            className="relative flex h-8 w-8 items-center justify-center rounded-md text-text-secondary hover:bg-bg-secondary"
            onClick={() => highlightColorRef.current?.click()}
          >
            <Highlighter size={17} />
            <input
              ref={highlightColorRef}
              type="color"
              className="sr-only"
              onChange={(e) => editor.chain().focus().toggleHighlight({ color: e.target.value }).run()}
            />
          </button>
        </Tooltip>
        <Separator />

        {/* Alignment */}
        <IconButton label="Align left" active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()}>
          <AlignLeft size={17} />
        </IconButton>
        <IconButton label="Align center" active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()}>
          <AlignCenter size={17} />
        </IconButton>
        <IconButton label="Align right" active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()}>
          <AlignRight size={17} />
        </IconButton>
        <IconButton label="Justify" active={editor.isActive({ textAlign: 'justify' })} onClick={() => editor.chain().focus().setTextAlign('justify').run()}>
          <AlignJustify size={17} />
        </IconButton>
        <Separator />

        {/* Lists */}
        <IconButton label="Bullet list" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
          <List size={17} />
        </IconButton>
        <IconButton label="Numbered list" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
          <ListOrdered size={17} />
        </IconButton>
        <IconButton label="Task list" active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()}>
          <ListChecks size={17} />
        </IconButton>
        <Separator />

        {/* Structure */}
        <IconButton label="Blockquote" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
          <Quote size={17} />
        </IconButton>
        <IconButton label="Code block" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
          <Code2 size={17} />
        </IconButton>
        <IconButton label="Horizontal rule" onClick={() => editor.chain().focus().setHorizontalRule().run()}>
          <Minus size={17} />
        </IconButton>
        <Separator />

        {/* Insert */}
        <IconButton label="Insert link" active={editor.isActive('link')} onClick={setLink}>
          <LinkIcon size={17} />
        </IconButton>
        <div className="relative">
          <IconButton label="Insert table" active={tableOpen} onClick={() => setTableOpen((o) => !o)}>
            <TableIcon size={17} />
          </IconButton>
          {tableOpen && (
            <TableInserter
              onClose={() => setTableOpen(false)}
              onInsert={(rows, cols) => {
                editor.chain().focus().insertTable({ rows, cols, withHeaderRow: true }).run()
                setTableOpen(false)
              }}
            />
          )}
        </div>
        <IconButton label="Insert image (URL)" onClick={addImage}>
          <ImageIcon size={17} />
        </IconButton>
      </div>
    </div>
  )
}

/** A small N×M grid picker for inserting a table. */
function TableInserter({
  onInsert, onClose,
}: {
  onInsert: (rows: number, cols: number) => void
  onClose: () => void
}) {
  const [hover, setHover] = useState({ r: 0, c: 0 })
  const ref = useRef<HTMLDivElement>(null)
  const MAX = 6

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    document.addEventListener('mousedown', onDocClick)
    return () => document.removeEventListener('mousedown', onDocClick)
  }, [onClose])

  return (
    <div
      ref={ref}
      className="absolute right-0 top-9 z-30 rounded-lg border border-border bg-bg-primary p-2 shadow-lg animate-fade-in"
    >
      <div className="mb-1.5 text-center text-xs text-text-secondary">
        {hover.r > 0 ? `${hover.r} × ${hover.c}` : 'Pick a size'}
      </div>
      <div className="grid grid-cols-6 gap-1">
        {Array.from({ length: MAX * MAX }).map((_, i) => {
          const r = Math.floor(i / MAX) + 1
          const c = (i % MAX) + 1
          const on = r <= hover.r && c <= hover.c
          return (
            <button
              key={i}
              type="button"
              aria-label={`${r} by ${c} table`}
              className={`h-4 w-4 rounded-sm border ${on ? 'border-accent bg-accent-subtle' : 'border-border'}`}
              onMouseEnter={() => setHover({ r, c })}
              onClick={() => onInsert(r, c)}
            />
          )
        })}
      </div>
    </div>
  )
}
