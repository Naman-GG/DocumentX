# DocumentX

A full-stack, real-time collaborative document editor — like Google Docs — with **accounts**, **per-document sharing & privacy**, **integrated voice chat**, and **AI writing tools**. Sign in, manage your documents from a dashboard, share them with specific people (or via link), edit together in real time with live cursors, talk over voice, and call on AI to help write.

## Features

- **Accounts** — email/password and one-click Google sign-in (Firebase Auth), with editable display names.
- **Document dashboard** — your documents + ones shared with you; create, rename, delete.
- **Privacy & sharing (Google-Docs-style)** — documents are private by default. Owners can invite people by email (Editor/Viewer) and/or enable an "anyone with the link" toggle (view or edit). Access is enforced both by Firestore rules and by the WebSocket server.
- **Real-time collaborative editing** — conflict-free (CRDT) via Tiptap + Yjs, with live cursors showing each person's name and color.
- **Durable storage** — documents persist in Firestore and survive server restarts.
- **Rich text toolbar** — headings, fonts & sizes, bold/italic/underline/strike/code, colors & highlight, alignment, bullet/numbered/task lists, blockquotes, code blocks, tables, links, images.
- **Voice chat** — peer-to-peer WebRTC audio between people in a document, mute toggles, and live speaking indicators (STUN + optional TURN).
- **AI assistant** (Groq / Llama 3.3) — generate, summarize, fix grammar (diff + accept), meeting minutes from speech, and ghost-text autocomplete (Tab to accept).
- **Polished UX** — light/dark mode, responsive layout, keyboard shortcuts, error boundaries, accessible controls.

## Architecture

```
Browser ──HTTPS──▶ Firebase Auth + Firestore   (login, profiles, doc metadata + access, Yjs persistence)
   │   └─ ID token
   ▼
Node server (Render) — auth-gated:
   ├─ /yjs/:docId     Yjs sync     (token-verified, role-enforced, persisted to Firestore)
   ├─ /signal/:docId  WebRTC       (token-verified)
   └─ /api/ai         Groq proxy   (key stays server-side; CORS locked to client origin)
Client (Vercel): React SPA
WebRTC audio is peer-to-peer (server only relays signaling).
```

- A `/doc/:docId` URL only opens if the signed-in user has access (owner, invited, or link-access).
- `viewer` role is read-only — enforced on the server (it drops a viewer's edits), not just in the UI.

## Prerequisites

- **Node.js 18+** (developed on Node 24)
- A free **Firebase** project (auth + database)
- A free **Groq** API key for AI ([console.groq.com/keys](https://console.groq.com/keys))

---

## 1. Firebase setup (once)

1. Create a project at [console.firebase.google.com](https://console.firebase.google.com/).
2. **Authentication** → Get started → enable **Email/Password** and **Google** sign-in providers.
3. **Firestore Database** → Create database (Production mode).
4. **Project settings → General → Your apps** → add a **Web app** → copy the config values into `client/.env` (the `VITE_FIREBASE_*` vars).
5. **Project settings → Service accounts** → **Generate new private key** → you'll paste this JSON into the server's `FIREBASE_SERVICE_ACCOUNT` env var (as a single line).
6. **Firestore security rules** — copy the contents of [`firestore.rules`](./firestore.rules) into **Firestore → Rules** and Publish (or run `firebase deploy --only firestore:rules` with the Firebase CLI).

> The first time the dashboard runs a "shared with me" query, Firestore may print a one-time link in the browser console to create a simple index — click it if prompted (the app avoids composite indexes, so this is rarely needed).

## 2. Run locally

```bash
# Server
cd server
npm install
cp .env.example .env        # set GROQ_API_KEY and FIREBASE_SERVICE_ACCOUNT
npm run dev                 # http://localhost:3001

# Client (second terminal)
cd client
npm install
cp .env.example .env        # set the VITE_FIREBASE_* values
npm run dev                 # http://localhost:5173
```

Open **http://localhost:5173**, sign up, and create a document. To test collaboration, share it (or enable link access) and open it as another user in a different browser/profile.

### Option B — local Firebase Emulators (no real project needed)

Great for development without touching real data:

```bash
# Terminal 1 — emulators (needs Java)
firebase emulators:start --project demo-documentx --only auth,firestore

# Terminal 2 — server pointed at emulators
cd server
FIRESTORE_EMULATOR_HOST=localhost:8080 \
FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
FIREBASE_PROJECT_ID=demo-documentx \
GROQ_API_KEY=your_key npm run dev

# Terminal 3 — client in emulator mode
cd client
# in client/.env.local:  VITE_USE_FIREBASE_EMULATOR=true  and  VITE_FIREBASE_PROJECT_ID=demo-documentx
npm run dev
```

---

## 3. Deploy (free: Vercel + Render + Firebase)

### Server → Render

1. New **Web Service** from your repo, root directory `server`.
2. Build command: `npm install && npm run build` · Start command: `npm start`.
3. Environment variables:
   - `GROQ_API_KEY` — your Groq key
   - `FIREBASE_SERVICE_ACCOUNT` — the service-account JSON (one line)
   - `CLIENT_ORIGIN` — your Vercel URL, e.g. `https://your-app.vercel.app`
4. Deploy and note the URL, e.g. `https://documentx-server.onrender.com`.

### Client → Vercel

1. Import the repo, set root directory to `client` (framework: Vite).
2. Environment variables:
   - `VITE_FIREBASE_*` — your Firebase web config
   - `VITE_SERVER_URL` — `https://<your-render-app>.onrender.com`
   - `VITE_WS_URL` — `wss://<your-render-app>.onrender.com` (note **wss**)
   - optional `VITE_TURN_*` — TURN credentials for voice on restrictive networks
3. Deploy. `vercel.json` already handles SPA routing.
4. Back in **Firebase → Authentication → Settings → Authorized domains**, add your Vercel domain so Google sign-in works.

### Keep the free server awake (no cold starts)

Render's free web service sleeps after ~15 min idle. Add a free uptime pinger so it stays warm:

- [UptimeRobot](https://uptimerobot.com/) or [cron-job.org](https://cron-job.org/): create an HTTP monitor hitting `https://<your-render-app>.onrender.com/health` every **10 minutes**.

That's it — fully deployed, $0, no credit card.

---

## Environment variables

**`server/.env`**

| Variable                   | Description                                            |
| -------------------------- | ------------------------------------------------------ |
| `GROQ_API_KEY`             | Groq API key (AI features).                            |
| `FIREBASE_SERVICE_ACCOUNT` | Service-account JSON, one line (verifies tokens, reads docs). **Server-only secret.** |
| `CLIENT_ORIGIN`            | Allowed CORS origin(s) in prod (your client URL).      |
| `PORT`                     | Server port (Render sets this automatically).          |

**`client/.env`**

| Variable                  | Description                                  |
| ------------------------- | -------------------------------------------- |
| `VITE_FIREBASE_*`         | Firebase web config (public).                |
| `VITE_SERVER_URL`         | Server HTTP base URL.                        |
| `VITE_WS_URL`             | Server WebSocket URL (`wss://` in prod).     |
| `VITE_TURN_*`             | Optional TURN server for voice.              |
| `VITE_USE_FIREBASE_EMULATOR` | `true` to use local emulators.            |

## Data model (Firestore)

- `documents/{docId}` — `ownerId`, `ownerEmail`, `title`, `memberIds[]`, `memberEmails{}`, `roles{}` (uid→editor/viewer), `invitedEmails[]`, `invites[]`, `linkAccess` (none/viewer/editor), timestamps.
- `docState/{docId}` — the persisted Yjs document state (base64). Written/read only by the server (Admin SDK).

## Tech stack

**Frontend:** React + Vite + TypeScript, Tiptap (ProseMirror) + Yjs, `y-websocket`, `simple-peer` (WebRTC), Firebase Auth + Firestore, Tailwind CSS, Zustand, Lucide.

**Backend:** Node.js + TypeScript, Express, `ws`, `yjs` + `y-protocols`, Firebase Admin SDK, Groq SDK (`llama-3.3-70b-versatile`).

## Notes & limitations

- Persisted document state is stored as a single Firestore field (1 MB limit) — ample for typical text documents; very large docs would need Cloud Storage instead.
- Voice is a full WebRTC mesh (ideal for small groups). STUN handles most networks; configure TURN for restrictive/symmetric NATs.
- Web Speech transcription (AI "Minutes") works in Chromium browsers; others show a fallback notice.

## Project structure

```
DocumentX/
├── firestore.rules          # Firestore security rules
├── firebase.json            # Emulator config
├── server/src/
│   ├── index.ts             # Express + WS entry
│   ├── firebase.ts          # Admin SDK init
│   ├── access.ts            # Token verify + role resolution
│   ├── yjs-server.ts        # Auth-gated, role-enforced Yjs sync
│   ├── yjs-persistence.ts   # Firestore-backed document persistence
│   ├── signaling.ts         # Auth-gated WebRTC signaling
│   └── ai.ts                # Groq-backed AI routes
└── client/src/
    ├── auth/AuthProvider.tsx
    ├── pages/               # Login, Dashboard
    ├── lib/                 # firebase, documents (Firestore CRUD + access)
    ├── components/          # Editor, VoiceChat, AI, Sidebar, Header, ShareModal, UI
    ├── hooks/               # useCollaboration, useVoice
    └── store/               # Zustand store
```
