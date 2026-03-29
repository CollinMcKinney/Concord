import argon2 from "argon2";
import * as cache from "./ephemeral/cache.ts";
import { hashSessionToken, createSession, verifySession as verifyUserSession } from "./ephemeral/sessions.ts";
import { Roles, type RoleType } from "./persistent/permissions.ts";
import { getLimitsConfig } from "./persistent/limits.ts";
import type { DbUser } from "./persistent/users.ts";

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

/**
 * Hash a password using Argon2 (with automatic salting)
 */
async function hashPassword(password: string): Promise<string> {
  if (!password) return "";
  return await argon2.hash(password);
}

/**
 * Verify a password against an Argon2 hash
 */
async function verifyPassword(password: string, hash: string): Promise<boolean> {
  if (!password || !hash) return false;
  try {
    return await argon2.verify(hash, password);
  } catch (err) {
    return false;
  }
}

/**
 * Minimal authenticated actor shape - alias for DbUser to avoid duplication
 */
type ActorData = DbUser;

/**
 * Creates a new member account directly from registration details.
 */
async function register(
  osrsName: string,
  discName: string,
  forumName: string,
  hashedPass: string
): Promise<ActorData> {
  const users = await import("./persistent/users.ts");
  return users.createUserInternal(osrsName, discName, forumName, Roles.MEMBER, hashedPass);
}

/**
 * Finds a user by any identifier (userId, osrsName, discName, or forumName).
 */
async function findUserByIdentifier(identifier: string): Promise<ActorData | null> {
  // First try as userId
  let user = await cache.get<ActorData>(`user:${identifier}`);
  if (user) return user;

  // Try as osrsName
  const osrsKey = `user:osrs:${identifier}`;
  const osrsUserId = await cache.get<string>(osrsKey);
  if (osrsUserId) {
    user = await cache.get<ActorData>(`user:${osrsUserId}`);
    if (user) return user;
  }

  // Try as discName
  const discKey = `user:discord:${identifier}`;
  const discUserId = await cache.get<string>(discKey);
  if (discUserId) {
    user = await cache.get<ActorData>(`user:${discUserId}`);
    if (user) return user;
  }

  // Try as forumName
  const forumKey = `user:forum:${identifier}`;
  const forumUserId = await cache.get<string>(forumKey);
  if (forumUserId) {
    user = await cache.get<ActorData>(`user:${forumUserId}`);
    if (user) return user;
  }

  return null;
}

/**
 * Validates credentials and returns a reusable session token on success.
 * @param identifier - User ID, OSRS name, Discord name, or forum name.
 * @param password - Password or hashed password.
 */
async function authenticate(identifier: string, password: string): Promise<string | null> {
  // Normal authentication flow (username + password)
  const user = await findUserByIdentifier(identifier);

  // Don't authenticate blocked users
  if (!user || user.role === Roles.BLOCKED) {
    console.log(`${colors.cyan}[auth]${colors.reset} Authentication failed: user blocked or not found`);
    return null;
  }

  const userId = user.id;

  // Verify password using Argon2
  const validPassword = await verifyPassword(password, user.hashedPass);
  if (!validPassword) {
    console.log(`${colors.cyan}[auth]${colors.reset} Authentication failed for user:`, { userId });
    return null;
  }

  // Create a new session
  const sessionToken = await createSession(userId);

  console.log(`${colors.cyan}[auth]${colors.reset} Authentication successful, new session created for user:`, { userId });
  return sessionToken;
}

/**
 * Verifies that a session token is valid and returns the associated user ID.
 */
async function verifySession(sessionToken: string): Promise<string | null> {
  return verifyUserSession(sessionToken);
}

/**
 * Loads the authenticated actor record for a valid session.
 * @param sessionToken - The raw session token that identifies the actor.
 */
async function getVerifiedActor(sessionToken: string): Promise<ActorData> {
  const verifiedId = await verifySession(sessionToken);
  if (!verifiedId) {
    throw new Error("Actor not authenticated");
  }

  const actor = await cache.get<ActorData>(`user:${verifiedId}`);
  if (!actor) {
    throw new Error("Actor not found");
  }

  return actor;
}

/**
 * Ensures the authenticated actor meets a minimum role requirement.
 * @param sessionToken - The raw session token used to authenticate the actor.
 * @param minimumRole - The lowest role value the actor must have to pass the check.
 */
async function requireRole(sessionToken: string, minimumRole: RoleType): Promise<ActorData> {
  const actor = await getVerifiedActor(sessionToken);
  if (actor.role < minimumRole) {
    throw new Error("Insufficient role");
  }

  return actor;
}

export {
  register,
  authenticate,
  verifySession,
  getVerifiedActor,
  requireRole,
  hashPassword,
  verifyPassword,
};
export type { ActorData };
