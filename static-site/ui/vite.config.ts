import { defineConfig } from 'vite'

// UI del plugin: percorsi relativi (servita da /ui/<id>/ sull'origine dei plugin)
export default defineConfig({
  base: './',
  // plugin-api arriva da ../mosaikit via symlink: le sue dipendenze si risolvono da qui
  resolve: { preserveSymlinks: true },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
})