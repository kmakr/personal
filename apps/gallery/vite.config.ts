import { createRequire } from 'node:module';
import { readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { imagetools } from 'vite-imagetools';

// sharp comes with vite-imagetools (through imagetools-core); borrowing that
// copy avoids a second dependency that would reshuffle the shared lockfile.
const require = createRequire(import.meta.url);
const fromPlugin = createRequire(require.resolve('vite-imagetools'));
const sharp = (() => {
  try {
    return fromPlugin('sharp');
  } catch {
    return createRequire(fromPlugin.resolve('imagetools-core'))('sharp');
  }
})() as typeof import('sharp');

/**
 * Small prints for the theoazriel.com homepage, which shows one at random by
 * the Gallery link: preview.json lists every roll's frames as 240x160 WebP
 * crops at stable paths. Loose top-level images stay out of it.
 */
function homepagePreview(): Plugin {
  return {
    name: 'homepage-preview',
    apply: 'build',
    async generateBundle() {
      const root = new URL('./src/photos/', import.meta.url);
      const frames: { src: string; roll: string }[] = [];
      const rolls = (await readdir(root, { withFileTypes: true })).filter((entry) =>
        entry.isDirectory(),
      );
      for (const roll of rolls.map((entry) => entry.name).sort()) {
        const files = (await readdir(new URL(`${roll}/`, root)))
          .filter((file) => /\.jpe?g$/i.test(file))
          .sort();
        for (const file of files) {
          const src = `preview/${roll}-${file.replace(/\.[^.]+$/, '').toLowerCase()}.webp`;
          const source = await sharp(fileURLToPath(new URL(`${roll}/${file}`, root)))
            .rotate()
            .resize({ width: 240, height: 160, fit: 'cover' })
            .webp({ quality: 72 })
            .toBuffer();
          this.emitFile({ type: 'asset', fileName: src, source });
          frames.push({
            src,
            roll: roll.replace(/(^|-)(\w)/g, (_, gap, c) => (gap ? ' ' : '') + c.toUpperCase()),
          });
        }
      }
      this.emitFile({
        type: 'asset',
        fileName: 'preview.json',
        source: JSON.stringify({ frames }),
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    // The regex include (rather than the default glob) also matches uppercase .JPG.
    imagetools({ include: /\.(jpe?g|png|webp|avif|tiff|gif)(\?.*)?$/i }),
    homepagePreview(),
  ],
  server: {
    port: Number(process.env.PORT) || 5199,
  },
});
