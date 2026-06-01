# Claude Code Prompt: CollabDocs — Real-Time Collaborative Editor with Voice Chat & AI

---

## Project Overview

Build **CollabDocs** — a full-stack, real-time collaborative document editor inspired by Google Docs, with integrated voice chat and AI-powered writing features. Multiple users can simultaneously edit a document, hear and speak to each other, and invoke AI assistance — all from a single, polished interface.

---

## Tech Stack

### Frontend
- **Framework**: React (Vite) + TypeScript
- **Rich Text Editor**: [Tiptap](https://tiptap.dev/) (built on ProseMirror) with the `@tiptap/extension-collaboration` package for CRDT-based real-time editing
- **Real-time Sync**: `y-websocket` (Yjs CRDT provider over WebSocket)
- **Voice Chat**: WebRTC via `simple-peer` library, with a custom signaling server
- **Styling**: Tailwind CSS (utility-first) + custom CSS variables for a refined design system
- **Icons**: Lucide React
- **State**: Zustand for global UI state (active users, voice states, AI panel)
- **Fonts**: `DM Sans` (UI/body) + `DM Serif Display` (document title) from Google Fonts

### Backend
- **Runtime**: Node.js + TypeScript
- **Framework**: Express
- **WebSocket**: `ws` library — handles both Yjs document sync (`y-websocket`) and WebRTC signaling
- **AI Integration**: Anthropic SDK (`@anthropic-ai/sdk`) — Claude claude-sonnet-4-20250514 model
- **CORS, env**: `dotenv`, `cors`

### No Database Required (for now)
- Yjs keeps document state in-memory on the sync server
- Rooms are identified by a `roomId` URL parameter
- Persistence can be added later with `y-leveldb` or similar

---

## Core Architecture

```
Client A (React)  <--WebSocket-->  |                    |
Client B (React)  <--WebSocket-->  |  Node.js Server    |  <-- Anthropic API
Client C (React)  <--WebSocket-->  |                    |
                                   |  - Yjs sync         |
WebRTC (peer-to-peer audio)        |  - WS signaling     |
 A <----> B                        |  - AI proxy         |
 A <----> C
 B <----> C
```

- Document sync goes through the server (Yjs over WebSocket)
- Voice audio is peer-to-peer via WebRTC (server only handles signaling: offer/answer/ICE)
- AI requests are proxied through the server (keeps the API key server-side)

---

## Project Structure

```
collab-docs/
├── server/
│   ├── src/
│   │   ├── index.ts           # Express + WS server entry
│   │   ├── yjs-server.ts      # y-websocket setup
│   │   ├── signaling.ts       # WebRTC signaling over WS
│   │   └── ai.ts              # Anthropic API routes
│   ├── package.json
│   └── tsconfig.json
│
├── client/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── components/
│   │   │   ├── Editor/
│   │   │   │   ├── EditorCore.tsx       # Tiptap instance + Yjs binding
│   │   │   │   ├── Toolbar.tsx          # Formatting toolbar
│   │   │   │   └── CollaboratorCursors.tsx
│   │   │   ├── VoiceChat/
│   │   │   │   ├── VoicePanel.tsx       # Voice participants UI
│   │   │   │   ├── useWebRTC.ts         # WebRTC hook (simple-peer)
│   │   │   │   └── AudioVisualizer.tsx  # Mic level indicator
│   │   │   ├── AI/
│   │   │   │   ├── AIPanel.tsx          # Slide-in AI assistant panel
│   │   │   │   └── useAI.ts             # AI API calls
│   │   │   ├── Sidebar/
│   │   │   │   └── UsersList.tsx        # Online users + voice states
│   │   │   └── UI/
│   │   │       ├── Modal.tsx
│   │   │       └── Tooltip.tsx
│   │   ├── store/
│   │   │   └── useStore.ts              # Zustand global store
│   │   ├── hooks/
│   │   │   ├── useCollaboration.ts      # Yjs + awareness
│   │   │   └── useVoice.ts              # Mic/mute state
│   │   ├── styles/
│   │   │   └── globals.css
│   │   └── utils/
│   │       └── colors.ts                # User color assignment
│   ├── index.html
│   ├── package.json
│   ├── tailwind.config.js
│   └── vite.config.ts
│
└── README.md
```

---

## Feature Requirements

### 1. Real-Time Collaborative Editing

- Use **Tiptap** with `@tiptap/extension-collaboration` (wraps Yjs) for conflict-free real-time sync
- Use `@tiptap/extension-collaboration-cursor` to show other users' live cursors with their name + color
- Each user is identified by a randomly generated name + color on first visit (stored in `localStorage`)
- Users can update their display name via a click on the header avatar
- Document state persists in Yjs in-memory on the server while any client is connected

**Yjs Provider setup:**
```ts
import * as Y from 'yjs'
import { WebsocketProvider } from 'y-websocket'

const ydoc = new Y.Doc()
const provider = new WebsocketProvider(
  'ws://localhost:3001',
  roomId, // from URL: /doc/:roomId
  ydoc
)
provider.awareness.setLocalState({
  user: { name, color }
})
```

### 2. Rich Text Formatting Toolbar

Build a sticky top toolbar with the following controls. Use Tiptap's built-in extensions:

| Group | Controls |
|---|---|
| **History** | Undo, Redo |
| **Font** | Font Family dropdown (serif, sans-serif, monospace), Font Size (8–72px) |
| **Style** | Bold, Italic, Underline, Strikethrough, Code |
| **Color** | Text color picker, Text highlight color picker |
| **Alignment** | Left, Center, Right, Justify |
| **Lists** | Bullet list, Ordered list, Task list (checkboxes) |
| **Structure** | Headings (H1–H4), Blockquote, Code block, Horizontal rule |
| **Insert** | Link, Table (insert N×M), Image URL |

Required Tiptap extensions:
```
@tiptap/starter-kit
@tiptap/extension-font-family
@tiptap/extension-text-style
@tiptap/extension-color
@tiptap/extension-highlight
@tiptap/extension-underline
@tiptap/extension-text-align
@tiptap/extension-task-list
@tiptap/extension-task-item
@tiptap/extension-table
@tiptap/extension-table-row
@tiptap/extension-table-cell
@tiptap/extension-table-header
@tiptap/extension-link
@tiptap/extension-image
@tiptap/extension-collaboration
@tiptap/extension-collaboration-cursor
```

For **Font Size**: create a custom Tiptap mark extension that applies `font-size` via inline style.

### 3. Voice Chat

- Use **WebRTC** (`simple-peer`) for peer-to-peer audio between all participants in the same room
- The server handles **signaling only** (offer/answer/ICE candidates) over WebSocket
- Each user has a **mute toggle** button in the voice panel and in their user card in the sidebar
- Visual mic activity indicator (animated ring / waveform) when a user is speaking — use the Web Audio API (`AnalyserNode`) to measure mic amplitude in real time

**Voice state per user:**
```ts
interface VoiceUser {
  peerId: string
  name: string
  color: string
  isMuted: boolean
  isSpeaking: boolean  // computed from audio level
  stream?: MediaStream
}
```

**Signaling flow:**
1. User joins room → sends `{ type: 'join', roomId, peerId }` to server
2. Server broadcasts `{ type: 'peer-joined', peerId }` to all others in room
3. Existing peers initiate WebRTC connection to new peer (they are the "initiator")
4. Offer/Answer/ICE messages are relayed through server: `{ type: 'signal', to: peerId, from: peerId, data: simplePeerSignalData }`

**Mute behavior:**
- When muted: `track.enabled = false` on the local audio track (does NOT stop the stream)
- The mute state is also broadcast over Yjs awareness so all peers see it in real time
- Muted users show a red mic-off icon in their participant card

### 4. AI Features Panel

A slide-in panel from the right side (or bottom drawer on narrow screens) with the following AI capabilities. All requests go to `POST /api/ai` on the Express server, which calls the Anthropic API.

#### 4a. Generate Text
- User types a prompt in a text box (e.g. "Write an introduction about climate change")
- Claude generates text and inserts it at the current cursor position in the editor
- Show a streaming typewriter effect as the text arrives (use `stream: true` with the Anthropic SDK)

#### 4b. Summarize Document
- One-click: sends the full document text to Claude
- Returns a 3–5 bullet point summary
- Displayed in the AI panel (not inserted into the doc unless the user clicks "Insert")

#### 4c. Fix Grammar & Spelling
- Sends the selected text (or full document if no selection) to Claude
- Claude returns the corrected version
- Show a diff view: original (red strikethrough) vs corrected (green) in the AI panel
- "Accept All" button replaces the selection/document with the corrected version

#### 4d. Meeting Minutes from Voice Transcript
- A "Transcribe Session" button starts recording a running transcript using the **Web Speech API** (`SpeechRecognition`) — this captures what's spoken by the local user
- Each spoken segment is appended to a `transcript` array in the AI panel with a timestamp
- "Generate Minutes" button sends the transcript to Claude with this prompt:
  > "Convert the following voice chat transcript into a professional meeting minutes document with sections: Attendees, Key Discussion Points, Decisions Made, Action Items, and Next Steps."
- The resulting structured document is inserted into the editor at the cursor, formatted with proper headings

#### 4e. Smart Autocomplete (Optional Bonus)
- After the user stops typing for 2 seconds, send the last 500 characters to Claude
- Show a ghost-text suggestion in a lighter color after the cursor
- Press Tab to accept the suggestion

**Server AI Route:**
```ts
// POST /api/ai
// Body: { task: 'generate' | 'summarize' | 'grammar' | 'minutes' | 'autocomplete', content: string, prompt?: string }
// Returns: { result: string }
```

Use `claude-sonnet-4-20250514` for all tasks. Use streaming for `generate` and `autocomplete`. Use single-shot for the rest.

### 5. User Presence & Awareness

- Sidebar shows all currently online users with their avatar (colored circle + initials), cursor color, and voice status
- Use Yjs `awareness` to propagate user state in real time:
  ```ts
  provider.awareness.setLocalStateField('user', {
    name, color, isMuted, isSpeaking, cursorActive
  })
  ```
- A subtle "X users online" indicator in the top header
- When a user leaves, they fade out from the list with a 500ms animation

---

## UI Design Specification

### Overall Aesthetic
**Refined editorial minimalism** — think Notion meets Linear. Clean white surfaces (dark mode supported), precise 1px borders, generous whitespace. The editor feels like a premium writing tool, not a cluttered productivity app.

### Color Palette (CSS variables)
```css
:root {
  --bg-primary: #FFFFFF;
  --bg-secondary: #F7F7F5;
  --bg-tertiary: #F0EFE9;
  --border: #E5E4DF;
  --border-strong: #D0CECA;
  --text-primary: #1A1A18;
  --text-secondary: #6B6A65;
  --text-muted: #9E9D98;
  --accent: #2563EB;          /* primary blue */
  --accent-hover: #1D4ED8;
  --accent-subtle: #EFF6FF;
  --red: #DC2626;
  --red-subtle: #FEF2F2;
  --green: #16A34A;
  --green-subtle: #F0FDF4;
  --amber: #D97706;
  --amber-subtle: #FFFBEB;
  --voice-active: #22C55E;    /* speaking indicator */
  --voice-muted: #EF4444;     /* muted indicator */
}

/* Dark mode */
[data-theme="dark"] {
  --bg-primary: #1C1C1A;
  --bg-secondary: #252522;
  --bg-tertiary: #2E2E2B;
  --border: #3A3A36;
  --border-strong: #4A4A45;
  --text-primary: #F0EFE9;
  --text-secondary: #9E9D98;
  --text-muted: #6B6A65;
  --accent-subtle: #1E3A5F;
}
```

### Typography
```css
/* Load from Google Fonts */
@import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&family=DM+Serif+Display:ital@0;1&display=swap');

body { font-family: 'DM Sans', sans-serif; }
.document-title { font-family: 'DM Serif Display', serif; }
```

### Layout Structure

```
┌─────────────────────────────────────────────────────────────────┐
│  HEADER: Logo | Doc Title (editable) | Users Online | AI Btn | Theme │
├─────────────────────────────────────────────────────────────────┤
│  TOOLBAR: Formatting controls (sticky, scrolls under header)    │
├──────────────────────────────────────┬──────────────────────────┤
│                                      │                          │
│   EDITOR CANVAS                      │   SIDEBAR               │
│   (centered, max-width 900px,        │   (240px wide)          │
│   A4-like paper feel with shadow)    │   - Online Users         │
│                                      │   - Voice Panel         │
│                                      │   - Mute toggles        │
│                                      │   - Speaking indicators │
│                                      │                          │
├──────────────────────────────────────┴──────────────────────────┤
│  AI PANEL (slide-in from right, 380px wide, overlays sidebar)   │
└─────────────────────────────────────────────────────────────────┘
```

### Editor Canvas
- White background, `box-shadow: 0 1px 8px rgba(0,0,0,0.08)` 
- Padding: `80px 100px` (desktop), `40px 24px` (mobile)
- Max width: `900px`, centered in the content area
- Document title: large serif, `font-size: 2.4rem`, contentEditable
- Body text: `font-size: 1rem`, `line-height: 1.8`, `color: var(--text-primary)`

### Toolbar Design
- Sticky below header, `background: var(--bg-primary)`, `border-bottom: 1px solid var(--border)`
- Icon buttons: `32px × 32px`, `border-radius: 6px`, hover: `background: var(--bg-secondary)`
- Active state (bold when bold is active, etc.): `background: var(--accent-subtle)`, `color: var(--accent)`
- Separators between groups: `1px solid var(--border)`, `height: 20px`
- Dropdowns (font family, font size): clean select with no default browser styling

### Sidebar
- `240px` wide, `border-left: 1px solid var(--border)`
- User cards: avatar circle (colored, 32px), name, voice status icon
- Voice Panel section: title "Voice Chat", list of participants
- Each participant card: avatar + name + mic status icon + speaking animation ring

### AI Panel
- Slides in from right, `380px` wide, over the sidebar
- `border-left: 1px solid var(--border)`, `background: var(--bg-primary)`, subtle `box-shadow`
- Tabs at top: Generate | Summarize | Grammar | Minutes
- Each tab: clean icon + label
- Streaming text: monospace font, typewriter animation
- Diff view (grammar tab): red = removed, green = added, both styled as inline highlights

### Voice Controls (bottom of sidebar or floating)
- **Mute Button**: round, 40px, mic icon. **Unmuted**: white bg, green border. **Muted**: red bg, white mic-off icon
- **Speaking Indicator**: animated green pulse ring around avatar when speaking (CSS `@keyframes`)
- Leave Voice button: "Leave" in muted red

### Animations
```css
/* Speaking pulse */
@keyframes speaking-pulse {
  0%   { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.5); }
  70%  { box-shadow: 0 0 0 8px rgba(34, 197, 94, 0); }
  100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

/* AI panel slide in */
@keyframes slide-in {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);   opacity: 1; }
}

/* Cursor fade for users */
@keyframes cursor-fade {
  from { opacity: 1; }
  to   { opacity: 0; }
}
```

---

## Server Implementation Details

### `server/src/index.ts`
```ts
import express from 'express'
import { createServer } from 'http'
import { WebSocketServer } from 'ws'
import cors from 'cors'
import { setupYjsServer } from './yjs-server'
import { setupSignaling } from './signaling'
import { aiRouter } from './ai'

const app = express()
app.use(cors())
app.use(express.json())
app.use('/api/ai', aiRouter)

const server = createServer(app)
const wss = new WebSocketServer({ server })

// Route WS connections: Yjs uses subprotocol 'yjs', signaling uses 'signaling'
wss.on('connection', (ws, req) => {
  const url = new URL(req.url!, `http://${req.headers.host}`)
  if (url.pathname.startsWith('/yjs')) {
    setupYjsServer(ws, req)
  } else if (url.pathname.startsWith('/signal')) {
    setupSignaling(ws, req)
  }
})

server.listen(3001)
```

### `server/src/signaling.ts`
- Maintain a `Map<roomId, Map<peerId, WebSocket>>` of connected peers
- On `join`: store the connection, broadcast `peer-joined` to all others in room
- On `signal`: forward the payload to the specified `to` peer
- On `disconnect`: remove from map, broadcast `peer-left`

### `server/src/ai.ts`
```ts
import Anthropic from '@anthropic-ai/sdk'
const client = new Anthropic() // reads ANTHROPIC_API_KEY from env

router.post('/', async (req, res) => {
  const { task, content, prompt } = req.body
  // ... handle each task type
  // For 'generate': use streaming, pipe SSE to client
  // For others: single-shot, return JSON { result }
})
```

For **streaming** (generate/autocomplete):
```ts
res.setHeader('Content-Type', 'text/event-stream')
const stream = await client.messages.stream({ model: 'claude-sonnet-4-20250514', ... })
for await (const event of stream) {
  if (event.type === 'content_block_delta') {
    res.write(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
  }
}
res.end()
```

---

## Environment Variables

```env
# server/.env
ANTHROPIC_API_KEY=your_key_here
PORT=3001

# client/.env  
VITE_SERVER_URL=http://localhost:3001
VITE_WS_URL=ws://localhost:3001
```

---

## Setup Instructions to Generate

Include a complete `README.md` with:
1. `npm install` in both `client/` and `server/`
2. `cp .env.example .env` and fill in the key
3. `npm run dev` in server (starts on port 3001)
4. `npm run dev` in client (starts on port 5173)
5. Open `http://localhost:5173/doc/my-first-doc` to start
6. Open in two browser tabs to test collaboration

---

## Implementation Notes & Gotchas

1. **Yjs + Tiptap cursor**: Use `@tiptap/extension-collaboration-cursor` and pass the `provider.awareness` object. Cursor labels will auto-render for each connected user.

2. **WebRTC in same-machine tabs**: For local testing, `simple-peer` works fine between two tabs. ICE candidates will resolve via loopback.

3. **Web Speech API**: Only works in Chromium browsers. Add a fallback notice for Firefox. Require `https` in production (or `localhost` for dev).

4. **Audio level detection**: Use `AudioContext → createMediaStreamSource → createAnalyser → getByteFrequencyData`. Poll every ~100ms. Consider speaking if average amplitude > threshold (e.g. 20/255).

5. **Streaming insert**: When inserting AI-generated text, build a Tiptap transaction incrementally. Do NOT replace selection repeatedly — instead collect the full streamed text and insert once, OR use a placeholder node that gets updated.

6. **Tiptap font size**: The built-in `TextStyle` extension supports `fontSize` via `@tiptap/extension-font-family`. Add a custom mark extension if needed:
   ```ts
   import { Extension } from '@tiptap/core'
   // Extend TextStyle to accept fontSize attribute
   ```

7. **Collaboration awareness + voice state**: Yjs awareness is the single source of truth for user presence AND voice state. Set `isMuted` and `isSpeaking` in the awareness state and read it on all clients.

8. **CRDT conflict-free**: Tiptap + Yjs handles all conflict resolution automatically. You do not need to implement operational transforms.

9. **Room ID from URL**: Use React Router v6. Route pattern: `/doc/:roomId`. Generate a random roomId UUID on the home page and redirect.

10. **Performance**: For the AI autocomplete, debounce 2000ms. Cancel in-flight requests if the user types again before the suggestion arrives (use `AbortController`).

---

## Stretch Goals (implement if time allows)

- [ ] Export document as `.docx` using `docx` npm package
- [ ] Export as PDF using `@react-pdf/renderer`
- [ ] Document version history (Yjs has built-in support via `y-protocols/history`)
- [ ] Comments/annotations using Tiptap's comment extension
- [ ] Emoji reactions on text selections
- [ ] AI image generation inserted inline (use Anthropic's vision or a third-party image API)
- [ ] Persistent storage with `y-leveldb` so documents survive server restarts
- [ ] Share link with permissions (view-only vs editor)

---

## Quality Bar

- **No placeholder UI** — every component should be functional
- **No lorem ipsum** — use real example content in the demo
- **Error boundaries** — wrap the editor in a React error boundary
- **Loading states** — show spinners/skeletons for AI requests
- **Responsive** — toolbar collapses to overflow menu on narrow screens; sidebar collapses to a drawer
- **Keyboard shortcuts** — standard ones (Ctrl+B, Ctrl+I, Ctrl+Z etc.) must work via Tiptap
- **Accessibility** — all toolbar buttons have `aria-label`; focus ring visible; all interactive elements keyboard-navigable
