import { defineConfig } from 'vite'

export default defineConfig({
  base: './', // Ensures assets load correctly on GitHub Pages sub-directories
  server: {
    host: true,
    port: 5555
  }
})
