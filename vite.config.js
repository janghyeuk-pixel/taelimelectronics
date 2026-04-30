import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: './',   // 또는 그냥 '/' 로 지정
  plugins: [react()],
})

