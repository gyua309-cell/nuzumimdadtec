import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const BUILD_ID = `${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;

// The browser talks ONLY to the API (never to PostgreSQL). In development the
// Vite server proxies /api to the NestJS backend so cookies stay same-origin.
export default defineConfig({
  base: './',
  define: {
    __APP_BUILD_ID__: JSON.stringify(BUILD_ID),
  },
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'idham-build-meta',
      generateBundle() {
        this.emitFile({
          type: 'asset',
          fileName: 'build-meta.json',
          source: JSON.stringify({ buildId: BUILD_ID, builtAt: new Date().toISOString() }, null, 2),
        });
      },
    },
  ],
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: false } },
  },
  build: {
    chunkSizeWarningLimit: 1400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/echarts') || id.includes('node_modules/zrender')) return 'vendor-charts';
          if (id.includes('node_modules/exceljs')) return 'vendor-excel';
          if (id.includes('node_modules/jspdf') || id.includes('node_modules/html2canvas-pro')) return 'vendor-pdf';
          if (id.includes('node_modules/lucide-react')) return 'vendor-icons';
          if (id.includes('node_modules/@tanstack/react-query')) return 'vendor-query';
          if (
            id.includes('node_modules/react/') ||
            id.includes('node_modules/react-dom/') ||
            id.includes('node_modules/react-router')
          ) {
            return 'vendor-react';
          }
        },
      },
    },
  },
});
