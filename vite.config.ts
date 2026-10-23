import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// GitHub Pages: https://wang-dada123.github.io/cyberpunk-drive/
export default defineConfig({
  plugins: [react()],
  base: '/cyberpunk-drive/',
})
