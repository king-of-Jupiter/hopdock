// Isolated Electron test entry point: never use the user's normal app profile.
const { app, safeStorage } = require('electron');
const { resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
if (!process.env.HOPDOCK_TEST_PROFILE) throw new Error('Test profile is required');
app.setPath('userData', resolve(process.env.HOPDOCK_TEST_PROFILE));
// Headless Linux CI has no OS keyring. Only this isolated test entry point
// enables Electron's in-memory encryption backend; production keeps OS storage.
if (process.platform === 'linux') {
  app.commandLine.appendSwitch('password-store', 'basic');
  app.whenReady().then(() => safeStorage.setUsePlainTextEncryption(true));
}
// Only this test entry point redirects the real SDK to an in-process fixture.
if (process.env.HOPDOCK_TEST_SYNC_SERVER) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (input, options) => {
    const url = typeof input === 'string' ? input : input.url ?? String(input);
    if (url.startsWith('https://lwiwesknouzlzzxgtrod.supabase.co/')) {
      return originalFetch(url.replace('https://lwiwesknouzlzzxgtrod.supabase.co', process.env.HOPDOCK_TEST_SYNC_SERVER), options);
    }
    return originalFetch(input, options);
  };
}
import(pathToFileURL(resolve('apps/desktop/out/main/index.js')).href);
