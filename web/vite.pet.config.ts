import { defineConfig, mergeConfig } from 'vite';
import base from './vite.config';

export default mergeConfig(
  base,
  defineConfig({
    build: { outDir: '../dist-pet', rolldownOptions: { input: 'pet.html' } },
    server: { port: 5174, strictPort: true, open: '/pet.html' },
  }),
);
