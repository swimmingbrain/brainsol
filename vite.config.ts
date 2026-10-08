/// <reference types="vitest/config" />
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [tailwindcss(), sveltekit()],
  server: {
    port: 5173,
    strictPort: true
  },
  preview: {
    port: 4173,
    strictPort: true
  },
  build: {
    // three.js alone is about 600 kB, it loads with the stage
    chunkSizeWarningLimit: 800
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node'
  }
});
