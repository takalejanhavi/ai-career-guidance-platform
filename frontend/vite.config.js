import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.BACKEND_PROXY_URL || 'http://localhost:4000',
        changeOrigin: true,
      },
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react':    ['react', 'react-dom', 'react-router-dom'],
          'vendor-query':    ['@tanstack/react-query'],
          'vendor-motion':   ['framer-motion'],
          'vendor-charts':   ['recharts'],
          'vendor-forms':    ['react-hook-form', '@hookform/resolvers', 'zod'],
          'vendor-ui':       ['lucide-react', 'react-hot-toast', 'clsx', 'tailwind-merge'],
          'vendor-utils':    ['date-fns', 'axios', 'zustand'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
});
