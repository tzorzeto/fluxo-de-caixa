import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/login': 'http://api:3000',
      '/lancamentos': 'http://api:3000',
    },
  },
  build: {
    outDir: 'dist',
  },
});
