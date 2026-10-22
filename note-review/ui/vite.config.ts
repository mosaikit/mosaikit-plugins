import { defineConfig } from 'vite'

// UI of the extension: relative paths (served from /ui/<id>/ on the origin of the plugins). Two pages:
// index.html (the extension opened on its own) and tab.html (the "Review" tab of a note).
export default defineConfig({
  base: './',
  // plugin-api comes from ../mosaikit through a symlink: its dependencies resolve from here
  resolve: { preserveSymlinks: true },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: { input: { index: 'index.html', tab: 'tab.html' } },
  },
})
