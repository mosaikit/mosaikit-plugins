import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// plugin-api of the checkout that sits beside this one (<container>/mosaikit): in a worktree the build then uses
// the API of the worktree, not the one of the main checkout that node_modules points to
const api = fileURLToPath(new URL('../../../mosaikit/ui/plugin-api/src/', import.meta.url))

// UI of the plugin: relative paths (served from /ui/<id>/ on the origin of the plugins)
export default defineConfig({
  base: './',
  // plugin-api comes from ../mosaikit through a symlink: its dependencies resolve from here
  resolve: {
    preserveSymlinks: true,
    alias: [
      { find: /^@mosaikit\/plugin-api$/, replacement: api + 'index.ts' },
      { find: /^@mosaikit\/plugin-api\/style\.css$/, replacement: api + 'style.css' },
    ],
  },
  build: { outDir: 'dist', emptyOutDir: true, sourcemap: true },
})
