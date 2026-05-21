/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

const watchUsePolling = process.env.CHOKIDAR_USEPOLLING === 'true'
const watchInterval = Number(process.env.CHOKIDAR_INTERVAL ?? 300)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    visualizer({
      filename: 'dist/stats.html',
      template: 'treemap',
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    allowedHosts: ['.cloudpub.ru'],
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/app/**/*.tsx',
        './src/features/**/*.tsx',
        './src/shared/**/*.tsx',
      ],
    },
    watch: {
      usePolling: watchUsePolling,
      interval: watchInterval,
    },
    proxy: {
      '/api': {
        // В Docker dev: VITE_PROXY_TARGET=http://backend:8080
        // Локально без Docker: http://localhost:8080
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        rewrite: (path) => path.replace(/^\/api/, ''),
        changeOrigin: true,
      },
      '/auth': {
        target: process.env.VITE_PROXY_TARGET || 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    css: false,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**'],
  },
})
