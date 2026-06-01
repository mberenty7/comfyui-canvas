import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

// Served from Express under /app in production; proxied to Express in dev.
export default defineConfig({
  root: __dirname,
  base: '/app/',
  plugins: [react()],
  build: {
    outDir: path.resolve(__dirname, '../public/dist'),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    // Forward API + asset requests to the existing Express server.
    proxy: {
      '/api': 'http://localhost:3002',
      '/uploads': 'http://localhost:3002',
      '/models': 'http://localhost:3002',
      '/style.css': 'http://localhost:3002',
    },
  },
});
