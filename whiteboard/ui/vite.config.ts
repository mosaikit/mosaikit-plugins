import { defineConfig } from 'vite'

// UI of the plugin: relative paths (served from /ui/<id>/ on the origin of the plugins)
export default defineConfig({
  base: './',
  // plugin-api comes from ../mosaikit through a symlink: its dependencies resolve from here
  resolve: { preserveSymlinks: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
})