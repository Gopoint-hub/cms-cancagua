/**
 * Authentication service for email/password login
 * Handles user authentication, password hashing, and session management
 */
import bcrypt from "bcryptjs";
import { nanoid } from "nanoid";
import { SignJWT, jwtVerify } from "jose";
import { parse as parseCookieHeader } from "cookie";
import type { Request, Response } from "express";
import { COOKIE_NAME, ONE_YEAR_MS } from "@shared/const";
import { ForbiddenError, UnauthorizedError } from "@shared/_core/errors";
import * as db from "../db";
import { ENV } from "./env";
import type { User, UserRole } from "../../drizzle/schema";

const SALT_ROUNDS = 12;

export type SessionPayload = {
  userId: number;
  openId: string;
  email: string;
  role: UserRole;
};

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, SALT_ROUNDS);
}

/**
 * Verify a password against a hash
 */
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a secure random token
 */
export function generateToken(): string {
  return nanoid(32);
}

/**
 * Generate a unique openId for new users
 */
export function generateOpenId(): string {
  return `local-${nanoid(16)}`;
}

/**
 * Get the JWT secret key
 */
function getSessionSecret(): Uint8Array {
  const secret = ENV.cookieSecret;
  if (!secret) {
    throw new Error("JWT_SECRET is not configured");
  }
  return new TextEncoder().encode(secret);
}

/**
 * Create a session JWT token
 */
export async function createSessionToken(
  payload: SessionPayload,
  options: { expiresInMs?: number } = {}
): Promise<string> {
  const issuedAt = Date.now();
  const expiresInMs = options.expiresInMs ?? ONE_YEAR_MS;
  const expirationSeconds = Math.floor((issuedAt + expiresInMs) / 1000);
  const secretKey = getSessionSecret();

  return new SignJWT({
    userId: payload.userId,
    openId: payload.openId,
    email: payload.email,
    role: payload.role,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime(expirationSeconds)
    .sign(secretKey);
}

/**
 * Verify and decode a session token
 */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<SessionPayload | null> {
  if (!token) {
    return null;
  }

  try {
    const secretKey = getSessionSecret();
    const { payload } = await jwtVerify(token, secretKey, {
      algorithms: ["HS256"],
    });

    const { userId, openId, email, role } = payload as Record<string, unknown>;

    if (
      typeof userId !== "number" ||
      typeof openId !== "string" ||
      typeof email !== "string" ||
      typeof role !== "string"
    ) {
      console.warn("[Auth] Session payload missing required fields");
      return null;
    }

    return {
      userId,
      openId,
      email,
      role: role as UserRole,
    };
  } catch (error) {
    console.warn("[Auth] Session verification failed", String(error));
    return null;
  }
}

/**
 * Parse cookies from request
 */
function parseCookies(cookieHeader: string | undefined): Map<string, string> {
  if (!cookieHeader) {
    return new Map<string, string>();
  }
  const parsed = parseCookieHeader(cookieHeader);
  return new Map(Object.entries(parsed));
}

/**
 * Set session cookie on response
 */
export function setSessionCookie(res: Response, token: string): void {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    maxAge: ONE_YEAR_MS,
    path: "/",
  });
}

/**
 * Clear session cookie
 */
export function clearSessionCookie(res: Response): void {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: ENV.isProduction,
    sameSite: "lax",
    path: "/",
  });
}

/**
 * Login with email and password
 */
export async function loginWithEmailPassword(
  email: string,
  password: string
): Promise<{ user: User; token: string }> {
  // Find user by email
  const user = await db.getUserByEmail(email);
  
  if (!user) {
    throw UnauthorizedError("Credenciales inválidas");
  }

  if (user.status !== "active") {
    if (user.status === "pending") {
      throw UnauthorizedError("Tu cuenta aún no ha sido activada. Revisa tu email para completar el registro.");
    }
    throw UnauthorizedError("Tu cuenta está desactivada. Contacta al administrador.");
  }

  if (!user.passwordHash) {
    throw UnauthorizedError("Esta cuenta no tiene contraseña configurada. Usa el enlace de recuperación.");
  }

  // Verify password
  const isValid = await verifyPassword(password, user.passwordHash);
  if (!isValid) {
    throw UnauthorizedError("Credenciales inválidas");
  }

  // Update last signed in
  await db.updateUserLastSignedIn(user.id);

  // Create session token
  const token = await createSessionToken({
    userId: user.id,
    openId: user.openId,
    email: user.email!,
    role: user.role as UserRole,
  });

  return { user, token };
}

/**
 * Authenticate request from session cookie
 */
export async function authenticateRequest(req: Request): Promise<User> {
  const cookies = parseCookies(req.headers.cookie);
  const sessionCookie = cookies.get(COOKIE_NAME);
  const session = await verifySessionToken(sessionCookie);

  if (!session) {
    throw ForbiddenError("Sesión inválida o expirada");
  }

  const user = await db.getUserById(session.userId);

  if (!user) {
    throw ForbiddenError("Usuario no encontrado");
  }

  if (user.status !== "active") {
    throw ForbiddenError("Tu cuenta está desactivada");
  }

  return user;
}

/**
 * Check if user has required role
 */
export function hasRole(user: User, requiredRoles: UserRole[]): boolean {
  return requiredRoles.includes(user.role as UserRole);
}

/**
 * Check if user is super admin or admin
 */
export function isAdmin(user: User): boolean {
  return hasRole(user, ["super_admin", "admin"]);
}

/**
 * Check if user is super admin
 */
export function isSuperAdmin(user: User): boolean {
  return user.role === "super_admin";
}

/**
 * Check if user can manage another user
 * Super admins can manage everyone
 * Admins can manage everyone except super admins
 */
export function canManageUser(manager: User, target: User): boolean {
  if (manager.id === target.id) {
    return true; // Users can always manage themselves (change password, etc.)
  }
  
  if (isSuperAdmin(manager)) {
    return true; // Super admins can manage everyone
  }
  
  if (isAdmin(manager) && !isSuperAdmin(target)) {
    return true; // Admins can manage non-super-admins
  }
  
  return false;
}

/**
 * Check if user has access to a specific module
 */
export function hasModuleAccess(user: User, module: string): boolean {
  // Super admins and admins have access to all modules
  if (isAdmin(user)) {
    return true;
  }

  // Check allowed modules for other roles
  if (!user.allowedModules) {
    return false;
  }

  try {
    const modules = JSON.parse(user.allowedModules) as string[];
    return modules.includes(module);
  } catch {
    return false;
  }
}

/**
 * Validate password strength
 */
export function validatePassword(password: string): { valid: boolean; message?: string } {
  if (password.length < 8) {
    return { valid: false, message: "La contraseña debe tener al menos 8 caracteres" };
  }
  
  if (!/[A-Z]/.test(password)) {
    return { valid: false, message: "La contraseña debe contener al menos una mayúscula" };
  }
  
  if (!/[a-z]/.test(password)) {
    return { valid: false, message: "La contraseña debe contener al menos una minúscula" };
  }
  
  if (!/[0-9]/.test(password)) {
    return { valid: false, message: "La contraseña debe contener al menos un número" };
  }
  
  return { valid: true };
}
