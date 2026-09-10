import { defineConfig } from 'vite'

export default defineConfig({
  base: '/solar-system/',
  server: {
    host: true,
    port: 5173,
  },
})
