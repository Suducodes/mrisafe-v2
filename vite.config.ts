import { defineConfig } from 'vite';

export default defineConfig({
  base: './',                       // relative URLs: the build runs from any sub-path (e.g. GitHub Pages)
  build: {
    target: 'es2022',               // main.ts awaits the baked-lighting manifest at top level
    // three.js in its own chunk: it changes far less often than the app, so browsers keep it cached
    rollupOptions: { output: { manualChunks: { three: ['three'] } } },
    chunkSizeWarningLimit: 700,
  },
});
