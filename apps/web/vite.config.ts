import path from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  server: {
    host: true,
    port: 5173,
    // Dans Docker sous Windows, le dossier monté ne remonte pas les événements de
    // fichiers : sans scrutation, Vite ne voit pas les modifications (cf. docker-compose.yml).
    watch: { usePolling: process.env.VITE_USE_POLLING === 'true' },
  },
})
