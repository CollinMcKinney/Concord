import crypto from "crypto";
import * as cache from "./cache.ts";
import { getLimitsConfig } from "../persistent/limits.ts";

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

// Session TTL loaded from config
let SESSION_TTL_HOURS = 24;
let SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;

/**
 * Updates the session TTL from the limits configuration.
 */
export async function updateSessionTTL(): Promise<void> {
  const config = await getLimitsConfig();
  SESSION_TTL_HOURS = parseInt(config.SESSION_TTL_HOURS) || 24;
  SESSION_TTL_MS = SESSION_TTL_HOURS * 60 * 60 * 1000;
}

/**
 * Gets the current session TTL in milliseconds.
 */
export function getSessionTTLMS(): number {
  return SESSION_TTL_MS;
}

/**
 * Gets the current session TTL in hours.
 */
export function getSessionTTLHours(): number {
  return SESSION_TTL_HOURS;
}

/**
 * Hashes a raw session token before storing or looking up in Redis.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Session data stored in Redis.
 */
export interface SessionData {
  userId: string;
  created: number;
  expires: number;
}

/**
 * Creates a new session for a user.
 */
export async function createSession(userId: string): Promise<string> {
  const sessionToken = crypto.randomBytes(16).toString("hex");
  const sessionTokenHash = hashSessionToken(sessionToken);
  
  const session: SessionData = {
    userId,
    created: Date.now(),
    expires: Date.now() + SESSION_TTL_MS,
  };

  await cache.set(`session:${sessionTokenHash}`, session);

  return sessionToken;
}

/**
 * Verifies a session token and returns the user ID.
 */
export async function verifySession(sessionToken: string): Promise<string | null> {
  const session = await cache.get<SessionData>(`session:${hashSessionToken(sessionToken)}`);
  if (!session) return null;

  if (session.expires < Date.now()) {
    console.warn(`${colors.yellow}[sessions]${colors.reset} Session expired`);
    return null;
  }

  return session.userId;
}

/**
 * Deletes a session.
 */
export async function deleteSession(sessionToken: string): Promise<void> {
  await cache.del(`session:${hashSessionToken(sessionToken)}`);
}

/**
 * Extends a session's expiration time.
 */
export async function extendSession(sessionToken: string): Promise<void> {
  const session = await cache.get<SessionData>(`session:${hashSessionToken(sessionToken)}`);
  if (session) {
    session.expires = Date.now() + SESSION_TTL_MS;
    await cache.set(`session:${hashSessionToken(sessionToken)}`, session);
  }
}
