import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Link previews for the public page only; the local dashboard shares index.html.
const url = 'https://theoazriel.com/health/';
const title = 'Health | Theo Azriel';
const description =
  'A garden of daily steps and active minutes. Real Fitbit records, shared seven days later.';
const meta = [
  ['name', 'description', description],
  ['property', 'og:type', 'website'],
  ['property', 'og:title', title],
  ['property', 'og:description', description],
  ['property', 'og:url', url],
  ['property', 'og:image', 'https://theoazriel.com/og.png'],
  ['property', 'og:image:width', '1200'],
  ['property', 'og:image:height', '630'],
  ['name', 'twitter:card', 'summary_large_image'],
];
const publicMeta = {
  name: 'public-meta',
  transformIndexHtml: () => [
    ...meta.map(([key, name, content]) => ({
      tag: 'meta',
      attrs: { [key]: name, content },
      injectTo: 'head',
    })),
    { tag: 'link', attrs: { rel: 'canonical', href: url }, injectTo: 'head' },
  ],
};

export default defineConfig({
  plugins: [react(), publicMeta],
  base: '/health/',
  define: { 'import.meta.env.VITE_PUBLIC_DASHBOARD': '"true"' },
  build: { outDir: 'dist-public' },
});
