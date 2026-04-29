import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/taelimelectronics/',  // process.env.VERCEL ? '/' : '/taelimelectronics/',
  plugins: [react()],
})

