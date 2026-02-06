// Cloudinary storage helpers for file uploads/downloads/deletes
// Used by the CMS for managing images and files

import { v2 as cloudinary } from 'cloudinary';

function getCloudinaryConfig() {
  const cloudinaryUrl = process.env.CLOUDINARY_URL;
  if (cloudinaryUrl) return true;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    throw new Error("Cloudinary credentials missing: set CLOUDINARY_URL or individual vars");
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true });
  return true;
}

let initialized = false;
function ensureInitialized() {
  if (!initialized) { getCloudinaryConfig(); initialized = true; }
}

export async function cloudinaryPut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  ensureInitialized();
  const key = normalizeKey(relKey);
  const publicId = key.replace(/\.[^/.]+$/, "");

  let resourceType: "image" | "video" | "raw" | "auto" = "auto";
  if (contentType.startsWith("image/")) resourceType = "image";
  else if (contentType.startsWith("video/") || contentType.startsWith("audio/")) resourceType = "video";
  else resourceType = "raw";

  const base64Data = typeof data === "string" ? data : Buffer.from(data).toString("base64");
  const dataUri = `data:${contentType};base64,${base64Data}`;

  const result = await cloudinary.uploader.upload(dataUri, {
    public_id: publicId,
    resource_type: resourceType,
    overwrite: true,
    folder: getFolder(key),
  });

  return { key, url: result.secure_url };
}

export async function cloudinaryGet(relKey: string): Promise<{ key: string; url: string }> {
  ensureInitialized();
  const key = normalizeKey(relKey);
  const publicId = key.replace(/\.[^/.]+$/, "");
  const url = cloudinary.url(publicId, { secure: true });
  return { key, url };
}

export async function cloudinaryDelete(relKey: string): Promise<void> {
  ensureInitialized();
  const key = normalizeKey(relKey);
  const publicId = key.replace(/\.[^/.]+$/, "");
  await cloudinary.uploader.destroy(publicId);
}

export async function cloudinaryUploadFromUrl(
  imageUrl: string,
  relKey: string
): Promise<{ key: string; url: string }> {
  ensureInitialized();
  const key = normalizeKey(relKey);
  const publicId = key.replace(/\.[^/.]+$/, "");

  const result = await cloudinary.uploader.upload(imageUrl, {
    public_id: publicId,
    resource_type: "auto",
    overwrite: true,
    folder: getFolder(key),
  });

  return { key, url: result.secure_url };
}

function normalizeKey(relKey: string): string { return relKey.replace(/^\/+/, ""); }
function getFolder(key: string): string | undefined {
  const parts = key.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : undefined;
}
