import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

// simple-peer expects Node globals (Buffer, process, events, stream) in the
// browser — the polyfill plugin shims them so WebRTC signaling works.
export default defineConfig({
  plugins: [
    react(),
    nodePolyfills({
      globals: { Buffer: true, global: true, process: true },
    }),
  ],
  server: {
    port: 5173,
  },
})
