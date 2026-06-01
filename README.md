# DocumentX

A full-stack, real-time collaborative document editor inspired by Google Docs — with **integrated voice chat** and **AI-powered writing features**. Multiple people edit the same document simultaneously, hear and talk to each other, and call on AI for help, all from one polished interface.

![DocumentX](client/public/favicon.svg)

## Features

- **Real-time collaborative editing** — conflict-free (CRDT) editing via Tiptap + Yjs, with live cursors showing each collaborator's name and color.
- **Rich text toolbar** — headings, fonts & sizes, bold/italic/underline/strike/code, text & highlight colors, alignment, bullet/numbered/task lists, blockquotes, code blocks, tables, links, and images.
- **Voice chat** — peer-to-peer WebRTC audio between everyone in the room, with mute toggles and live speaking indicators. The server only relays signaling; audio never touches it.
- **AI assistant** (Groq / Llama 3.3):
  - **Generate** — stream new text into the document at your cursor.
  - **Summarize** — condense the whole document into bullet points.
  - **Grammar** — fix grammar/spelling with a red/green diff and "Accept All".
  - **Minutes** — transcribe what you say (Web Speech API) and turn it into formatted meeting minutes.
  - **Smart autocomplete** — ghost-text suggestions after a 2s pause; press **Tab** to accept.
- **Presence & awareness** — sidebar of online users, voice status, and an "N online" indicator.
- **Polished UX** — light/dark mode, responsive layout, keyboard shortcuts, error boundary, and visible focus rings.

## Architecture

```
Client A (React) ──WebSocket──┐
Client B (React) ──WebSocket──┤   Node.js server
Client C (React) ──WebSocket──┤   ├─ Yjs document sync   (/yjs/:room)
                              │   ├─ WebRTC signaling     (/signal/:room)
WebRTC (P2P audio)            │   └─ AI proxy → Groq (/api/ai)
 A ⇄ B ⇄ C                    ┘
```

- **Document sync** flows through the server (Yjs over WebSocket, kept in memory).
- **Voice audio** is peer-to-peer (the server only brokers offer/answer/ICE).
- **AI requests** are proxied through the server so the Groq API key stays server-side.

The project is a `server/` (Node + Express + `ws` + Groq SDK) and a `client/` (React + Vite + Tiptap + Tailwind + Zustand).

## Prerequisites

- **Node.js 18+** (developed on Node 24)
- A free **Groq API key** for the AI features ([console.groq.com](https://console.groq.com/keys))

## Setup

### 1. Server

```bash
cd server
npm install
cp .env.example .env        # then edit .env and set GROQ_API_KEY
npm run dev                 # starts on http://localhost:3001
```

### 2. Client

In a second terminal:

```bash
cd client
npm install
cp .env.example .env        # defaults already point at localhost:3001
npm run dev                 # starts on http://localhost:5173
```

### 3. Open it

Visit **http://localhost:5173** — you'll be redirected to a fresh document at `/doc/<random-id>`.

To test collaboration & voice, open the **same URL** (`http://localhost:5173/doc/<that-id>`) in a second browser tab or window. Edits, cursors, presence, and voice all sync between them.

> **Voice & transcription notes:** microphone access requires `localhost` or HTTPS. The Web Speech API used for "Minutes" transcription works in Chromium browsers (Chrome/Edge); other browsers show a fallback notice.

## Environment variables

**`server/.env`**

| Variable        | Description                          |
| --------------- | ------------------------------------ |
| `GROQ_API_KEY`  | Groq API key (required for AI).      |
| `PORT`          | Server port (default `3001`).        |

**`client/.env`**

| Variable          | Description                                   |
| ----------------- | --------------------------------------------- |
| `VITE_SERVER_URL` | Server HTTP base URL (default `http://localhost:3001`). |
| `VITE_WS_URL`     | Server WebSocket URL (default `ws://localhost:3001`).   |

## Scripts

| Location  | Command           | What it does                          |
| --------- | ----------------- | ------------------------------------- |
| `server/` | `npm run dev`     | Run the server with hot reload (tsx). |
| `server/` | `npm run build`   | Compile TypeScript to `dist/`.        |
| `server/` | `npm start`       | Run the compiled server.              |
| `client/` | `npm run dev`     | Start the Vite dev server.            |
| `client/` | `npm run build`   | Type-check and build for production.  |
| `client/` | `npm run preview` | Preview the production build.         |

## Tech stack

**Frontend:** React + Vite + TypeScript, Tiptap (ProseMirror) with Yjs collaboration, `y-websocket`, `simple-peer` (WebRTC), Tailwind CSS, Zustand, Lucide icons, DM Sans / DM Serif Display.

**Backend:** Node.js + TypeScript, Express, `ws`, `yjs` + `y-protocols` (self-contained y-websocket-compatible sync), Groq SDK (`llama-3.3-70b-versatile`).

## Notes & limitations

- Document state lives **in memory** on the server — it persists while at least one client is connected, and resets when the server restarts. For durability, swap in `y-leveldb` on the sync server.
- Voice chat is a full mesh (every peer connects to every other peer), which is ideal for small rooms. For larger rooms you'd introduce an SFU.

## Project structure

```
DocumentX/
├── server/
│   └── src/
│       ├── index.ts        # Express + WS entry, path-routed
│       ├── yjs-server.ts   # Yjs sync over WebSocket
│       ├── signaling.ts    # WebRTC signaling relay
│       └── ai.ts           # Groq-backed AI routes
└── client/
    └── src/
        ├── components/     # Editor, VoiceChat, AI, Sidebar, Header, UI
        ├── hooks/          # useCollaboration, useVoice
        ├── store/          # Zustand global store
        ├── utils/          # colors, identity
        └── styles/         # globals.css (design system)
```
