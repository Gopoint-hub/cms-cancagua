import AdmZip from 'adm-zip';
import { cloudinaryPut } from './cloudinaryStorage';
import path from 'path';

// Fixes double-encoded UTF-8 text (common in Claude Design static HTML exports)
// e.g. "Frutillar Â· Junio" → "Frutillar · Junio"
function fixDoubleEncodedUtf8(text: string): string {
  if (!/[ÃÂ]/.test(text)) return text;
  const bytes = Buffer.alloc(text.length);
  for (let i = 0; i < text.length; i++) {
    bytes[i] = text.charCodeAt(i) & 0xFF;
  }
  try {
    return bytes.toString('utf-8');
  } catch {
    return text;
  }
}

async function extractAssetsFromZip(
  zipDataUri: string
): Promise<{ urlMap: Record<string, string>; htmlDir: string; zipHtml: string | null }> {
  const base64 = zipDataUri.replace(/^data:[^;]+;base64,/, '');
  const zipBuffer = Buffer.from(base64, 'base64');
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // Try to find an HTML file inside the ZIP (may not exist when ZIP is assets-only)
  const htmlEntries = entries.filter(e =>
    !e.isDirectory &&
    e.entryName.endsWith('.html') &&
    !e.entryName.includes('node_modules/') &&
    !e.entryName.startsWith('.')
  );
  const htmlEntry = htmlEntries.sort(
    (a, b) => a.entryName.split('/').length - b.entryName.split('/').length
  )[0] ?? null;

  const htmlDir = htmlEntry?.entryName.includes('/')
    ? htmlEntry.entryName.split('/').slice(0, -1).join('/')
    : '';

  const zipHtml = htmlEntry ? fixDoubleEncodedUtf8(htmlEntry.getData().toString('utf-8')) : null;

  const imageEntries = entries.filter(
    e => !e.isDirectory && /\.(png|jpg|jpeg|gif|webp|svg)$/i.test(e.entryName)
  );

  const timestamp = Date.now();
  const urlMap: Record<string, string> = {};

  await Promise.all(imageEntries.map(async (entry) => {
    const data = entry.getData();
    const ext = path.extname(entry.entryName).toLowerCase();
    const contentType =
      ext === '.svg' ? 'image/svg+xml' :
      ext === '.png' ? 'image/png' :
      ext === '.gif' ? 'image/gif' :
      ext === '.webp' ? 'image/webp' : 'image/jpeg';

    const basename = path.basename(entry.entryName, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const cloudKey = `newsletter-assets/${timestamp}-${basename}${ext}`;
    const { url } = await cloudinaryPut(cloudKey, data, contentType);

    urlMap[entry.entryName] = url;
    // Also index relative path variants for flexible matching
    const parts = entry.entryName.split('/');
    for (let i = 1; i < parts.length; i++) {
      urlMap[parts.slice(i).join('/')] = url;
    }
    if (htmlDir && entry.entryName.startsWith(htmlDir + '/')) {
      urlMap[entry.entryName.slice(htmlDir.length + 1)] = url;
    }
  }));

  return { urlMap, htmlDir, zipHtml };
}

function rewriteSrcAttributes(html: string, urlMap: Record<string, string>): string {
  return html.replace(/\bsrc="([^"]+)"/g, (match, src: string) => {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return match;
    }
    const cleanSrc = src.replace(/^\.\//, '');
    const mapped = urlMap[cleanSrc] ?? urlMap[cleanSrc.replace(/^assets\//, '')];
    return mapped ? `src="${mapped}"` : match;
  });
}

// ZIP only: extract HTML + assets from the ZIP
export async function processHtmlZip(zipDataUri: string): Promise<string> {
  const { urlMap, zipHtml } = await extractAssetsFromZip(zipDataUri);
  if (!zipHtml) throw new Error('No se encontró archivo HTML en el ZIP');
  return rewriteSrcAttributes(zipHtml, urlMap);
}

// HTML file + ZIP assets combined: use the provided HTML, images from the ZIP
export async function processHtmlWithZipAssets(htmlContent: string, zipDataUri: string): Promise<string> {
  const { urlMap } = await extractAssetsFromZip(zipDataUri);
  const html = fixDoubleEncodedUtf8(htmlContent);
  return rewriteSrcAttributes(html, urlMap);
}
