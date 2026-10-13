import { existsSync, readFileSync, writeFileSync, renameSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { KeyFiles } from './sync-vault';

export function keyFileStorage(directory: string): KeyFiles {
  const path = (id: string) => {
    if (!/^[\w-]{1,128}$/.test(id)) throw new Error('Invalid key id.');
    return join(directory, id);
  };
  return {
    path,
    read: (id) => existsSync(path(id)) ? readFileSync(path(id), 'utf8') : null,
    write: (id, value) => {
      const target = path(id);
      const temporary = `${target}.${randomUUID()}.tmp`;
      try { writeFileSync(temporary, value, { mode: 0o600 }); renameSync(temporary, target); }
      finally { rmSync(temporary, { force: true }); }
    },
    delete: (id) => { rmSync(path(id), { force: true }); },
  };
}
