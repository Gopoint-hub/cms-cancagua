import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { cloudinaryPut } from './cloudinaryStorage';

const execFileAsync = promisify(execFile);
let chromeInstallPromise: Promise<void> | null = null;

export function isBundledDesignHtml(html: string): boolean {
  return (
    html.includes('__bundler/manifest') ||
    html.includes('__bundler_thumbnail') ||
    html.includes('__bundler_')
  );
}

function getPuppeteerCliPath() {
  const binaryName = process.platform === 'win32' ? 'puppeteer.cmd' : 'puppeteer';
  return path.join(process.cwd(), 'node_modules', '.bin', binaryName);
}

function isMissingChromeError(error: unknown) {
  return error instanceof Error && /Could not find Chrome/i.test(error.message);
}

async function ensurePuppeteerChromeInstalled() {
  if (!chromeInstallPromise) {
    chromeInstallPromise = (async () => {
      const puppeteerCliPath = getPuppeteerCliPath();
      if (!existsSync(puppeteerCliPath)) {
        throw new Error(`No se encontró el CLI de Puppeteer en ${puppeteerCliPath}`);
      }

      console.log('[newsletter] Installing Puppeteer Chrome for newsletter rendering...');
      await execFileAsync(puppeteerCliPath, ['browsers', 'install', 'chrome'], {
        env: process.env,
        timeout: 240000,
        maxBuffer: 1024 * 1024 * 5,
      });
      console.log('[newsletter] Puppeteer Chrome installation finished.');
    })().catch((error) => {
      chromeInstallPromise = null;
      throw error;
    });
  }

  await chromeInstallPromise;
}

async function launchNewsletterBrowser(puppeteer: typeof import('puppeteer')) {
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;

  const launchOptions = {
    headless: true,
    executablePath,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
    ],
  };

  try {
    return await puppeteer.default.launch(launchOptions);
  } catch (error) {
    if (!isMissingChromeError(error)) throw error;
    await ensurePuppeteerChromeInstalled();
    return await puppeteer.default.launch(launchOptions);
  }
}

export async function convertBundledHtmlToEmail(html: string): Promise<string> {
  const puppeteer = await import('puppeteer');
  const browser = await launchNewsletterBrowser(puppeteer);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 900, deviceScaleFactor: 1 });

    // Puppeteer still supports networkidle0 at runtime; its current Page.setContent
    // type omits the value even though the lifecycle watcher accepts it.
    await page.setContent(html, { waitUntil: 'networkidle0' as any, timeout: 45000 });

    // Wait for the bundle to finish unpacking and rendering
    await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 2000)));

    const fullHeight = await page.evaluate(() => {
      const b = document.body;
      const d = document.documentElement;
      return Math.max(b.scrollHeight, b.offsetHeight, d.clientHeight, d.scrollHeight, d.offsetHeight);
    });

    const captureHeight = Math.min(Math.max(fullHeight, 400), 10000);
    await page.setViewport({ width: 600, height: captureHeight, deviceScaleFactor: 1 });
    await page.evaluate(() => new Promise<void>(resolve => setTimeout(resolve, 300)));

    const screenshotBuffer = await page.screenshot({ type: 'jpeg', quality: 90, fullPage: true });

    const { url } = await cloudinaryPut(
      `newsletter-renders/render-${Date.now()}.jpg`,
      Buffer.from(screenshotBuffer as Uint8Array),
      'image/jpeg'
    );

    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>Newsletter Cancagua</title>
</head>
<body style="margin:0;padding:0;background:#ffffff;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#ffffff;">
    <tr>
      <td align="center" style="padding:0;">
        <img
          src="${url}"
          alt="Newsletter Cancagua"
          width="600"
          style="display:block;max-width:600px;width:100%;border:0;outline:none;text-decoration:none;"
        />
      </td>
    </tr>
  </table>
</body>
</html>`;
  } finally {
    await browser.close();
  }
}
