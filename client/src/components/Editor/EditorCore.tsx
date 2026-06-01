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
import { useStore } from '../../store/useStore'
import { useAutocomplete } from '../AI/useAI'

const SEED_CONTENT = `
<h2>Welcome to DocumentX 👋</h2>
<p>This is a <strong>real-time collaborative</strong> document. Open this same URL in another browser tab and watch edits — and cursors — sync instantly.</p>
<p>Try these out:</p>
<ul>
  <li>Format text with the toolbar or shortcuts (<code>Ctrl/Cmd+B</code>, <code>Ctrl/Cmd+I</code>).</li>
  <li>Start <em>Voice Chat</em> from the sidebar to talk to collaborators.</li>
  <li>Open the <em>AI</em> panel to generate, summarize, or clean up your writing.</li>
</ul>
<blockquote>Everything here is conflict-free — edit the same sentence at the same time and Yjs sorts it out.</blockquote>
`

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

  // Seed example content once, only if the synced document is still empty.
  // Viewers never seed (they can't write, and the server would drop it anyway).
  useEffect(() => {
    if (!editor || !editable) return
    const seedIfEmpty = () => {
      if (editor.isEmpty) {
        editor.commands.setContent(SEED_CONTENT, false)
      }
    }
    if (provider.synced) {
      seedIfEmpty()
    } else {
      const onSync = (isSynced: boolean) => {
        if (isSynced) {
          seedIfEmpty()
          provider.off('sync', onSync)
        }
      }
      provider.on('sync', onSync)
    }
  }, [editor, provider, editable])

  return editor
}

interface EditorCoreProps {
  editor: Editor | null
}

/** The centered, paper-like editor canvas. */
export function EditorCore({ editor }: EditorCoreProps) {
  // Ghost-text AI autocomplete (Tab to accept).
  useAutocomplete(editor)

  return (
    <div className="flex-1 overflow-y-auto scroll-thin px-4 py-6 sm:px-8 sm:py-10">
      <div
        className="relative mx-auto w-full max-w-[900px] rounded-lg bg-bg-primary"
        style={{ boxShadow: '0 1px 8px rgba(0,0,0,0.08)' }}
      >
        <CollaboratorCursors />
        <div className="px-6 py-10 sm:px-[100px] sm:py-[80px]">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  )
}
