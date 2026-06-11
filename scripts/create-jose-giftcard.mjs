import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { v2 as cloudinary } from 'cloudinary';
import mysql from 'mysql2/promise';

const W = 1800, H = 1200;
const GOLD = '#D3BC8D';
const CREAM = '#F1E7D9';
const WHITE = '#FFFFFF';
const outDir = '/opt/data/home/cancagua-web/generated-giftcards';
const output = path.join(outDir, 'giftcard-jose-biopiscinas.png');
const bgUrl = 'https://res.cloudinary.com/dhuln9b1n/image/upload/w_1800,h_1200,c_fill,f_jpg,q_auto/v1770309169/cancagua/images/fullday-biopiscinas-hero.webp';
const logoUrl = 'https://res.cloudinary.com/dhuln9b1n/image/upload/v1770308861/cancagua/images/01_logo-cancagua.png';

async function fetchBuf(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 CancaguaGiftcard/1.0' } });
  if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}
async function fontData(family, weight='400', style='normal') {
  const fam = family.replaceAll(' ', '+');
  const cssUrl = `https://fonts.googleapis.com/css2?family=${fam}:ital,wght@${style === 'italic' ? '1' : '0'},${weight}&display=swap`;
  const cssRes = await fetch(cssUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  const css = await cssRes.text();
  const match = css.match(/url\((https:[^)]+)\)/);
  if (!match) throw new Error('No font url for ' + family + ' ' + weight + ' ' + style + ': ' + css.slice(0,120));
  const buf = await fetchBuf(match[1]);
  return `data:font/woff2;base64,${buf.toString('base64')}`;
}
function esc(s){ return String(s).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

await fs.mkdir(outDir, { recursive: true });
const [bg, logoOrig, josefin, josefinBold, cormBold, cormItalic] = await Promise.all([
  fetchBuf(bgUrl), fetchBuf(logoUrl),
  fontData('Josefin Sans','400'), fontData('Josefin Sans','700'),
  fontData('Cormorant Garamond','700'), fontData('Cormorant Garamond','400','italic'),
]);
const logoMeta = await sharp(logoOrig).metadata();
const logoAlpha = await sharp(logoOrig).ensureAlpha().extractChannel('alpha').toBuffer();
const logoWhite = await sharp({
  create: { width: logoMeta.width, height: logoMeta.height, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } }
}).joinChannel(logoAlpha).resize({height:130}).png().toBuffer();
const logoData = `data:image/png;base64,${logoWhite.toString('base64')}`;

const recipient = 'José';
const headline = 'Estadía en Biopiscinas';
const subtitle = '4 horas para dos personas';
const valid = '30 de Agosto 2026';
const message = 'Feliz cumpleaños';

const svg = `
<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face{font-family:'Josefin Sans';src:url(${josefin}) format('woff2');font-weight:400;}
      @font-face{font-family:'Josefin Sans';src:url(${josefinBold}) format('woff2');font-weight:700;}
      @font-face{font-family:'Cormorant Garamond';src:url(${cormBold}) format('woff2');font-weight:700;}
      @font-face{font-family:'Cormorant Garamond';src:url(${cormItalic}) format('woff2');font-style:italic;font-weight:400;}
      .j{font-family:'Josefin Sans', sans-serif;letter-spacing:.14em;text-transform:uppercase;}
      .c{font-family:'Cormorant Garamond', serif;}
      .shadow{filter:drop-shadow(0 3px 7px rgba(0,0,0,.75));}
    </style>
    <radialGradient id="vig" cx="50%" cy="48%" r="70%"><stop offset="52%" stop-color="black" stop-opacity="0"/><stop offset="100%" stop-color="black" stop-opacity=".58"/></radialGradient>
  </defs>
  <image href="data:image/jpeg;base64,${bg.toString('base64')}" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
  <rect width="${W}" height="${H}" fill="rgba(0,0,0,.48)"/>
  <rect width="${W}" height="${H}" fill="url(#vig)"/>
  <rect x="60" y="60" width="1680" height="1080" fill="none" stroke="${GOLD}" stroke-width="3" opacity=".88"/>
  <rect x="78" y="78" width="1644" height="1044" fill="none" stroke="${GOLD}" stroke-width="1" opacity=".55"/>
  <image href="${logoData}" x="130" y="110" height="90" preserveAspectRatio="xMinYMin meet" opacity="0.98"/>
  <text x="130" y="190" class="j" font-size="44" fill="${WHITE}" letter-spacing=".18em">CANCAGUA</text>
  <text x="134" y="224" class="j" font-size="15" fill="${CREAM}" letter-spacing=".08em">Spa &amp; Retreat Center</text>
  <text x="130" y="286" class="j" font-size="26" fill="${WHITE}">GIFT CARD</text>
  <line x1="130" y1="318" x2="230" y2="318" stroke="${GOLD}" stroke-width="2"/>

  <text x="900" y="236" text-anchor="middle" class="c" font-size="42" font-style="italic" fill="${GOLD}">${esc(message)}</text>
  <text x="900" y="326" text-anchor="middle" class="c shadow" font-size="118" font-weight="700" fill="${WHITE}">${esc(recipient)}</text>
  <line x1="650" y1="390" x2="1150" y2="390" stroke="${GOLD}" stroke-width="2"/>

  <text x="900" y="480" text-anchor="middle" class="j" font-size="22" fill="${GOLD}">V Á L I D O   P O R</text>
  <text x="900" y="575" text-anchor="middle" class="j shadow" font-size="76" fill="${WHITE}" font-weight="700" letter-spacing=".06em">${esc(headline)}</text>
  <text x="900" y="645" text-anchor="middle" class="c" font-size="44" font-style="italic" fill="${CREAM}">${esc(subtitle)}</text>
  <line x1="700" y1="705" x2="1100" y2="705" stroke="${GOLD}" stroke-width="1"/>
  <text x="900" y="775" text-anchor="middle" class="j" font-size="18" fill="${GOLD}">V Á L I D O   H A S T A</text>
  <text x="900" y="835" text-anchor="middle" class="c" font-size="52" font-weight="700" fill="${WHITE}">${esc(valid)}</text>

  <text x="130" y="988" class="c" font-size="32" font-style="italic" fill="${CREAM}">Con cariño,</text>
  <line x1="130" y1="1038" x2="380" y2="1038" stroke="${GOLD}" stroke-width="1"/>
  <text x="130" y="1084" class="c" font-size="34" font-style="italic" fill="${WHITE}">Lu y Mario</text>

  <text x="900" y="1112" text-anchor="middle" class="j" font-size="16" fill="${CREAM}" letter-spacing=".16em">CANCAGUA · Frutillar, Chile · www.cancagua.cl</text>
</svg>`;

await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toFile(output);

cloudinary.config({ secure: true });
const upload = await cloudinary.uploader.upload(output, {
  folder: 'cancagua/giftcards',
  public_id: 'giftcard-jose-biopiscinas-2026-08-30',
  overwrite: true,
  resource_type: 'image',
});

const expiresAt = '2026-08-30 23:59:59';
const code = 'GC-JOSE-AG30';
const personalMessage = 'Feliz cumpleaños. Estadía en Biopiscinas por 4 horas para dos personas. Con cariño Lu y Mario. Válido hasta agosto 30. Imagen: ' + upload.secure_url;
const db = await mysql.createConnection(process.env.DATABASE_URL);
await db.execute(`INSERT INTO gift_cards (code, amount, balance, background_image, recipient_name, recipient_email, recipient_phone, sender_name, sender_email, personal_message, status, purchase_status, payment_method, payment_reference, delivery_method, delivered_at, expires_at, created_at, updated_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', 'completed', 'manual_gift', 'MANUAL-LUCIA', 'download', NOW(), ?, NOW(), NOW())
ON DUPLICATE KEY UPDATE background_image=VALUES(background_image), recipient_name=VALUES(recipient_name), personal_message=VALUES(personal_message), status='active', purchase_status='completed', expires_at=VALUES(expires_at), updated_at=NOW()`,
[code, 0, 0, bgUrl, 'José', null, null, 'Cancagua', null, personalMessage, expiresAt]);
const [rows] = await db.execute('SELECT id, code, recipient_name recipientName, amount, balance, purchase_status purchaseStatus, status, expires_at expiresAt, personal_message personalMessage FROM gift_cards WHERE code=?', [code]);
await db.end();
console.log(JSON.stringify({output, cloudinaryUrl: upload.secure_url, record: rows[0]}, null, 2));
