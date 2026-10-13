import { defineConfig, externalizeDepsPlugin, loadEnv } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { resolveSupabaseBuildConfig } from './build-supabase';

const version = JSON.parse(readFileSync(resolve(__dirname, 'package.json'), 'utf8')).version as string;
let commit = 'unknown';
try {
  commit = execFileSync('git', ['rev-parse', '--short=7', 'HEAD'], { cwd: resolve(__dirname, '../..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
} catch {
  const ciCommit = process.env['GITHUB_SHA'];
  if (ciCommit && /^[a-f\d]{40}$/i.test(ciCommit)) commit = ciCommit.slice(0, 7);
}
const buildDefines = { __HOPDOCK_VERSION__: JSON.stringify(version), __HOPDOCK_COMMIT__: JSON.stringify(commit) };

const alias = {
  '@hopdock/core': resolve(__dirname, '../../packages/core/src'),
  '@hopdock/ssh': resolve(__dirname, '../../packages/ssh/src'),
  '@hopdock/sync': resolve(__dirname, '../../packages/sync/src'),
  '@hopdock/ui': resolve(__dirname, '../../packages/ui/src'),
};

export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, resolve(__dirname, '../..'), 'SUPABASE_'), ...process.env };
  const backend = resolveSupabaseBuildConfig(env);
  return {
  main: {
    define: { __SUPABASE_URL__: JSON.stringify(backend.url), __SUPABASE_PUBLISHABLE_KEY__: JSON.stringify(backend.publishableKey) },
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
  },
  preload: {
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: 'index.cjs' } } },
    define: buildDefines,
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
  },
  renderer: {
    define: buildDefines,
    root: 'src/renderer',
    resolve: { alias },
    plugins: [react()],
  },
  };
});
