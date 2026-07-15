import { defineConfig } from 'vite';

export default defineConfig({
  base: '/pingpong-sim/',
  build: {
    outDir: 'dist',
    target: 'esnext',
  },
});
