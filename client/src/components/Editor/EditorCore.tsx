import { useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Underline from '@tiptap/extension-underline'
import TextStyle from '@tiptap/extension-text-style'
import Color from '@tiptap/extension-color'
import FontFamily from '@tiptap/extension-font-family'
import Highlight from '@tiptap/extension-highlight'
import TextAlign from '@tiptap/extension-text-align'
import TaskList from '@tiptap/extension-task-list'
import TaskItem from '@tiptap/extension-task-item'
import Table from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import Link from '@tiptap/extension-link'
import Image from '@tiptap/extension-image'
import Placeholder from '@tiptap/extension-placeholder'
import Collaboration from '@tiptap/extension-collaboration'
import CollaborationCursor from '@tiptap/extension-collaboration-cursor'
import type * as Y from 'yjs'
import type { WebsocketProvider } from 'y-websocket'
import { FontSize } from './FontSize'
import { CollaboratorCursors } from './CollaboratorCursors'
import { useStore } from '../../store/useStore'
import { useAutocomplete } from '../AI/useAI'

/**
 * Builds the Tiptap editor bound to the shared Yjs document. History is
 * delegated to the Collaboration extension (Yjs undo manager), so StarterKit's
 * own history is disabled to avoid conflicts.
 */
export function useDocumentEditor(
  ydoc: Y.Doc,
  provider: WebsocketProvider,
  editable = true
): Editor | null {
  const { name, color } = useStore()

  const editor = useEditor(
    {
      editable,
      extensions: [
        StarterKit.configure({ history: false }),
        Underline,
        TextStyle,
        Color,
        FontFamily,
        FontSize,
        Highlight.configure({ multicolor: true }),
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        TaskList,
        TaskItem.configure({ nested: true }),
        Table.configure({ resizable: true }),
        TableRow,
        TableHeader,
        TableCell,
        Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
        Image,
        Placeholder.configure({ placeholder: 'Start writing, or ask the AI panel for a draft…' }),
        Collaboration.configure({ document: ydoc }),
        CollaborationCursor.configure({
          provider,
          user: { name, color },
        }),
      ],
      editorProps: {
        attributes: {
          class: 'ProseMirror',
          'aria-label': 'Document body',
          role: 'textbox',
          'aria-multiline': 'true',
        },
      },
    },
    [ydoc, provider, editable]
  )

  // Keep the collaboration cursor label in sync with name/color changes.
  useEffect(() => {
    editor?.chain().updateUser({ name, color }).run()
  }, [editor, name, color])

  return editor
}

interface EditorCoreProps {
  editor: Editor | null
}

// A4 page height in px at 96dpi (297mm). Width is 794px (210mm).
const PAGE_HEIGHT = 1123

/** The centered, paged (A4) editor canvas. */
export function EditorCore({ editor }: EditorCoreProps) {
  // Ghost-text AI autocomplete (Tab to accept).
  useAutocomplete(editor)

  const contentRef = useRef<HTMLDivElement>(null)
  const [pageCount, setPageCount] = useState(1)

  // Recompute how many A4 pages the content spans whenever its height changes.
  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    const recompute = () => {
      setPageCount(Math.max(1, Math.ceil(el.scrollHeight / PAGE_HEIGHT)))
    }
    const ro = new ResizeObserver(recompute)
    ro.observe(el)
    recompute()
    return () => ro.disconnect()
  }, [editor])

  return (
    <div className="flex-1 overflow-y-auto scroll-thin px-4 py-6 sm:px-8 sm:py-10">
      <div
        className="relative mx-auto w-full max-w-[794px]"
        style={{ minHeight: pageCount * PAGE_HEIGHT }}
      >
        {/* Stacked A4 page sheets (behind the content) with seams between pages. */}
        <div
          className="absolute inset-0 flex flex-col overflow-hidden rounded-lg"
          style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}
          aria-hidden
        >
          {Array.from({ length: pageCount }).map((_, i) => (
            <div
              key={i}
              className="shrink-0 bg-bg-primary"
              style={{
                height: PAGE_HEIGHT,
                borderBottom:
                  i < pageCount - 1 ? '1px solid var(--border-strong)' : undefined,
                boxShadow:
                  i < pageCount - 1 ? '0 2px 6px rgba(0,0,0,0.06)' : undefined,
              }}
            />
          ))}
        </div>

        {/* Continuous document content overlaid across the pages. */}
        <div ref={contentRef} className="relative px-6 py-10 sm:px-24 sm:py-[96px]">
          <CollaboratorCursors />
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
