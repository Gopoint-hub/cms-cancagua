import { cloudinaryPut } from './cloudinaryStorage';

export function isBundledDesignHtml(html: string): boolean {
  return (
    html.includes('__bundler/manifest') ||
    html.includes('__bundler_thumbnail') ||
    html.includes('__bundler_')
  );
}

export async function convertBundledHtmlToEmail(html: string): Promise<string> {
  const puppeteer = await import('puppeteer');

  const browser = await puppeteer.default.launch({
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--single-process',
      '--no-zygote',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 600, height: 900, deviceScaleFactor: 1 });

    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 45000 });

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
