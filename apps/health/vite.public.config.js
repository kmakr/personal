import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  plugins: [react()],
  base: '/health/',
  define: { 'import.meta.env.VITE_PUBLIC_DASHBOARD': '"true"' },
  build: { outDir: 'dist-public' },
});
