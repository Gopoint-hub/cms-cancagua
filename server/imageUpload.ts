const ALLOWED_IMAGE_MIME_TYPES = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

export const MAX_CMS_IMAGE_BYTES = 5 * 1024 * 1024;

export function decodeCmsImageDataUrl(input: {
  imageData: string;
  mimeType: string;
  maxBytes?: number;
}) {
  const extension = ALLOWED_IMAGE_MIME_TYPES.get(input.mimeType);
  if (!extension) {
    throw new Error("Usa una imagen JPG, PNG o WebP");
  }
  const match = input.imageData.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=\r\n]+)$/);
  if (!match || match[1] !== input.mimeType) {
    throw new Error("El archivo de imagen no tiene un formato válido");
  }
  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.length === 0) {
    throw new Error("La imagen está vacía");
  }
  if (buffer.length > (input.maxBytes ?? MAX_CMS_IMAGE_BYTES)) {
    throw new Error("La imagen supera el máximo de 5 MB");
  }
  return { buffer, extension };
}
