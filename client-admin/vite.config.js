import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Served under /admin/ in production (path-based routing alongside the guest
// app on the same domain — see README "Deployment"), but at the dev server's
// root during local development.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/admin/' : '/',
}))
