/** Rasterize the selected, vector-cleaned logo for desktop packaging. */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const svg = await readFile(new URL('../packages/ui/src/assets/hopdock-mark.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const png = await page.evaluate(async (source) => {
    const image = new Image();
    image.src = 'data:image/svg+xml;base64,' + btoa(source);
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1024;
    canvas.getContext('2d').drawImage(image, 0, 0, 1024, 1024);
    return canvas.toDataURL('image/png').split(',')[1];
  }, svg);
  const bytes = Buffer.from(png, 'base64');
  for (const relative of ['../apps/desktop/build/hopdock-icon.png', '../apps/desktop/src/renderer/public/app-icon.png']) {
    const target = new URL(relative, import.meta.url);
    await mkdir(new URL('.', target), { recursive: true });
    await writeFile(target, bytes);
    console.log(`Exported ${target.pathname}`);
  }
} finally {
  await browser.close();
}
