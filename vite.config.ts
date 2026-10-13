import { defineConfig } from 'vite';

export default defineConfig({
  // main.ts awaits the baked-lighting manifest at top level
  build: { target: 'es2022' },
});
