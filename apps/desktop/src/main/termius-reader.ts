import { app } from 'electron';
import { execFile } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** Never sends plaintext credentials to renderer or writes an export file. */
export async function readTermiusProfile(): Promise<string> {
  if (process.env.HOPDOCK_TEST_PROFILE && process.env.HOPDOCK_TEST_TERMIUS_BUNDLE) return readFileSync(process.env.HOPDOCK_TEST_TERMIUS_BUNDLE, 'utf8');
  const base = app.isPackaged ? join(process.resourcesPath, 'termius-reader') : fileURLToPath(new URL('../../resources/termius-reader/', import.meta.url));
  const executable = join(base, `hopdock-termius-reader${process.platform === 'win32' ? '.exe' : ''}`);
  if (!existsSync(executable)) throw new Error('TERMIUS_READER_UNAVAILABLE');
  return new Promise((resolveResult, reject) => {
    execFile(executable, [], { windowsHide: true, timeout: 120000, maxBuffer: 64 * 1024 * 1024, encoding: 'utf8' }, (error, stdout, stderr) => {
      if (error) {
        let code = error.killed ? 'TERMIUS_IMPORT_TIMEOUT' : error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER' ? 'TERMIUS_PROFILE_TOO_LARGE' : 'TERMIUS_READ_FAILED';
        try { const result = JSON.parse(stderr); if (/^TERMIUS_[A-Z_]+$/.test(result.code)) code = result.code; } catch {}
        reject(new Error(code));
      } else resolveResult(stdout);
    });
  });
}
