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

export async function processHtmlZip(zipDataUri: string): Promise<string> {
  const base64 = zipDataUri.replace(/^data:[^;]+;base64,/, '');
  const zipBuffer = Buffer.from(base64, 'base64');
  const zip = new AdmZip(zipBuffer);
  const entries = zip.getEntries();

  // Find the main HTML file (shortest path, not hidden, not node_modules)
  const htmlEntries = entries.filter(e =>
    !e.isDirectory &&
    e.entryName.endsWith('.html') &&
    !e.entryName.includes('node_modules/') &&
    !e.entryName.startsWith('.')
  );

  if (htmlEntries.length === 0) {
    throw new Error('No se encontró archivo HTML en el ZIP');
  }

  const htmlEntry = htmlEntries.sort(
    (a, b) => a.entryName.split('/').length - b.entryName.split('/').length
  )[0];

  let html = htmlEntry.getData().toString('utf-8');
  html = fixDoubleEncodedUtf8(html);

  // The HTML file's directory prefix inside the ZIP (for resolving relative src paths)
  const htmlDir = htmlEntry.entryName.includes('/')
    ? htmlEntry.entryName.split('/').slice(0, -1).join('/')
    : '';

  // Find all image files
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

    // Index by full ZIP path
    urlMap[entry.entryName] = url;
    // Also by relative path from the HTML file's directory
    if (htmlDir && entry.entryName.startsWith(htmlDir + '/')) {
      urlMap[entry.entryName.slice(htmlDir.length + 1)] = url;
    }
  }));

  // Rewrite src= attributes (skip external and data: URLs)
  html = html.replace(/\bsrc="([^"]+)"/g, (match, src: string) => {
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('data:')) {
      return match;
    }
    const cleanSrc = src.replace(/^\.\//, '');
    const mapped =
      urlMap[cleanSrc] ||
      urlMap[htmlDir ? `${htmlDir}/${cleanSrc}` : cleanSrc];
    return mapped ? `src="${mapped}"` : match;
  });

  return html;
}
