import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static SPA. Output goes to dist/ which is what Cloudflare Pages publishes.
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
