import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { defineConfig } from 'vite'
import { viteSingleFile } from 'vite-plugin-singlefile'

// https://vite.dev/config/
export default defineConfig({
  // viteSingleFile inlines all JS/CSS straight into index.html on build —
  // used for the offline single-file build (open it from anywhere, no
  // server), and left on for every other build target too (Vercel, the
  // .exe, Docker) since a single self-contained HTML file works identically
  // wherever it's served from, just without separately-cached chunk files.
  plugins: [react(), tailwindcss(), viteSingleFile()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:4001',
        changeOrigin: true,
      },
    },
  },
  build: {
    // A single inlined bundle is inherently one big chunk — the warning
    // about splitting it up doesn't apply to this build strategy.
    chunkSizeWarningLimit: 4000,
  },
})
