# DocumentX — Interview Cheat Sheet

## Pitch (memorize)
> Full-stack real-time collaborative document editor (lightweight Google Docs). Multiple people edit the same rich-text doc simultaneously with live cursors, talk over P2P WebRTC voice, and use AI writing features (autocomplete, summarize, grammar, meeting minutes). Has accounts, Google-Docs-style sharing with roles, durable storage. Deployed live, entirely on free tiers.

**Stack:** React + TypeScript + Vite · Tiptap/ProseMirror editor · Yjs (CRDT) over WebSockets · Node/Express + `ws` · Firebase Auth + Firestore · WebRTC (simple-peer) voice · Groq (Llama 3.3) AI · Vercel + Render + Firebase.

---

## Architecture (whiteboard this)
```
Browser (React SPA on Vercel)
  ├── HTTPS ──> Firebase Auth + Firestore   (login, doc metadata, access via security rules)
  └── WS/HTTPS ─> Node server on Render
                    ├── /yjs/:docId    real-time doc sync (Yjs)
                    ├── /signal/:docId  WebRTC signaling relay (voice)
                    └── /api/ai         AI proxy → Groq
```
- **Firebase talked to directly from browser** for auth + metadata (security rules enforce access → no CRUD backend needed).
- **Node server exists for what Firebase can't do:** hold long-lived WebSockets (editing + voice signaling) + proxy AI (hide key). Serverless can't hold sockets → that's why a stateful server exists.

---

## Core concepts (the 5 that matter)

**1. CRDT (Yjs) — the heart.**
Two people type same spot → naive "last write wins" corrupts. CRDT: every char has a unique ID + logical position; all clients converge to identical doc regardless of arrival order, no central coordinator.
- Tiptap/ProseMirror = editor UI (wrapper over ProseMirror). `y-prosemirror` binds PM doc ↔ Yjs doc.
- Transport = `y-websocket` protocol; I wrote the **server side from scratch** on `ws` (using `y-protocols` sync+awareness, `lib0` binary encoding) so I could add auth + role enforcement.
- **Awareness** = separate ephemeral channel: who's online, cursors, colors, voice mute/speaking. Not persisted.
- *CRDT vs OT:* OT needs a smart central server to transform/order ops; CRDT pushes merge into the data structure → server just relays bytes. Trade-off: more metadata/state size. Simplicity wins here.

**2. WebRTC voice — signaling vs media.**
Audio flows **P2P directly between browsers**, never through server.
- Server `/signal/:docId` = relay only: forwards SDP offers/answers + ICE candidates. Never touches audio.
- **STUN** (Google public) = discover public IP through NAT. **TURN** = relay fallback for strict/symmetric NAT (optional creds wired; STUN covers most).
- **Web Audio API** measures mic level → broadcast "isSpeaking" over Yjs awareness.
- *P2P vs server-routed:* lower latency, zero server bandwidth/cost. Trade-off: mesh = N² connections, doesn't scale past a few; large calls need an SFU.

**3. Two-layer access control (security).**
Private by default. Owner can (a) invite by email w/ role, (b) toggle "anyone with link." Roles: **owner / editor / viewer.**
- **Layer 1 — Firestore security rules:** declarative, on the DB itself → malicious client hitting Firebase directly still can't read/write unauthorized docs (protects metadata).
- **Layer 2 — server token verification:** WS sends Firebase ID token → server verifies via Firebase Admin SDK → resolves role. **Viewer read-only enforced at protocol level** (inbound edit msgs dropped) — not a bypassable UI trick.
- *Why both?* Different channels: rules cover DB access; live doc content flows over MY WS server (rules don't apply there). Defense in depth.

**4. Why stateful server / not all-Vercel.**
Vercel serverless functions are short-lived → can't hold a persistent WebSocket → real-time collab + voice signaling require it → hence always-on Render container.

**5. Streaming AI over SSE, key server-side.**
Client → my `/api/ai` → server → Groq (Llama 3.3 70B, OpenAI-compatible API). **Key only in server env vars.**
- Streaming (draft gen, ghost-text autocomplete) = **Server-Sent Events**, token-by-token.
- Single-shot: summarize, grammar (diff view), meeting minutes.
- Meeting minutes: **Web Speech API** speech-to-text → transcript → LLM → structured minutes.
- Autocomplete = custom ProseMirror plugin, greyed ghost text after pause, Tab to accept.
- *Why Groq?* Free tier + very fast (LPU hardware). Swapped from paid Anthropic trivially (OpenAI-compatible: base URL + model change).

---

## Data model (Firestore)
- `documents/{docId}` — owner, title, `memberIds[]` (for "shared with me" queries), `roles` map, invited emails, `linkAccess`.
- `docState/{docId}` — persisted Yjs content (base64). **Separate collection** so dashboard metadata listeners don't fire on every keystroke.
- **Persistence:** server loads Yjs state from Firestore on first open; debounce-saves on edits + last-client disconnect → survives restarts/cold starts.

---

## Deployment (all $0)
- Client → **Vercel** (static SPA, CDN, auto-deploy from `main`).
- Server → **Render** free web service (must be long-running for WebSockets).
- Auth/DB → **Firebase Spark** (free).
- Render sleeps ~15min idle → **UptimeRobot pings `/health` every 10min** to keep warm. No card, truly $0.
- CORS locked to client origin.

---

## Debugging war stories
**1. StrictMode broke collab + voice.** React 18 StrictMode mounts→unmounts→remounts in dev. Provider was in `useMemo` → remount destroyed live provider, left dead connection. **Fix:** create/tear down provider in `useEffect` with cleanup, return `null` until ready. *Lesson: real resources (sockets/subscriptions) go in effects with cleanup, not memos.*

**2. Safari-only editor crash.** `TypeError: null is not an object (this.docView.matchesNode)` only on Safari. Reproduced by driving **WebKit via Playwright**; root cause: mount-time effects dispatched into an already-torn-down ProseMirror view; WebKit's effect timing exposed it, Chromium masked it. **Fix:** guard dispatches with `editor.isDestroyed`. *Lesson: reproduce in the actual engine, don't guess.*

---

## Rapid-fire answers
- **Type a char →** PM transaction → `y-prosemirror` → Yjs binary update → WS → server relays + debounce-saves to Firestore → other clients apply → converge. Cursor rides awareness.
- **Offline edits →** Yjs auto-merges divergent states on reconnect (CRDT guarantee). Could add `y-indexeddb` for full offline (good "next step" offer).
- **AI key safe →** server env only; browser never calls Groq directly.
- **Biggest challenge →** understanding CRDTs + building auth-gated, role-enforcing WS server (server-side viewer read-only).
- **What I'd improve →** code-split ~1.3MB bundle, offline persistence, SFU for larger calls, PDF/.docx export.
- **Testing →** Playwright + Firebase Emulator Suite: two users, access isolation, sharing, viewer read-only, persistence across restart.

---

## Glossary (don't get caught out)
- **CRDT** — Conflict-free Replicated Data Type: data structure that merges concurrent edits deterministically.
- **OT** — Operational Transformation: alternative (Google Docs) needing a central transforming server.
- **Yjs** — the CRDT library holding the shared doc.
- **ProseMirror/Tiptap** — the rich-text editor engine / its wrapper.
- **Awareness** — Yjs's ephemeral presence channel (cursors, online status).
- **WebRTC** — browser P2P audio/video/data. **Signaling** = the setup handshake; **STUN/TURN** = NAT traversal.
- **SSE** — Server-Sent Events: one-way server→client streaming over HTTP.
- **SFU** — Selective Forwarding Unit: media server for scaling group calls.
