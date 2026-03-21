import crypto from "crypto";
import * as cache from "./cache";
import { Roles, type RoleType } from "./permission";

/**
 * Seassion time to live (TTL) in milliseconds. After this time, the session will expire and require re-authentication.
 */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Hashes a raw session token before it is stored or looked up in Redis.
 * @param token - The raw session token string to hash.
 * @returns The SHA-256 hash of the provided token.
 */
function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Minimal authenticated actor shape returned by authorization helpers.
 */
interface ActorData {
  id: string;
  osrs_name?: string;
  disc_name?: string;
  forum_name?: string;
  role: RoleType;
  hashedPass: string;
  created_at?: number | Date;
}

interface SessionData {
  userId: string;
  created: number;
  expires: number;
}

/**
 * Creates a new member account directly from registration details.
 * @param osrs_name - The user's in-game RuneScape name to store on the new account.
 * @param disc_name - The Discord handle to associate with the account.
 * @param forum_name - The forum username to associate with the account.
 * @param hashedPass - The pre-hashed credential value that will be stored for later authentication.
 */
async function register(
  osrs_name: string,
  disc_name: string,
  forum_name: string,
  hashedPass: string
): Promise<ActorData> {
  const users = await import("./user");
  return users.createUserInternal(osrs_name, disc_name, forum_name, Roles.MEMBER, hashedPass);
}

/**
 * Validates credentials and returns a reusable session token on success.
 * @param userId - The persisted user id whose credentials should be checked.
 * @param hashedPass - The stored password hash or an existing session token being reused as a shortcut.
 */
async function authenticate(userId: string, hashedPass: string): Promise<string | null> {
  console.log("Authenticating user:", { userId });

  const user = await cache.get<ActorData>(`user:${userId}`);

  // Don't authenticate blocked users
  if (!user || user.role === Roles.BLOCKED) {
    console.log("Authentication failed: user blocked or not found");
    return null;
  }

  // Allow authentication via session token if the session exists and is valid
  const existingSession = await cache.get<SessionData>(`session:${hashSessionToken(hashedPass)}`);
  if (existingSession && existingSession.userId === userId && existingSession.expires > Date.now()) {
    console.log("Authenticated via existing session token for user:", { userId });
    return hashedPass;
  }

  // Verify password hash
  if (user.hashedPass !== hashedPass) {
    console.log("Authentication failed for user:", { userId });
    console.log("hashedPass provided:", hashedPass);
    console.log("hashedPass expected:", user.hashedPass);
    return null;
  }

  // Create a new session token
  const sessionToken = crypto.randomBytes(32).toString("hex");
  const sessionTokenHash = hashSessionToken(sessionToken);
  const newSession: SessionData = {
    userId,
    created: Date.now(),
    expires: Date.now() + SESSION_TTL_MS
  };

  await cache.set(`session:${sessionTokenHash}`, newSession);

  console.log("Authentication successful, new session created for user:", { userId });
  return sessionToken;
}

/**
 * Verifies that a session token belongs to the specified actor and is still active.
 * @param actorId - The user id expected to own the session.
 * @param sessionToken - The raw session token presented by the caller.
 */
async function verifySession(actorId: string, sessionToken: string): Promise<string | null> {
  const session = await cache.get<SessionData>(`session:${hashSessionToken(sessionToken)}`);
  if (!session) return null;

  if (session.userId !== actorId || session.expires < Date.now()) {
    console.warn(`Failed session verification for user ${actorId}`);
    return null;
  }
  return actorId;
}

/**
 * Loads the authenticated actor record for a valid session.
 * @param actorId - The user id whose full stored actor record should be loaded.
 * @param sessionToken - The raw session token that must already belong to the same actor.
 */
async function getVerifiedActor(actorId: string, sessionToken: string): Promise<ActorData> {
  const verifiedId = await verifySession(actorId, sessionToken);
  if (!verifiedId) {
    throw new Error("Actor not authenticated");
  }

  const actor = await cache.get<ActorData>(`user:${actorId}`);
  if (!actor) {
    throw new Error("Actor not found");
  }

  return actor;
}

/**
 * Ensures the authenticated actor meets a minimum role requirement.
 * @param actorId - The user id attempting to access a protected action.
 * @param sessionToken - The raw session token used to authenticate the actor.
 * @param minimumRole - The lowest role value the actor must have to pass the check.
 */
async function requireRole(actorId: string, sessionToken: string, minimumRole: RoleType): Promise<ActorData> {
  const actor = await getVerifiedActor(actorId, sessionToken);
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
  type ActorData
};
