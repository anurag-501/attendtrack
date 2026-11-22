import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => ({
  base: mode === 'ghpages' ? '/attendtrack/' : '/',
  plugins: [react()],
}))
