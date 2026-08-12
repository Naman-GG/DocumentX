import { useEffect } from 'react'
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
import { Pagination, PAGE_HEIGHT, PAGE_GAP, PAGE_PITCH, PAGE_WIDTH } from './pagination'
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
        Pagination,
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
  // Guard against a torn-down view (docView === null): dispatching into a
  // destroyed editor throws "null is not an object (this.docView.matchesNode)",
  // which WebKit surfaces during the mount commit where Chromium does not.
  useEffect(() => {
    if (!editor || editor.isDestroyed) return
    editor.chain().updateUser({ name, color }).run()
  }, [editor, name, color])

  return editor
}

interface EditorCoreProps {
  editor: Editor | null
}

/** The centered, paged (A4) editor canvas. */
export function EditorCore({ editor }: EditorCoreProps) {
  // Ghost-text AI autocomplete (Tab to accept).
  useAutocomplete(editor)

  // How many sheets to draw. The Pagination extension measures the laid-out
  // document and publishes it, so the sheets can never disagree with the page
  // breaks drawn into the text.
  const pageCount = useStore((s) => s.pageCount)

  return (
    <div className="flex-1 overflow-y-auto scroll-thin px-4 py-6 sm:px-8 sm:py-10">
      <div
        data-page-canvas
        className="relative mx-auto w-full"
        style={{
          maxWidth: PAGE_WIDTH,
          minHeight: pageCount * PAGE_PITCH - PAGE_GAP,
        }}
      >
        {/* The A4 sheets themselves, behind the text. */}
        <div
          className="pointer-events-none absolute inset-0 flex flex-col"
          style={{ gap: PAGE_GAP }}
          aria-hidden
        >
          {Array.from({ length: pageCount }).map((_, i) => (
            <div
              key={i}
              className="relative shrink-0 rounded-md bg-bg-primary"
              style={{ height: PAGE_HEIGHT, boxShadow: '0 1px 10px rgba(0,0,0,0.10)' }}
            >
              <span className="absolute inset-x-0 bottom-6 text-center text-[11px] text-text-muted">
                {i + 1}
              </span>
            </div>
          ))}
        </div>

        {/* Document content, flowing across the sheets. */}
        <div className="relative px-6 py-10 sm:px-24 sm:py-[96px]">
          <CollaboratorCursors />
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
