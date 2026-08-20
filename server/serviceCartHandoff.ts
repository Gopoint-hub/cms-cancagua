import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { z } from "zod";
import { customerAcquisitionSchema } from "../shared/customerAcquisition";
import { ENV } from "./_core/env";

const TOKEN_VERSION = "v1";
const DEFAULT_TTL_MS = 30 * 60_000;

export const customerCheckoutProfileSchema = z.object({
  clientName: z.string().trim().min(2).max(200),
  clientEmail: z.string().trim().email().max(320),
  clientPhone: z.string().trim().min(8).max(40),
  acquisition: customerAcquisitionSchema,
});

export type CustomerCheckoutProfile = z.infer<typeof customerCheckoutProfileSchema>;

type EncryptedCustomerCheckoutProfile = CustomerCheckoutProfile & {
  expiresAt: number;
};

function encryptionKey(secret: string): Buffer {
  if (!secret) throw new Error("JWT_SECRET no está configurado para transferir datos del checkout");
  return createHash("sha256")
    .update(`cancagua:service-cart-customer-handoff:${secret}`)
    .digest();
}

export function createCustomerCheckoutHandoff(
  profile: CustomerCheckoutProfile,
  options: { secret?: string; now?: number; ttlMs?: number } = {},
): string {
  const parsed = customerCheckoutProfileSchema.parse(profile);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(options.secret ?? ENV.cookieSecret), iv);
  const payload: EncryptedCustomerCheckoutProfile = {
    ...parsed,
    expiresAt: (options.now ?? Date.now()) + (options.ttlMs ?? DEFAULT_TTL_MS),
  };
  const encrypted = Buffer.concat([
    cipher.update(JSON.stringify(payload), "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return [TOKEN_VERSION, iv.toString("base64url"), encrypted.toString("base64url"), tag.toString("base64url")].join(".");
}

export function resolveCustomerCheckoutHandoff(
  token: string,
  options: { secret?: string; now?: number } = {},
): CustomerCheckoutProfile {
  const [version, ivValue, encryptedValue, tagValue, extra] = token.split(".");
  if (version !== TOKEN_VERSION || !ivValue || !encryptedValue || !tagValue || extra) {
    throw new Error("El enlace para recuperar tus datos no es válido");
  }
  try {
    const decipher = createDecipheriv(
      "aes-256-gcm",
      encryptionKey(options.secret ?? ENV.cookieSecret),
      Buffer.from(ivValue, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, "base64url")),
      decipher.final(),
    ]).toString("utf8");
    const payload = customerCheckoutProfileSchema.extend({ expiresAt: z.number().int().positive() }).parse(JSON.parse(decrypted));
    if (payload.expiresAt < (options.now ?? Date.now())) {
      throw new Error("El enlace para recuperar tus datos venció");
    }
    const { expiresAt: _expiresAt, ...profile } = payload;
    return profile;
  } catch (error) {
    if (error instanceof Error && error.message.includes("venció")) throw error;
    throw new Error("El enlace para recuperar tus datos no es válido");
  }
}
