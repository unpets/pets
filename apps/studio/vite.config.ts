import { commitSha } from './build-info.js';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

export default defineConfig({
  define: { __PETS_COMMIT_SHA__: JSON.stringify(commitSha() ?? null) },
  plugins: [svelte(), tailwindcss(), viteSingleFile()],
  publicDir: false,
  assetsInclude: ['**/*.glb', '**/*.wasm'],
  base: './',
  build: { outDir: '../../dist', emptyOutDir: true },
  server: { host: '127.0.0.1', port: 5173 },
  preview: { host: '127.0.0.1', port: 4173 },
});
