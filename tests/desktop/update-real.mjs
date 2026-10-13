import { mkdtempSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import { build } from 'esbuild';
import electron from 'electron';
if (process.platform !== 'win32') { console.log('SKIP real NSIS probe: Windows required'); process.exit(0); }
const directory = mkdtempSync(join(tmpdir(), 'hopdock-update-test-'));
await build({ entryPoints: ['apps/desktop/src/main/update-controller.ts'], outfile: join(directory, 'controller.cjs'), bundle: true, platform: 'node', format: 'cjs', alias: { '@hopdock/core': resolve('packages/core/src') } });
copyFileSync(resolve('apps/desktop/build/app-update.yml'), join(directory, 'app-update.yml'));
const environment = { ...process.env, HOPDOCK_UPDATE_FIXTURE: directory }; delete environment.ELECTRON_RUN_AS_NODE;
const child = spawn(electron, [resolve('tests/desktop/update-real.cjs')], { env: environment, stdio: 'inherit', windowsHide: true });
child.on('exit', (code) => { console.log('Fixture retained:', directory); process.exitCode = code ?? 1; });
