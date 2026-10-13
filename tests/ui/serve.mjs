/** Zero-dependency static server for UI smoke tests. Serves the built renderer
 *  with the mock window.hopdock harness injected. Usage: node serve.mjs [root] [port] */
import { createServer } from 'http';
import { readFileSync } from 'fs';
import { join, extname } from 'path';

const root = process.argv[2] ?? 'apps/desktop/out/renderer';
const port = Number(process.argv[3] ?? 8901);
const fixtures = process.argv.includes('--fixtures');
const mock = readFileSync(new URL('./mock.js', import.meta.url));

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

const server = createServer((req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname);
    if (path === '/mock.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(mock);
      return;
    }
    if (path === '/') path = '/index.html';
    const file = join(root, path);
    let data = readFileSync(file);
    if (path.endsWith('/index.html') || path === '/index.html') {
      const html = data.toString().replace('<div id="root"></div>', '<div id="root"></div>' + (fixtures ? '<script>window.HOPDOCK_TEST_FIXTURES = true;</script>' : '') + '<script src="./mock.js"></script>');
      data = Buffer.from(html);
    }
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('nope');
  }
});

server.on('error', (err) => {
  console.error(`ui-smoke server failed: ${String(err)}`);
  process.exit(1);
});
server.listen(port, '127.0.0.1', () => console.log(`ui-smoke server on ${port}`));
