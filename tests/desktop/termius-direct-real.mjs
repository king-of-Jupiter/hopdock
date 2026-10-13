// Opt-in integration check against this user's real Termius profile, with an isolated
// destination. It never connects to imported hosts and never logs names or credentials.
import { _electron as electron } from 'playwright';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';

const profile = mkdtempSync(join(tmpdir(), 'hopdock-termius-real-'));
let app;
try {
  app = await electron.launch({ args: [resolve('tests/desktop/launch.cjs')], env: { ...process.env, HOPDOCK_TEST_PROFILE: profile, HOPDOCK_TEST_TERMIUS_BUNDLE: '' }, timeout: 30000 });
  const page = await app.firstWindow(); await page.waitForLoadState();
  await app.evaluate(({ dialog }) => { dialog.showOpenDialog = async () => { throw new Error('Direct Termius import must not open a picker'); }; });
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Import from Termius', exact: true }).click();
  await page.locator('.hd-import-result').waitFor({ timeout: 120000 });
  const counts = await page.evaluate(async () => { const v = await window.hopdock.vault.get(); return { hosts: v.hosts.length, groups: v.groups.length, keys: v.keys.length, snippets: v.snippets.length }; });
  assert.ok(counts.hosts > 0);
  if (process.env.HOPDOCK_TEST_IMPORT_HOST_NAME) {
    const verified = await page.evaluate(async (name) => {
      const host = (await window.hopdock.vault.get()).hosts.find((entry) => entry.name === name);
      return !!host?.username && !!(await window.hopdock.vault.readHostPassword(host.id));
    }, process.env.HOPDOCK_TEST_IMPORT_HOST_NAME);
    assert.ok(verified, 'Requested host credentials must be restored');
  }
  const vault = JSON.parse(readFileSync(join(profile, 'hopdock/hopdock-vault.json'), 'utf8'));
  assert.ok(vault.hosts.every((h) => !Object.hasOwn(h, 'password')));
  await page.getByRole('button', { name: 'Import from Termius', exact: true }).click();
  await page.locator('.hd-import-result').getByText(/0 hosts/).waitFor({ timeout: 120000 });
  console.log(JSON.stringify({ passed: true, counts, filePicker: false, duplicateImport: 'skipped' }));
} finally {
  if (app) await app.close();
  const target = resolve(profile);
  if (dirname(target) !== resolve(tmpdir()) || !basename(target).startsWith('hopdock-termius-real-')) throw new Error('Unsafe test cleanup path');
  rmSync(target, { recursive: true, force: true });
}
