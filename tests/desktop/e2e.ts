import { _electron as electron } from 'playwright';
import { expect } from 'playwright/test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { generateKeyPairSync } from 'node:crypto';
import { publicKeyFromPrivate } from '@hopdock/ssh';
import { startSSH } from './ssh-server.mjs';
import { startSyncServer } from './sync-server.mjs';

const root = fs.mkdtempSync(join(tmpdir(), 'hopdock-desktop-test-'));
const profile = join(root, 'profile'), remoteRoot = join(root, 'remote');
fs.mkdirSync(join(profile, 'hopdock'), { recursive: true });
for (const dir of ['sub', 'target']) fs.mkdirSync(join(remoteRoot, 'root', dir), { recursive: true });
fs.writeFileSync(join(remoteRoot, 'root/hello.txt'), 'hello-local-ssh');
fs.writeFileSync(join(remoteRoot, 'root/sub/nested.txt'), 'nested');
fs.writeFileSync(join(root, 'upload.bin'), Buffer.from([0, 1, 255, 2, 3]));
fs.writeFileSync(join(profile, 'hopdock/hopdock-vault.json'), JSON.stringify({ hosts: [], groups: [{ id: 'g-test', vaultId: 'v-personal', name: 'Local test', sort: 0 }], keys: [], snippets: [], lastSyncAt: new Date(0).toISOString() }));
const server = await startSSH(remoteRoot);
const syncServer = await startSyncServer();
const app = await electron.launch({ args: [resolve('tests/desktop/launch.cjs')], env: { ...process.env, HOPDOCK_TEST_PROFILE: profile, HOPDOCK_TEST_SYNC_SERVER: syncServer.url, SSH_AUTH_SOCK: server.agentPath }, timeout: 30000 });
const page = await app.firstWindow(); page.setDefaultTimeout(7000);
const errors: string[] = [], results: any[] = [];
await app.evaluate(({ dialog }) => {
  const state = dialog as any; state.nextPaths = null; state.fileCalls = [];
  dialog.showOpenDialog = (async (_window: unknown, options: any) => { state.fileCalls.push({ mode: 'open', ...options }); const paths = state.nextPaths; state.nextPaths = null; return { canceled: paths === null, filePaths: paths ?? [] }; }) as any;
  dialog.showSaveDialog = (async (_window: unknown, options: any) => { state.fileCalls.push({ mode: 'save', ...options }); const paths = state.nextPaths; state.nextPaths = null; return { canceled: paths === null, filePath: paths?.[0] }; }) as any;
  for (const method of ['showMessageBox', 'showErrorBox', 'showOpenDialogSync', 'showSaveDialogSync', 'showMessageBoxSync']) state[method] = () => { throw new Error('Forbidden system message dialog: ' + method); };
});
page.on('dialog', (dialog) => { errors.push('Forbidden native JavaScript dialog: ' + dialog.type()); void dialog.dismiss(); });
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
let hostId = '', keyId = '', rsaId = '', importedId = '';
const step = async (name: string, action: () => Promise<void>) => {
  try { await action(); results.push({ name, passed: true }); console.log('PASS', name); }
  catch (e) { results.push({ name, passed: false, error: String(e) }); console.log('FAIL', name, String(e)); await page.screenshot({ path: `docs/design/native-failure-${results.length}.png` }).catch(() => {}); }
};
const hosts = async () => { await page.locator('.hd-pill', { hasText: 'Vaults' }).click(); await page.getByRole('button', { name: 'Hosts', exact: true }).click(); };
const store = () => JSON.parse(fs.readFileSync(join(profile, 'hopdock/hopdock-vault.json'), 'utf8'));
const selectNativeFiles = async (paths: string[] | null) => app.evaluate(({ dialog }, paths) => { (dialog as any).nextPaths = paths; }, paths);
const confirmDelete = async () => { await page.getByRole('dialog').getByRole('button', { name: 'Delete', exact: true }).click(); };
try {
  await page.waitForLoadState();
  await step('Welcome sign-in screen, confirmation flow and local/offline access', async () => {
    await expect(page.getByRole('heading', { name: 'Sign in to Hopdock', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await page.getByLabel('Email', { exact: true }).fill('confirm@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill('test-new-account-password');
    await page.getByRole('button', { name: 'Create account', exact: true }).click();
    await expect(page.getByText('Check your email to confirm your account, then sign in here.', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Continue offline', exact: true }).click();
  });
  await step('Native preload, sandbox and isolated empty vault', async () => {
    assert.equal(await page.evaluate(() => typeof window.hopdock), 'object');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getLastWebPreferences().sandbox), true);
    await expect(page.getByTestId('hosts-empty')).toBeVisible();
    assert.equal((await page.evaluate(() => window.hopdock.vault.get())).hosts.length, 0);
  });
  await step('Create password host through UI, validation and real SSH', async () => {
    await page.getByRole('button', { name: 'New host', exact: true }).first().click();
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByText('Name is required.', { exact: true })).toBeVisible();
    await expect(page.getByText('Enter a password or select an SSH key.', { exact: true })).toBeVisible();
    await expect(page.getByLabel('Auth', { exact: true })).toHaveCount(0);
    for (const [label, value] of [['Name', 'Local password'], ['Address', '127.0.0.1'], ['Port', String(server.port)], ['Username', 'tester']]) await page.getByLabel(new RegExp('^' + label)).fill(value!);
    await page.getByLabel('Password', { exact: true }).fill('local-test-password');
    await page.getByLabel('Group', { exact: true }).selectOption('g-test');
    await page.getByLabel('Tags (comma separated)').fill('local, regression'); await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('[data-testid=terminal][data-status=live]').waitFor(); hostId = (await page.evaluate(() => window.hopdock.vault.get())).hosts[0]!.id;
    assert.ok(!fs.readFileSync(join(profile, 'hopdock/hopdock-secrets.json'), 'utf8').includes('local-test-password'));
    await expect.poll(async () => (await page.evaluate(() => window.hopdock.vault.get())).hosts[0]?.os?.id).toBe('debian');
    await expect(page.locator('.hd-session-pill [data-os="debian"]')).toHaveAttribute('title', 'Debian GNU/Linux 12 (bookworm)');
    assert.ok(!server.metrics.shellInput.includes('uname -s'));
  });
  await step('Terminal input, Unicode, resize, stdout/stderr and exit codes', async () => {
    await page.locator('.xterm-helper-textarea').pressSequentially('ping-local'); await page.locator('.xterm-helper-textarea').press('Enter');
    await expect.poll(() => server.metrics.shellInput).toContain('ping-local');
    await page.evaluate((id) => window.hopdock.ssh.write(id, btoa(unescape(encodeURIComponent('привет\n')))), hostId);
    await expect.poll(() => server.metrics.shellInput).toContain('привет');
    await page.evaluate((id) => window.hopdock.ssh.resize(id, 101, 37), hostId);
    await expect.poll(() => server.metrics.resizes.some((r: any) => r.cols === 101 && r.rows === 37)).toBe(true);
    const r = await page.evaluate((id) => window.hopdock.ssh.exec(id, 'echo exec-ok'), hostId); assert.equal(r.stdout.trim(), 'exec-ok'); assert.equal(r.code, 0);
    const bad = await page.evaluate((id) => window.hopdock.ssh.exec(id, 'test-stderr'), hostId); assert.equal(bad.stderr, 'expected-error'); assert.equal(bad.code, 7);
  });
  await step('Terminal snippets CRUD, variables, search and resize preserve the live SSH session', async () => {
    const before = server.metrics.connections;
    const panel = page.getByRole('complementary', { name: 'Terminal snippets' });
    await expect(panel).toBeVisible();
    await expect(page.getByRole('button', { name: 'Expand terminal' })).toHaveCount(0);
    const size = await page.evaluate(() => ({ width: innerWidth, height: innerHeight }));
    const terminal = await page.locator('.hd-term').boundingBox();
    assert.ok(terminal && terminal.width >= size.width - 302 && terminal.height >= size.height - 80);
    await page.getByRole('button', { name: 'Toggle navigation' }).click(); await expect(page.getByRole('button', { name: 'Hosts', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await panel.getByRole('button', { name: 'New snippet' }).click();
    await page.getByRole('dialog').getByLabel('Name', { exact: true }).fill('Session command');
    await page.getByRole('dialog').getByLabel('Folder', { exact: true }).fill('System admins');
    await page.getByRole('dialog').getByLabel(/^Script/).fill('echo panel-live');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await panel.getByRole('button', { name: 'Run Session command', exact: true }).click();
    await expect.poll(() => server.metrics.shellInput).toContain('echo panel-live\n');
    await panel.getByRole('button', { name: 'Edit Session command' }).click();
    await page.getByRole('dialog').getByLabel(/^Script/).fill('echo ${message}');
    await page.getByRole('dialog').getByRole('button', { name: 'Save', exact: true }).click();
    await panel.getByRole('button', { name: 'Run Session command', exact: true }).click();
    await page.getByRole('dialog').getByLabel('message', { exact: true }).fill('привет-panel');
    await page.getByRole('dialog').getByRole('button', { name: 'Run', exact: true }).click();
    await expect.poll(() => server.metrics.shellInput).toContain('echo привет-panel\n');
    await panel.getByLabel('Search snippets').fill('missing-command');
    await expect(panel.getByText('No matching snippets', { exact: true })).toBeVisible();
    await panel.getByLabel('Search snippets').fill('');
    await panel.getByRole('button', { name: /System admins/ }).click();
    await panel.getByRole('button', { name: 'All folders' }).click();
    await page.screenshot({ path: 'docs/design/native-terminal-snippets.png' });
    await panel.getByRole('button', { name: 'Hide snippets' }).click();
    const full = await page.locator('.hd-term').boundingBox(); assert.ok(full && full.width >= size.width - 2);
    await page.getByRole('button', { name: 'Toggle snippets' }).click();
    await expect(panel).toBeVisible();
    await expect.poll(() => server.metrics.resizes.length).toBeGreaterThan(1);
    await panel.getByRole('button', { name: 'Delete Session command' }).click();
    await confirmDelete(); await expect(panel.getByRole('button', { name: 'Run Session command', exact: true })).toHaveCount(0);
    assert.equal(server.metrics.connections, before);
  });
  await step('Search, groups, hide-grouped and theme persistence', async () => {
    await hosts(); await page.getByTestId('host-search').fill('regression'); assert.equal(await page.getByTestId('host-card').count(), 1);
    await page.getByTestId('host-search').fill('missing-host'); await expect(page.getByTestId('hosts-empty')).toBeVisible(); await page.getByRole('button', { name: 'Clear search' }).click();
    await page.getByRole('checkbox', { name: 'Hide grouped hosts', exact: true }).check(); await expect(page.getByTestId('hosts-empty')).toBeVisible();
    await page.getByRole('button', { name: 'Local test 1 hosts' }).click(); assert.equal(await page.getByTestId('host-card').count(), 1);
    await page.getByRole('button', { name: 'Back to all hosts' }).click(); await page.reload(); await expect(page.getByRole('checkbox', { name: 'Hide grouped hosts', exact: true })).toBeChecked();
    await page.getByRole('button', { name: 'Show all hosts' }).click(); await page.getByRole('button', { name: 'Light', exact: true }).click(); await page.reload(); await expect(page.getByRole('button', { name: 'Light', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });
  await step('Edit host preserves password; disconnected terminal reconnects', async () => {
    await hosts();
    await hosts(); await page.getByRole('button', { name: 'Actions for Local password' }).click(); await page.getByText('Edit', { exact: true }).click();
    await page.getByRole('button', { name: 'Show password', exact: true }).click(); await expect(page.getByLabel('Password', { exact: true })).toHaveValue('local-test-password');
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByRole('button', { name: 'Hide password', exact: true }).click(); await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'password');
    await page.getByLabel('Tags (comma separated)').fill('edited'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('[data-testid=terminal][data-status=live]').waitFor();
    await page.evaluate((id) => window.hopdock.ssh.close(id), hostId); await page.getByRole('button', { name: 'Reconnect', exact: true }).click(); await page.locator('[data-testid=terminal][data-status=live]').waitFor();
  });
  await step('Wrong password and unknown host errors', async () => {
    const wrong = await page.evaluate((port) => window.hopdock.vault.saveHost({ name: 'Wrong', host: '127.0.0.1', port, username: 'tester', auth: { type: 'password' }, tags: [], password: 'wrong' }), server.port);
    const error = await page.evaluate(async (id) => { try { await window.hopdock.ssh.connect({ hostId: id }); return ''; } catch (e) { return String(e); } }, wrong.id); assert.match(error, /authentication|auth/i);
    await page.evaluate((id) => window.hopdock.vault.deleteHost(id), wrong.id);
    const missing = await page.evaluate(async () => { try { await window.hopdock.ssh.connect({ hostId: 'missing' }); return ''; } catch (e) { return String(e); } }); assert.match(missing, /ENTRY_MISSING/);
  });
  await step('SFTP both panels, directory navigation without reconnection', async () => {
    await hosts(); await page.getByRole('button', { name: 'Actions for Local password' }).click(); await page.getByText('Open SFTP', { exact: true }).click();
    await expect(page.getByTestId('sftp-row').filter({ hasText: 'hello.txt' })).toHaveCount(2); const before = server.metrics.connections;
    await page.getByTestId('sftp-row').filter({ hasText: 'sub' }).first().dblclick(); await expect(page.getByTestId('sftp-row').filter({ hasText: 'nested.txt' })).toHaveCount(1); assert.equal(server.metrics.connections, before);
    await page.locator('.hd-pane').first().getByRole('button', { name: 'root', exact: true }).click(); await expect(page.getByTestId('sftp-row').filter({ hasText: 'hello.txt' })).toHaveCount(2);
  });
  await step('Native file picker bridge uploads/downloads exact binary content and handles cancellation', async () => {
    await selectNativeFiles(null); await page.getByRole('button', { name: 'Upload', exact: true }).first().click();
    await selectNativeFiles([join(root, 'upload.bin')]); await page.getByRole('button', { name: 'Upload', exact: true }).first().click(); await expect(page.getByTestId('sftp-row').filter({ hasText: 'upload.bin' })).toHaveCount(2);
    await selectNativeFiles([join(root, 'download.bin')]); await page.getByTestId('sftp-row').filter({ hasText: 'upload.bin' }).first().dblclick(); await expect.poll(() => fs.existsSync(join(root, 'download.bin')) && fs.statSync(join(root, 'download.bin')).size).toBe(5);
    assert.deepEqual(fs.readFileSync(join(root, 'download.bin')), fs.readFileSync(join(root, 'upload.bin')));
  });
  await step('SFTP mkdir, copy, rename, chmod, file deletion and recursive deletion', async () => {
    const id = `sftp:${hostId}`;
    await page.evaluate(async (id) => { await window.hopdock.sftp.mkdir(id, '/root/newdir'); await window.hopdock.sftp.copy(id, '/root/hello.txt', '/root/newdir/copy.txt'); await window.hopdock.sftp.rename(id, '/root/newdir/copy.txt', '/root/newdir/renamed.txt'); await window.hopdock.sftp.chmod(id, '/root/newdir/renamed.txt', 0o600); }, id);
    assert.equal(fs.readFileSync(join(remoteRoot, 'root/newdir/renamed.txt'), 'utf8'), 'hello-local-ssh'); assert.equal(server.metrics.modes.get(join(remoteRoot, 'root/newdir/renamed.txt')) & 0o777, 0o600);
    await page.evaluate(async (id) => { await window.hopdock.sftp.remove(id, '/root/upload.bin', false); await window.hopdock.sftp.remove(id, '/root/newdir', true); }, id);
    assert.equal(fs.existsSync(join(remoteRoot, 'root/newdir')), false); await page.screenshot({ path: 'docs/design/native-sftp.png' });
  });
  await step('SFTP context menu bindings: copy, rename, permissions and delete; same-file protection', async () => {
    const left = page.locator('.hd-pane').first(), right = page.locator('.hd-pane').last();
    const denied = await page.evaluate(async (id) => { try { await window.hopdock.sftp.copy(id, '/root/hello.txt', '/root/./hello.txt'); return ''; } catch (error) { return String(error); } }, `sftp:${hostId}`);
    assert.match(denied, /same file/); assert.equal(fs.readFileSync(join(remoteRoot, 'root/hello.txt'), 'utf8'), 'hello-local-ssh');
    await right.getByTestId('sftp-row').filter({ hasText: 'target' }).dblclick();
    // Wait for navigation before opening a menu whose enabled state uses both paths.
    await expect(right.locator('.hd-crumb').getByRole('button', { name: 'target', exact: true })).toBeVisible();
    await left.getByTestId('sftp-row').filter({ hasText: 'hello.txt' }).click({ button: 'right' });
    await page.getByText('Copy to target directory', { exact: true }).click();
    await expect(right.getByTestId('sftp-row').filter({ hasText: 'hello.txt' })).toHaveCount(1);
    await right.getByTestId('sftp-row').filter({ hasText: 'hello.txt' }).click({ button: 'right' });
    await page.getByText('Rename', { exact: true }).click(); await page.getByRole('textbox', { name: 'New name:', exact: true }).fill('ui-renamed.txt'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(right.getByTestId('sftp-row').filter({ hasText: 'ui-renamed.txt' })).toHaveCount(1);
    await right.getByTestId('sftp-row').filter({ hasText: 'ui-renamed.txt' }).click({ button: 'right' });
    await page.getByText('Edit Permissions', { exact: true }).click(); await page.getByRole('textbox', { name: 'Octal mode (e.g. 644):', exact: true }).fill('600'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect.poll(() => server.metrics.modes.get(join(remoteRoot, 'root/target/ui-renamed.txt')) & 0o777).toBe(0o600);
    await right.getByTestId('sftp-row').filter({ hasText: 'ui-renamed.txt' }).click({ button: 'right' });
    await page.getByText('Delete', { exact: true }).click(); await confirmDelete();
    await expect(right.getByTestId('sftp-row').filter({ hasText: 'ui-renamed.txt' })).toHaveCount(0);
    await left.getByRole('button', { name: 'New Folder', exact: true }).click(); await page.getByRole('textbox', { name: 'New folder name:', exact: true }).fill('ui-folder'); await page.getByRole('button', { name: 'Apply', exact: true }).click();
    await expect(left.getByTestId('sftp-row').filter({ hasText: 'ui-folder' })).toHaveCount(1);
    await left.getByTestId('sftp-row').filter({ hasText: 'ui-folder' }).click({ button: 'right' });
    await page.getByText('Delete', { exact: true }).click(); await confirmDelete();
    await expect(left.getByTestId('sftp-row').filter({ hasText: 'ui-folder' })).toHaveCount(0);
  });
  await step('Generate encrypted Ed25519 and RSA keys; fingerprints and Keychain UI', async () => {
    const k = await page.evaluate(() => window.hopdock.keys.generate('test-ed25519', 'ed25519', 'test-key-passphrase')); keyId = k.id; assert.match(k.fingerprint, /SHA256/);
    const rsa = await page.evaluate(() => window.hopdock.keys.generate('test-rsa', 'rsa', '')); rsaId = rsa.id; assert.equal(rsa.kind, 'RSA'); assert.ok(fs.existsSync(rsa.privateRef));
    await page.reload(); await page.getByRole('button', { name: 'Keychain', exact: true }).click(); await expect(page.getByTestId('keys-table')).toContainText('test-ed25519');
    await page.getByRole('button', { name: 'Edit key test-ed25519', exact: true }).click(); await expect(page.getByLabel('Public key', { exact: true })).toHaveValue(k.publicKey); await page.getByRole('button', { name: 'Close key details' }).click();
  });
  await step('ssh-copy-id and HostForm key selection authenticate with encrypted key', async () => {
    assert.equal(await page.evaluate(({ keyId, hostId }) => window.hopdock.keys.copyId(keyId, hostId), { keyId, hostId }), 'OK'); await page.evaluate(({ rsaId, hostId }) => window.hopdock.keys.copyId(rsaId, hostId), { rsaId, hostId });
    await hosts(); await page.getByRole('button', { name: 'New host', exact: true }).first().click();
    for (const [label, value] of [['Name', 'Local key'], ['Address', '127.0.0.1'], ['Port', String(server.port)], ['Username', 'tester']]) await page.getByLabel(new RegExp('^' + label)).fill(value!);
    await page.getByLabel('SSH key', { exact: true }).selectOption(keyId); await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('[data-testid=terminal][data-status=live]').waitFor();
  });
  await step('Combined host credentials: UI, preserved password on edits and actual SSH', async () => {
    await hosts(); await page.getByRole('button', { name: 'New host', exact: true }).first().click();
    for (const [label, value] of [['Name', 'Local combined'], ['Address', '127.0.0.1'], ['Port', String(server.port)], ['Username', 'tester']]) await page.getByLabel(new RegExp('^' + label)).fill(value!);
    await page.getByLabel('SSH key', { exact: true }).selectOption(keyId);
    await page.getByLabel('Password', { exact: true }).fill('local-test-password');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('[data-testid=terminal][data-status=live]').waitFor();
    const combined = (await page.evaluate(() => window.hopdock.vault.get())).hosts.find((host) => host.name === 'Local combined')!;
    assert.equal(combined.auth.type, 'key-password');
    await hosts(); await page.getByRole('button', { name: 'Actions for Local combined' }).click(); await page.getByText('Edit', { exact: true }).click();
    await page.getByLabel('Tags (comma separated)').fill('edited-combined'); await page.getByRole('button', { name: 'Save', exact: true }).click();
    await page.locator('[data-testid=terminal][data-status=live]').waitFor();
    await hosts(); await page.getByRole('button', { name: 'Actions for Local combined' }).click(); await page.getByText('Edit', { exact: true }).click();
    await page.getByRole('button', { name: 'Remove saved password', exact: true }).click();
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('[data-testid=terminal][data-status=live]').waitFor();
    assert.equal((await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === combined.id)!.auth.type, 'key');
    await hosts(); await page.getByRole('button', { name: 'Actions for Local combined' }).click(); await page.getByText('Edit', { exact: true }).click();
    await page.getByLabel('SSH key', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByText('Enter a password or select an SSH key.', { exact: true })).toBeVisible();
    await page.getByLabel('Password', { exact: true }).fill('local-test-password');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('[data-testid=terminal][data-status=live]').waitFor();
    assert.equal((await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === combined.id)!.auth.type, 'password');
    await page.evaluate(async (id) => { await window.hopdock.ssh.close(id); await window.hopdock.vault.deleteHost(id); }, combined.id);
  });
  await step('Missing private key shows a designed notification, recovery link, safe IPC code and dismissal', async () => {
    const fixture = await page.evaluate(async (port) => {
      const key = await window.hopdock.keys.generate('Missing key fixture', 'ed25519', '');
      const host = await window.hopdock.vault.saveHost({ name: 'Missing key host', host: '127.0.0.1', username: 'tester', port, auth: { type: 'key', keyId: key.id }, tags: [] });
      return { key, host };
    }, server.port);
    fs.unlinkSync(fixture.key.privateRef);
    const failure = await page.evaluate(async (id) => { try { await window.hopdock.winscp.open(id); return ''; } catch (error) { return String(error); } }, fixture.host.id);
    assert.match(failure, /KEY_MISSING/); assert.ok(!failure.includes('invoking remote method'));
    if (process.platform === 'win32') {
      await page.reload(); await page.getByRole('button', { name: 'Dark', exact: true }).click(); await hosts();
      await page.getByRole('button', { name: 'Actions for Missing key host', exact: true }).click(); await page.getByText('Open in WinSCP', { exact: true }).click();
      const notification = page.locator('.hd-error-notifications [role=alert]');
      await expect(notification).toContainText('Private key unavailable'); await expect(notification).toContainText('Sync your vault or import');
      await expect(notification).not.toContainText('HOPDOCK_ERROR:'); await expect(notification).not.toContainText('Error invoking');
      await page.screenshot({ path: 'docs/design/error-notification-dark.png' });
      await page.getByRole('button', { name: 'Open Keychain', exact: true }).click(); await expect(page.getByTestId('keys-table')).toBeVisible();
      await notification.getByRole('button', { name: 'Dismiss error' }).click(); await expect(notification).toHaveCount(0);
      await page.getByRole('button', { name: 'Light', exact: true }).click(); await hosts();
      await page.getByRole('button', { name: 'Actions for Missing key host', exact: true }).click(); await page.getByText('Open in WinSCP', { exact: true }).click();
      await expect(notification).toContainText('Private key unavailable'); await page.screenshot({ path: 'docs/design/error-notification-light.png' });
      await notification.getByRole('button', { name: 'Dismiss error' }).click();
    }
    await page.evaluate(async ({ key, host }) => { await window.hopdock.vault.deleteHost(host.id); await window.hopdock.keys.delete(key.id); }, fixture);
    await page.reload();
  });
  await step('Key drawer: private/public material, rename, native exports, invalid edit leaves key usable', async () => {
    await page.getByRole('button', { name: 'Keychain', exact: true }).click(); await page.getByRole('button', { name: 'Edit key test-ed25519', exact: true }).click();
    const privateField = page.getByLabel('Private key', { exact: true }); await expect(privateField).toContainText('');
    await expect.poll(() => privateField.inputValue()).toContain('PRIVATE KEY');
    const material = await privateField.inputValue(); assert.match(material, /BEGIN OPENSSH PRIVATE KEY/);
    await page.getByLabel('Label', { exact: true }).fill('renamed-ed25519'); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(page.getByText('Key saved.', { exact: true })).toBeVisible();
    await selectNativeFiles([join(root, 'exported.key')]); await page.getByRole('button', { name: 'Export private key', exact: true }).click(); await expect.poll(() => fs.existsSync(join(root, 'exported.key'))).toBe(true); assert.equal(fs.readFileSync(join(root, 'exported.key'), 'utf8'), material);
    await page.getByLabel('Export format', { exact: true }).selectOption('ppk'); await selectNativeFiles([join(root, 'exported.ppk')]); await page.getByRole('button', { name: 'Export private key', exact: true }).click(); await expect.poll(() => fs.existsSync(join(root, 'exported.ppk'))).toBe(true); assert.match(fs.readFileSync(join(root, 'exported.ppk'), 'utf8'), /Encryption: aes256-cbc/);
    await privateField.fill('not a private key'); await page.getByRole('button', { name: 'Save changes', exact: true }).click(); await expect(page.locator('.hd-key-drawer [role=alert]')).toBeVisible(); assert.equal((await page.evaluate((id) => window.hopdock.keys.read(id), keyId)).privateKey, material);
    await privateField.fill(material); await page.getByRole('button', { name: 'Copy public key', exact: true }).click();
    const publicText = await page.getByLabel('Public key', { exact: true }).inputValue(); assert.equal(await app.evaluate(({ clipboard }) => clipboard.readText()), publicText);
    await page.screenshot({ path: 'docs/design/key-details-light.png' }); await page.getByRole('button', { name: 'Close key details' }).click();
    await page.getByRole('button', { name: 'Dark', exact: true }).click(); await page.getByRole('button', { name: 'Edit key renamed-ed25519', exact: true }).click(); await expect.poll(() => privateField.inputValue()).toContain('PRIVATE KEY'); await page.screenshot({ path: 'docs/design/key-details-dark.png' }); await page.getByRole('button', { name: 'Close key details' }).click(); await page.getByRole('button', { name: 'Light', exact: true }).click();
  });
  await step('Key import, RSA authentication and real local SSH agent', async () => {
    const rsa = (await page.evaluate(() => window.hopdock.vault.get())).keys.find((k) => k.id === rsaId)!;
    const imported = await page.evaluate((path) => window.hopdock.keys.importFile('imported-rsa', undefined, path), rsa.privateRef); assert.ok(imported); importedId = imported!.id;
    const protectedKey = (await page.evaluate(() => window.hopdock.vault.get())).keys.find((k) => k.id === keyId)!;
    const protectedImport = await page.evaluate((path) => window.hopdock.keys.importFile('imported-encrypted', 'test-key-passphrase', path), protectedKey.privateRef); assert.ok(protectedImport);
    const protectedHost = await page.evaluate(({ port, id }) => window.hopdock.vault.saveHost({ name: 'Encrypted import', host: '127.0.0.1', port, username: 'tester', auth: { type: 'key', keyId: id }, tags: [] }), { port: server.port, id: protectedImport!.id });
    await page.evaluate(async (id) => { await window.hopdock.ssh.connect({ hostId: id }); await window.hopdock.ssh.close(id); await window.hopdock.vault.deleteHost(id); }, protectedHost.id);
    await page.evaluate((id) => window.hopdock.keys.delete(id), protectedImport!.id);
    for (const auth of [{ type: 'key', keyId: importedId }, { type: 'agent' }] as const) {
      const h = await page.evaluate(({ auth, port }) => window.hopdock.vault.saveHost({ name: 'Auth test ' + auth.type, host: '127.0.0.1', port, username: 'tester', auth, tags: [] }), { auth, port: server.port });
      await page.evaluate(async (id) => { await window.hopdock.ssh.connect({ hostId: id }); await window.hopdock.ssh.close(id); }, h.id); await page.evaluate((id) => window.hopdock.vault.deleteHost(id), h.id);
    }
  });
  await step('Snippet UI create/edit, variable substitution, execution and delete', async () => {
    await page.getByRole('button', { name: 'Snippets', exact: true }).click(); await page.getByRole('button', { name: 'NEW SNIPPET', exact: true }).click();
    await page.getByLabel('Name', { exact: true }).fill('Local snippet'); await page.getByLabel('Folder', { exact: true }).fill('tests'); await page.locator('textarea').fill('echo ${value}'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByTestId('snippets-table')).toContainText('Local snippet');
    await page.getByPlaceholder('$value', { exact: true }).fill('snippet-roundtrip'); await page.locator('.hd-toolbar select').last().selectOption(hostId); await page.getByRole('button', { name: 'Run', exact: true }).click(); await expect(page.locator('.hd-modal pre')).toContainText('snippet-roundtrip');
    await page.getByRole('button', { name: 'Close', exact: true }).click(); await page.getByRole('button', { name: 'Edit', exact: true }).click(); await page.locator('textarea').fill('echo changed'); await page.getByRole('button', { name: 'Save', exact: true }).click(); await expect(page.getByTestId('snippets-table')).toContainText('echo changed');
    await page.getByRole('button', { name: 'Delete', exact: true }).click(); await confirmDelete(); await expect(page.getByTestId('snippets-empty')).toBeVisible(); assert.ok(store().deletedSnippets.length);
  });
  await step('Sync settings, build configuration, encryption password persistence and missing account error', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click(); assert.equal(await page.getByLabel('Supabase URL', { exact: true }).count(), 0);
    const status = await page.evaluate(() => window.hopdock.sync.status()); assert.equal(status.backendConfigured, true); assert.match(status.projectUrl, /lwiwesknouzlzzxgtrod/);
    const short = await page.evaluate(async () => { try { await window.hopdock.sync.setEncryptionPassword('short'); return ''; } catch (e) { return String(e); } }); assert.match(short, /12 characters/);
    await page.getByLabel('Sync encryption password', { exact: true }).fill('test-only-encryption-passphrase'); await page.getByRole('button', { name: 'Save encryption password', exact: true }).click(); await expect(page.getByText('Encryption password saved on this device.', { exact: true })).toBeVisible();
    await page.reload(); assert.equal((await page.evaluate(() => window.hopdock.sync.status())).passwordsConfigured, true);
    const missing = await page.evaluate(async () => { try { await window.hopdock.sync.syncNow(); return ''; } catch (e) { return String(e); } }); assert.match(missing, /Sign in/);
  });
  await step('Keychain Generate, Import and Copy ID buttons with in-app text dialogs', async () => {
    await page.getByRole('button', { name: 'Keychain', exact: true }).click();
    await page.getByRole('button', { name: 'New key', exact: true }).click();
    await page.getByLabel('Key name', { exact: true }).fill('ui-key'); await page.getByLabel('Key passphrase', { exact: true }).fill('ui-key-passphrase');
    await page.screenshot({ path: 'docs/design/key-creation-light.png' });
    await page.getByRole('button', { name: 'Create key', exact: true }).click(); await expect(page.getByTestId('keys-table')).toContainText('ui-key');
    const uiRow = page.getByRole('row').filter({ hasText: 'ui-key' }); await uiRow.getByRole('button', { name: 'Copy ID', exact: true }).click();
    await page.getByLabel('Target host', { exact: true }).selectOption(hostId); await page.getByRole('button', { name: 'Install key', exact: true }).click();
    await expect.poll(() => server.metrics.commands.filter((c: string) => c.includes('authorized_keys')).length).toBeGreaterThan(2);
    const generated = (await page.evaluate(() => window.hopdock.vault.get())).keys.find((k) => k.name === 'ui-key')!;
    await page.getByRole('button', { name: 'Import key', exact: true }).click(); await page.getByLabel('Key name', { exact: true }).fill('ui-import'); await page.getByLabel('Key passphrase', { exact: true }).fill('ui-key-passphrase');
    await selectNativeFiles([generated.privateRef]); await page.getByRole('button', { name: 'Browse', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Import key', exact: true }).click(); await expect(page.getByTestId('keys-table')).toContainText('ui-import');
    for (const name of ['ui-key', 'ui-import']) {
      const row = page.getByRole('row').filter({ hasText: name }); await row.getByRole('button', { name: 'Delete', exact: true }).click(); await confirmDelete(); await expect(page.getByText(name, { exact: true })).toHaveCount(0);
    }
  });
  await step('Update-check control handles development builds without hanging', async () => {
    await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await page.getByRole('button', { name: 'Check for updates', exact: true }).click();
    await expect(page.getByText('Updates require a release build', { exact: true })).toBeVisible();
  });
  await step('Delete keys and host, remove local files/secrets and persist tombstones', async () => {
    for (const id of [keyId, rsaId, importedId]) if (id) await page.evaluate((id) => window.hopdock.keys.delete(id), id);
    await hosts(); await page.getByRole('button', { name: 'Actions for Local password' }).click(); await page.getByText('Delete', { exact: true }).click(); await confirmDelete(); await expect(page.getByRole('button', { name: 'Connect to Local password', exact: true })).toHaveCount(0);
    assert.equal(store().keys.length, 0); assert.ok(store().deletedHosts.some((h: any) => h.id === hostId));
    const secrets = JSON.parse(fs.readFileSync(join(profile, 'hopdock/hopdock-secrets.json'), 'utf8')); assert.equal(secrets[`pw:${hostId}`], undefined); assert.equal(secrets[`pp:${keyId}`], undefined);
  });
  await step('Designed key form in both themes, RSA selection, keyboard cancel and focus stays in modal', async () => {
    await page.getByRole('button', { name: 'Keychain', exact: true }).click(); await page.getByRole('button', { name: 'Dark', exact: true }).click(); await page.getByRole('button', { name: 'New key', exact: true }).click();
    await page.getByLabel('Key name', { exact: true }).fill('work-laptop'); await page.getByRole('button', { name: /^RSA/, exact: false }).click(); await expect(page.getByRole('button', { name: /^RSA/, exact: false })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: /^Ed25519/, exact: false }).click();
    await page.screenshot({ path: 'docs/design/key-creation-dark.png' });
    await page.getByRole('button', { name: 'Create key', exact: true }).focus(); await page.keyboard.press('Tab');
    assert.ok(await page.evaluate(() => !!document.activeElement?.closest('[role=dialog]')));
    await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: 'Light', exact: true }).click();
  });
  await step('No unhandled renderer errors or system message dialogs', async () => {
    assert.deepEqual(errors, []);
    const calls = await app.evaluate(({ dialog }) => (dialog as any).fileCalls);
    assert.ok(calls.some((call: any) => call.mode === 'open' && call.properties.includes('multiSelections')));
    assert.ok(calls.some((call: any) => call.mode === 'save' && call.properties.includes('showOverwriteConfirmation')));
  });
  await step('Real Supabase SDK and IPC: encrypted two-device sync; restored SSH password/key and snippet execution', async () => {
    const source = await page.evaluate(async (port) => {
      const host = await window.hopdock.vault.saveHost({ name: 'Sync password', host: '127.0.0.1', port, username: 'tester', auth: { type: 'password' }, password: 'local-test-password', tags: [] });
      const key = await window.hopdock.keys.generate('Sync protected key', 'ed25519', 'sync-key-passphrase');
      await window.hopdock.keys.copyId(key.id, host.id);
      const keyHost = await window.hopdock.vault.saveHost({ name: 'Sync key', host: '127.0.0.1', port, username: 'tester', auth: { type: 'key', keyId: key.id }, tags: [] });
      const snippet = await window.hopdock.snippets.save({ name: 'Sync snippet', folder: 'synced', script: 'echo synced-command' });
      await window.hopdock.sync.saveCreds({ email: 'test@example.invalid', password: 'test-account-password' });
      await window.hopdock.sync.syncNow();
      return { host, key, keyHost, snippet };
    }, server.port);
    const account = await page.evaluate(() => window.hopdock.auth.status());
    assert.equal(account.signedIn, true);
    assert.equal(account.email, 'test@example.invalid');
    const savedSession = JSON.parse(fs.readFileSync(join(profile, 'hopdock/hopdock-secrets.json'), 'utf8'));
    assert.ok(savedSession['sync:session']); assert.equal(savedSession['sync:pass'], undefined);
    const wire = JSON.stringify([...syncServer.rows.values()]);
    for (const secret of ['local-test-password', 'sync-key-passphrase', 'PRIVATE KEY', 'synced-command']) assert.ok(!wire.includes(secret), 'Plaintext found on wire: ' + secret);
    await page.evaluate((host) => window.hopdock.vault.saveHost({ name: 'Auto sync edited', host: host.host, port: host.port, username: host.username, auth: host.auth, tags: ['automatic'] }, host.id), source.host);
    await expect.poll(() => syncServer.rows.get(source.host.id)?.data.name, { timeout: 10000 }).toBe('Auto sync edited');
    const quiet = await page.evaluate(() => window.hopdock.sync.syncNow());
    assert.deepEqual(quiet, { pushed: 0, pulled: 0 });
    const otherProfile = join(root, 'other-profile'); fs.mkdirSync(join(otherProfile, 'hopdock'), { recursive: true });
    fs.writeFileSync(join(otherProfile, 'hopdock/hopdock-vault.json'), JSON.stringify({ hosts: [], groups: [], keys: [], snippets: [], lastSyncAt: new Date(0).toISOString() }));
    const other = await electron.launch({ args: [resolve('tests/desktop/launch.cjs')], env: { ...process.env, HOPDOCK_TEST_PROFILE: otherProfile, HOPDOCK_TEST_SYNC_SERVER: syncServer.url }, timeout: 30000 });
    try {
      const target = await other.firstWindow(); await target.waitForLoadState();
      await target.evaluate(async () => { await window.hopdock.sync.setEncryptionPassword('test-only-encryption-passphrase'); await window.hopdock.sync.saveCreds({ email: 'test@example.invalid', password: 'test-account-password' }); await window.hopdock.sync.syncNow(); });
      for (const id of [source.host.id, source.keyHost.id]) await target.evaluate(async (id) => { await window.hopdock.ssh.connect({ hostId: id }); const result = await window.hopdock.ssh.exec(id, 'echo restored-auth'); if (result.stdout.trim() !== 'restored-auth') throw new Error('Restored auth failed'); await window.hopdock.ssh.close(id); }, id);
      const output = await target.evaluate(({ snippet, host }) => window.hopdock.snippets.run(snippet.id, host.id, {}), source);
      assert.equal(output.stdout.trim(), 'synced-command');
      await target.evaluate(async ({ host, key, snippet, keyHost }) => { await window.hopdock.vault.deleteHost(host.id); await window.hopdock.vault.deleteHost(keyHost.id); await window.hopdock.keys.delete(key.id); await window.hopdock.snippets.remove(snippet.id); }, source);
      await expect.poll(() => !!syncServer.rows.get(source.host.id)?.deleted_at, { timeout: 10000 }).toBe(true);
      await expect.poll(async () => (await page.evaluate(() => window.hopdock.vault.get())).hosts.some((h) => h.id === source.host.id), { timeout: 25000 }).toBe(false);
      const updated = await page.evaluate(() => window.hopdock.vault.get());
      assert.ok(!updated.hosts.some((h) => h.id === source.host.id)); assert.ok(!updated.keys.some((k) => k.id === source.key.id)); assert.ok(!updated.snippets.some((s) => s.id === source.snippet.id));
    } finally { await other.close(); }
    const signInsBeforeRestart = syncServer.metrics.signIns;
    const refreshesBeforeRestart = syncServer.metrics.refreshes;
    const resumed = await electron.launch({ args: [resolve('tests/desktop/launch.cjs')], env: { ...process.env, HOPDOCK_TEST_PROFILE: otherProfile, HOPDOCK_TEST_SYNC_SERVER: syncServer.url, HOPDOCK_TEST_EXPIRE_SESSION: '1' }, timeout: 30000 });
    try {
      const resumedPage = await resumed.firstWindow(); await resumedPage.waitForLoadState();
      assert.equal((await resumedPage.evaluate(() => window.hopdock.auth.status())).signedIn, true);
      await resumedPage.evaluate(() => window.hopdock.sync.syncNow());
      assert.equal(syncServer.metrics.signIns, signInsBeforeRestart, 'A restored session must not ask for the account password again');
      assert.ok(syncServer.metrics.refreshes > refreshesBeforeRestart, 'An expired session must refresh from encrypted storage');
    } finally { await resumed.close(); }
  });
  await step('Account drawer: wrong password, sign-out preserves data, real login and persisted session', async () => {
    await page.getByRole('button', { name: /^Account/, exact: false }).first().click();
    await expect(page.getByRole('dialog', { name: 'Your account', exact: true })).toBeVisible();
    const before = await page.evaluate(() => window.hopdock.vault.get());
    await page.getByRole('button', { name: 'Sign out', exact: true }).click();
    await page.getByRole('dialog', { name: 'Sign out on this device?', exact: true }).getByRole('button', { name: 'Sign out', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    assert.equal((await page.evaluate(() => window.hopdock.auth.status())).signedIn, false);
    assert.deepEqual((await page.evaluate(() => window.hopdock.vault.get())).hosts, before.hosts);
    await page.locator('.hd-account-nav').click();
    await page.getByLabel('Email', { exact: true }).fill('test@example.invalid');
    await page.getByLabel('Password', { exact: true }).fill('wrong');
    await page.getByRole('dialog', { name: 'Sign in', exact: true }).getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByText('Sync sign-in failed', { exact: true })).toBeVisible();
    assert.equal((await page.evaluate(() => window.hopdock.auth.status())).signedIn, false);
    await page.getByLabel('Password', { exact: true }).fill('test-account-password');
    await page.getByRole('button', { name: 'Show account password', exact: true }).click();
    await expect(page.getByLabel('Password', { exact: true })).toHaveAttribute('type', 'text');
    await page.getByRole('dialog', { name: 'Sign in', exact: true }).getByRole('button', { name: 'Sign in', exact: true }).click();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    assert.equal((await page.evaluate(() => window.hopdock.auth.status())).signedIn, true);
    const otherAccount = await page.evaluate(async () => { try { await window.hopdock.auth.signIn({ email: 'another@example.invalid', password: 'test-password' }); return ''; } catch (error) { return String(error); } });
    assert.match(otherAccount, /ACCOUNT_LIBRARY/);
  });
  await step('Corrupt local vault returns a recoverable error without replacing saved data', async () => {
    const path = join(profile, 'hopdock/hopdock-vault.json'); const saved = fs.readFileSync(path, 'utf8');
    try {
      fs.writeFileSync(path, 'invalid-json-fixture');
      const result = await page.evaluate(async () => { try { await window.hopdock.vault.get(); return ''; } catch (error) { return String(error); } });
      assert.match(result, /VAULT_CORRUPT/); assert.equal(fs.readFileSync(path, 'utf8'), 'invalid-json-fixture');
    } finally { fs.writeFileSync(path, saved); }
  });
  await step('Groups: menu creation, inline creation, preselection, moving hosts and persistence', async () => {
    await hosts();
    await page.getByRole('button', { name: 'New host options' }).click(); await page.getByRole('button', { name: 'New group', exact: true }).click();
    await page.getByLabel('Group name', { exact: true }).fill('My servers'); await page.getByRole('button', { name: 'Create group', exact: true }).click();
    await page.getByRole('button', { name: 'My servers 0 hosts' }).click();
    await page.getByRole('button', { name: 'New host', exact: true }).first().click();
    const group = (await page.evaluate(() => window.hopdock.vault.get())).groups.find((g) => g.name === 'My servers')!;
    await expect(page.getByLabel('Group', { exact: true })).toHaveValue(group.id);
    await page.getByLabel('Name', { exact: true }).fill('Grouped host'); await page.getByLabel('Address', { exact: true }).fill('127.0.0.1');
    await page.getByLabel('Port', { exact: true }).fill(String(server.port)); await page.getByLabel('Username', { exact: true }).fill('tester'); await page.getByLabel('Password', { exact: true }).fill('local-test-password');
    await page.getByLabel('Group', { exact: true }).selectOption('__new__'); await page.getByLabel('New group name', { exact: true }).fill('Inline servers');
    await page.getByRole('button', { name: 'Create group', exact: true }).click();
    const inline = (await page.evaluate(() => window.hopdock.vault.get())).groups.find((g) => g.name === 'Inline servers')!;
    await expect(page.getByLabel('Group', { exact: true })).toHaveValue(inline.id);
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('[data-testid=terminal][data-status=live]').waitFor();
    const entry = (await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.name === 'Grouped host')!; assert.equal(entry.groupId, inline.id);
    await hosts(); await page.getByRole('checkbox', { name: 'Hide grouped hosts', exact: true }).uncheck();
    await page.getByRole('button', { name: 'Actions for Grouped host' }).click(); await page.getByText('Edit', { exact: true }).click();
    await expect(page.getByLabel('Group', { exact: true })).toHaveValue(inline.id); await page.getByLabel('Group', { exact: true }).selectOption('');
    await page.getByRole('button', { name: 'Save', exact: true }).click(); await page.locator('[data-testid=terminal][data-status=live]').waitFor();
    await page.reload(); assert.equal((await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === entry.id)!.groupId, null);
    const duplicate = await page.evaluate(() => window.hopdock.vault.saveGroup('  My servers  ')); assert.equal(duplicate.id, group.id);
    await hosts();
    const card = page.locator('[data-testid="host-card"][data-name="Grouped host"]');
    const transfer = await page.evaluateHandle(() => new DataTransfer());
    await card.dispatchEvent('dragstart', { dataTransfer: transfer });
    await card.dispatchEvent('dragend', { dataTransfer: transfer });
    assert.equal((await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === entry.id)!.groupId, null);
    await card.dispatchEvent('dragstart', { dataTransfer: transfer });
    const destination = page.getByRole('button', { name: 'My servers 0 hosts' });
    await destination.dispatchEvent('dragover', { dataTransfer: transfer });
    await expect(destination).toHaveClass(/hd-drop-active/);
    await destination.dispatchEvent('drop', { dataTransfer: transfer });
    await card.dispatchEvent('dragend', { dataTransfer: transfer });
    await expect.poll(async () => (await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === entry.id)!.groupId).toBe(group.id);
    await expect(page.getByRole('button', { name: 'My servers 1 hosts' })).toBeVisible();
    await expect.poll(() => syncServer.rows.get(entry.id)?.data.groupId, { timeout: 10000 }).toBe(group.id);
    const before = (await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === entry.id)!;
    const unchanged = await page.evaluate(({ id, groupId }) => window.hopdock.vault.moveHost(id, groupId), { id: entry.id, groupId: group.id });
    assert.equal(unchanged.updatedAt, before.updatedAt);
    const rejected = await page.evaluate(async (id) => { try { await window.hopdock.vault.moveHost(id, 'missing-group'); return ''; } catch (error) { return String(error); } }, entry.id);
    assert.match(rejected, /ENTRY_MISSING/);
    assert.equal((await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === entry.id)!.groupId, group.id);
    assert.equal(await page.evaluate((id) => window.hopdock.vault.readHostPassword(id), entry.id), 'local-test-password');
    await page.getByRole('button', { name: 'My servers 1 hosts' }).click();
    await card.dispatchEvent('dragstart', { dataTransfer: transfer });
    await expect(page.getByTestId('ungrouped-drop-target')).toBeVisible();
    await page.getByTestId('ungrouped-drop-target').dispatchEvent('dragover', { dataTransfer: transfer });
    await page.getByTestId('ungrouped-drop-target').dispatchEvent('drop', { dataTransfer: transfer });
    await expect.poll(async () => (await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === entry.id)!.groupId).toBe(null);
    await expect(page.getByRole('button', { name: 'Back to all hosts' })).toBeVisible();
    await page.reload();
    assert.equal((await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === entry.id)!.groupId, null);
  });
  await step('Settings direct Termius import: no file picker, credentials, keys, snippets, duplicates and safe failures', async () => {
    const material = generateKeyPairSync('rsa', { modulusLength: 2048, privateKeyEncoding: { type: 'pkcs1', format: 'pem', cipher: 'aes-256-cbc', passphrase: 'import-key-passphrase' }, publicKeyEncoding: { type: 'spki', format: 'pem' } }).privateKey;
    server.authorize(publicKeyFromPrivate(material, 'import-key-passphrase').publicKey);
    const file = join(root, 'termorator-termius.json');
    fs.writeFileSync(file, JSON.stringify({ format: 'termorator-termius-migration', version: 1,
      keys: [{ id: 'source-key', label: 'Imported RSA', private_key: material, passphrase: 'import-key-passphrase' }],
      hosts: [{ id: 'source-host', label: 'Imported combined', address: '127.0.0.1', port: server.port, username: 'tester', password: 'local-test-password', key_id: 'source-key', group_path: ['Imported', 'Servers'] }],
      snippets: [{ id: 'source-snippet', label: 'Imported command', command: 'echo imported-${word}', package_path: ['Imported', 'Commands'] }] }));
    await hosts(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
    await app.evaluate((_electron, path) => { process.env.HOPDOCK_TEST_TERMIUS_BUNDLE = path; }, file);
    const pickerCalls = await app.evaluate(({ dialog }) => (dialog as any).fileCalls.length);
    await page.getByRole('button', { name: 'Import from Termius', exact: true }).click();
    await expect(page.locator('.hd-import-result')).toContainText('1 hosts');
    const library = await page.evaluate(() => window.hopdock.vault.get());
    const imported = library.hosts.find((h) => h.name === 'Imported combined')!;
    assert.equal(imported.auth.type, 'key-password'); assert.equal(library.groups.find((g) => g.id === imported.groupId)?.name, 'Imported / Servers');
    assert.ok(!JSON.stringify(library).includes('local-test-password'));
    assert.ok(!fs.readFileSync(join(profile, 'hopdock/hopdock-secrets.json'), 'utf8').includes('import-key-passphrase'));
    await page.evaluate(async (id) => { await window.hopdock.ssh.connect({ hostId: id }); const output = await window.hopdock.ssh.exec(id, 'echo imported-auth'); if (output.stdout.trim() !== 'imported-auth') throw new Error('Imported credentials failed'); await window.hopdock.ssh.close(id); }, imported.id);
    const importedSnippet = library.snippets.find((s) => s.name === 'Imported command')!;
    const output = await page.evaluate(({ snippet, host }) => window.hopdock.snippets.run(snippet, host, { word: 'works' }), { snippet: importedSnippet.id, host: imported.id }); assert.equal(output.stdout.trim(), 'imported-works');
    await page.getByRole('button', { name: 'Import from Termius', exact: true }).click(); await expect(page.locator('.hd-import-result')).toContainText('0 hosts');
    assert.equal((await page.evaluate(() => window.hopdock.vault.get())).hosts.length, library.hosts.length);
    assert.equal(await app.evaluate(({ dialog }) => (dialog as any).fileCalls.length), pickerCalls);
    fs.writeFileSync(file, '{invalid-json'); const previous = fs.readFileSync(join(profile, 'hopdock/hopdock-vault.json'), 'utf8');
    await page.getByRole('button', { name: 'Import from Termius', exact: true }).click(); await expect(page.getByText('Termius data could not be imported', { exact: true })).toBeVisible();
    assert.equal(fs.readFileSync(join(profile, 'hopdock/hopdock-vault.json'), 'utf8'), previous);
  });
} finally {
  await app.close(); await server.close(); await syncServer.close(); fs.writeFileSync('docs/functional-test-results.json', JSON.stringify({ date: new Date().toISOString(), profile: root, results, rendererErrors: errors }, null, 2)); console.log('Test fixtures retained:', root);
}
if (results.some((r) => !r.passed)) process.exitCode = 1;
