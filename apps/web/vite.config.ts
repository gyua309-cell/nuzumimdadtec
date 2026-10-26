import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The browser talks ONLY to the API (never to PostgreSQL). In development the
// Vite server proxies /api to the NestJS backend so cookies stay same-origin.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
