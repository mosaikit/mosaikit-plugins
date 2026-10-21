import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// UI del plugin: percorsi relativi (servita da /ui/<id>/ sull'origine dei plugin).
// Due pagine: l'app (index.html) e la vista dei link pubblici (public.html).
export default defineConfig({
  base: './',
  // plugin-api arriva da ../mosaikit via symlink: le sue dipendenze si risolvono da qui
  resolve: { preserveSymlinks: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: { index: here('./index.html'), public: here('./public.html') },
    },
  },
})
