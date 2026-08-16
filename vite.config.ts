import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import { copyFileSync } from 'fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'copy-manifest',
      closeBundle() {
        try {
          copyFileSync('manifest.json', 'dist/manifest.json')
          console.log('manifest.json copied to dist/')
        } catch (err) {
          console.error('Failed to copy manifest.json:', err)
        }
      }
    }
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(import.meta.dirname, 'index.html'),
        offscreen: resolve(import.meta.dirname, 'src/infrastructure/ocr/offscreen/offscreen.html'),
        background: resolve(import.meta.dirname, 'src/service-worker/index.ts'),
      },
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name].[ext]',
      },
    },
  },
})
