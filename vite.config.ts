import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  resolve: {
    alias: {
      '@meshpilot/auth': resolve(__dirname, '../shared/auth'),
    },
  },
  server: {
    fs: {
      allow: ['..'],
    },
    port: 1420,
    strictPort: true,
  },
  envPrefix: ["VITE_", "TAURI_"],
  build: {
    target: "es2023",
    rollupOptions: {
      input: {
        main:   resolve(__dirname, 'index.html'),
        widget: resolve(__dirname, 'widget.html'),
        overlay: resolve(__dirname, 'overlay.html'),
      },
    },
  },
})
