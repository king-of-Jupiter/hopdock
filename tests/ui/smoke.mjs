/** UI smoke: serves the built renderer with mocks, clicks through every view.
 *  HOPDOCK_CHROME overrides the browser binary (local containers).
 *  Usage: node tests/ui/smoke.mjs */
import { spawn } from 'child_process';
import { chromium } from 'playwright';

const PORT = Number(process.env.HOPDOCK_UI_TEST_PORT ?? 8902);
const URL = `http://127.0.0.1:${PORT}/`;
const results = [];

function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + extra}`);
}

const server = spawn('node', ['tests/ui/serve.mjs', 'apps/desktop/out/renderer', String(PORT), '--fixtures'], { stdio: 'pipe' });
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('server did not start')), 15000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('ui-smoke server')) {
      clearTimeout(timer);
      resolve();
    }
  });
  server.on('error', reject);
});

const launchOpts = process.env['HOPDOCK_CHROME'] ? { executablePath: process.env['HOPDOCK_CHROME'] } : {};
const browser = await chromium.launch(launchOpts);
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

try {
  await page.goto(URL);
  await page.locator('[data-testid="host-card"]').first().waitFor({ timeout: 15000 });
  check('hosts render (12 cards)', (await page.locator('[data-testid="host-card"]').count()) === 12);

  await page.locator('[data-testid="host-search"]').fill('db-01');
  await page.waitForTimeout(300);
  check('search filters to 1', (await page.locator('[data-testid="host-card"]').count()) === 1);
  await page.locator('[data-testid="host-search"]').fill('zzz-nope');
  await page.waitForTimeout(300);
  check('empty search state', await page.locator('[data-testid="hosts-empty"]').isVisible());
  await page.goto(URL);
  await page.locator('[data-testid="host-card"]').first().waitFor({ timeout: 15000 });

  await page.locator('[data-testid="host-card"][data-name="web-02"]').click();
  await page.waitForSelector('[data-testid="terminal"][data-status="live"]', { timeout: 15000 });
  check('terminal connects (mock)', true);

  await page.locator('.hd-pill', { hasText: 'Vaults' }).click();
  await page.locator('[data-testid="host-card"][data-name="web-02"]').click({ button: 'right' });
  await page.getByText('Open SFTP', { exact: true }).click();
  await page.locator('[data-testid="sftp-table"]').first().waitFor({ timeout: 15000 });
  check('sftp tables render rows', (await page.locator('[data-testid="sftp-row"]').count()) > 4);

  await page.locator('.hd-pill', { hasText: 'Vaults' }).click();
  await page.locator('.hd-rail-item', { hasText: 'Keychain' }).click();
  check('keychain renders', await page.locator('[data-testid="keys-table"]').isVisible());
  await page.getByRole('button', { name: 'New key', exact: true }).click();
  await page.getByLabel('Key name', { exact: true }).fill('Drag selection');
  const field = await page.getByLabel('Key name', { exact: true }).boundingBox();
  await page.mouse.move(field.x + 80, field.y + field.height / 2);
  await page.mouse.down(); await page.mouse.move(40, field.y + field.height / 2, { steps: 10 }); await page.mouse.up();
  check('selection dragged outside key drawer keeps it open', await page.getByRole('dialog').isVisible());
  await page.mouse.click(40, 100);
  check('separate backdrop click still dismisses drawer', await page.getByRole('dialog').count() === 0);
  await page.getByRole('button', { name: 'Edit key id_ed25519', exact: true }).click();
  const keyField = await page.getByLabel('Public key', { exact: true }).boundingBox();
  await page.mouse.move(keyField.x + 100, keyField.y + 15);
  await page.mouse.down(); await page.mouse.move(40, keyField.y + 15, { steps: 10 }); await page.mouse.up();
  check('selection dragged outside Edit key keeps it open', await page.getByRole('dialog', { name: 'Edit key', exact: true }).isVisible());
  await page.mouse.click(40, 100);
  check('Edit key backdrop click still dismisses', await page.getByRole('dialog').count() === 0);
  await page.locator('.hd-rail-item', { hasText: 'Snippets' }).click();
  check('snippets render', await page.locator('[data-testid="snippets-table"]').isVisible());
  await page.locator('.hd-rail-item', { hasText: 'Settings' }).click();
  check('settings renders sync form', await page.getByText('Cloud sync', { exact: true }).isVisible());
  check('settings renders updater', await page.getByText('Application updates').isVisible());

  await page.getByRole('button', { name: 'Hosts', exact: true }).click();
  await page.evaluate(() => { window.hopdock.winscp.open = () => Promise.reject(new Error('private key file missing on this device')); });
  for (let attempt = 0; attempt < 2; attempt++) {
    await page.getByRole('button', { name: 'Actions for web-02', exact: true }).click(); await page.getByText('Open in WinSCP', { exact: true }).click();
    await page.getByText('Private key unavailable', { exact: true }).waitFor();
  }
  check('notification explains missing key and deduplicates repeats', await page.locator('.hd-error-notifications [role=alert]').count() === 1);
  await page.getByRole('button', { name: 'Try again', exact: true }).click(); await page.getByText('Private key unavailable', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Open Keychain', exact: true }).click();
  check('notification recovery action opens Keychain', await page.getByTestId('keys-table').isVisible());
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();

  await page.evaluate(() => { window.hopdock.updater.status = () => Promise.resolve({ state: 'up-to-date', version: '0.0.6', revision: 4 }); });
  await page.getByRole('button', { name: 'Settings', exact: true }).click(); await page.getByText(/You’re up to date/).waitFor();
  check('Settings restores an up-to-date snapshot', await page.getByText(/Latest release: 0.0.6/).isVisible());
  await page.evaluate(() => { window.hopdock.updater.status = () => Promise.resolve({ state: 'downloaded', version: '0.0.7', percent: 100, revision: 5 }); });
  await page.getByRole('button', { name: 'Hosts', exact: true }).click(); await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Restart to install', exact: true }).waitFor();
  check('ready update survives leaving Settings; duplicate check is disabled', await page.getByRole('button', { name: 'Check for updates', exact: true }).isDisabled());
  await page.evaluate(() => { void Promise.reject(new Error('Unknown failure password=DO_NOT_SHOW_THIS')); });
  await page.getByText('Operation could not be completed', { exact: true }).waitFor();
  check('background failure has a safe fallback without raw secrets', !(await page.locator('.hd-error-notifications').innerText()).includes('DO_NOT_SHOW_THIS'));
  await page.getByRole('button', { name: 'Dismiss error', exact: true }).click();

  await page.goto(URL);
  const draggedHost = page.locator('[data-name="web-01"]');
  await draggedHost.dragTo(page.getByRole('button', { name: 'Staging 2 hosts' }));
  await page.getByRole('button', { name: 'Staging 3 hosts' }).waitFor();
  check('mouse drag moves host to group without opening terminal', (await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === 'web-01').groupId === 'g-staging' && await page.getByTestId('host-search').isVisible());
  await page.getByRole('button', { name: 'Staging 3 hosts' }).click();
  const origin = await draggedHost.boundingBox();
  await page.mouse.move(origin.x + 40, origin.y + 30); await page.mouse.down();
  await page.mouse.move(origin.x + 60, origin.y + 35, { steps: 5 });
  const ungrouped = page.getByTestId('ungrouped-drop-target'); await ungrouped.waitFor();
  const destination = await ungrouped.boundingBox();
  await page.mouse.move(destination.x + 40, destination.y + 20, { steps: 10 });
  check('group drag reveals and highlights ungrouped destination', (await ungrouped.getAttribute('class')).includes('hd-drop-active'));
  await page.mouse.up();
  await ungrouped.waitFor({ state: 'hidden' });
  check('mouse drop removes group membership', (await page.evaluate(() => window.hopdock.vault.get())).hosts.find((h) => h.id === 'web-01').groupId === null);

  check('no page errors', errors.length === 0, errors.join(' | '));
} catch (e) {
  check('smoke completed', false, String(e).slice(0, 300));
} finally {
  await browser.close();
  server.kill();
}

const failed = results.filter((r) => !r.ok);
if (failed.length > 0) {
  console.error(`\n${failed.length} failure(s)`);
  process.exit(1);
}
console.log('\nall ui smoke checks passed');
