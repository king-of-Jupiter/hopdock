/** UI smoke: serves the built renderer with mocks, clicks through every view.
 *  HOPDOCK_CHROME overrides the browser binary (local containers).
 *  Usage: node tests/ui/smoke.mjs */
import { spawn } from 'child_process';
import { chromium } from 'playwright';

const PORT = 8901;
const URL = `http://127.0.0.1:${PORT}/`;
const results = [];

function check(name, cond, extra = '') {
  results.push({ name, ok: !!cond, extra });
  console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + extra}`);
}

const server = spawn('node', ['tests/ui/serve.mjs', 'apps/desktop/out/renderer', String(PORT)], { stdio: 'pipe' });
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
  await page.locator('.hd-rail-item', { hasText: 'Snippets' }).click();
  check('snippets render', await page.locator('[data-testid="snippets-table"]').isVisible());
  await page.locator('.hd-rail-item', { hasText: 'Settings' }).click();
  check('settings renders sync form', await page.getByText('Encrypted vault sync').isVisible());
  check('settings renders updater', await page.getByText('Application updates').isVisible());

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
