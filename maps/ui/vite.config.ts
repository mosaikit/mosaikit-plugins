import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url))

// UI of the plugin: relative paths (served from /ui/<id>/ on the origin of the plugins).
// Two pages: the app (index.html) and the view of the public links (public.html).
export default defineConfig({
  base: './',
  // plugin-api comes from ../mosaikit through a symlink: its dependencies resolve from here
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
