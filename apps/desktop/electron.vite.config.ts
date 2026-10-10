import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const alias = {
  '@hopdock/core': resolve(__dirname, '../../packages/core/src'),
  '@hopdock/ssh': resolve(__dirname, '../../packages/ssh/src'),
  '@hopdock/sync': resolve(__dirname, '../../packages/sync/src'),
  '@hopdock/ui': resolve(__dirname, '../../packages/ui/src'),
};

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
  },
  renderer: {
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react()],
  },
});
