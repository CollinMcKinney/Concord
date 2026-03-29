import crypto from "crypto";

import { hashPassword, type ActorData } from "../auth.ts";
import { createSession, verifySession, getSessionTTLMS } from "../ephemeral/sessions.ts";
import * as cache from "../ephemeral/cache.ts";
import { Roles, type RoleType } from "./permissions.ts";
import { pgTable, uuid, text, integer, timestamp } from 'drizzle-orm/pg-core';

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  gray: '\x1b[90m',
  magenta: '\x1b[35m',
};

/**
 * Users table - stores account information
 */
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  osrsName: text('osrsName').unique(),
  discName: text('discName').unique(),
  forumName: text('forumName').unique(),
  role: integer('role').notNull().default(0),
  hashedPass: text('hashed_pass').notNull().default(''),
  createdAt: timestamp('created_at').defaultNow(),
});

/**
 * User database record type (auto-generated from schema)
 */
type DbUser = typeof users.$inferSelect;
type NewUser = typeof users.$inferInsert;

/**
 * Gets a display name for a user.
 * Preference order: OSRS → Discord → Forum → truncated ID
 */
function getUserDisplayName(user: DbUser): string {
  const osrs = user.osrsName?.trim();
  const disc = user.discName?.trim();
  const forum = user.forumName?.trim();

  return osrs || disc || forum || user.id.slice(0, 12);
}

/**
 * Guest session bootstrap payload.
 */
type GuestSession = {
  user: DbUser;
  sessionToken: string;
};

/**
 * Prints the current root credentials to the console for local admin access.
 */
export function printRootCredentials(): void {
  const sessionToken = rootCredentials?.sessionToken || "";
  const loginUrl = `https://localhost/dashboard/root?sessionToken=${sessionToken}`;

  console.log("");
  console.log(`${colors.gray}${"─".repeat(60)}${colors.reset}`);
  console.log(`${colors.magenta}ROOT LOGIN${colors.reset}${colors.gray}: ${colors.cyan}${loginUrl}${colors.reset}`);
  console.log(`${colors.gray}${"─".repeat(60)}${colors.reset}`);
  console.log("");
}

/**
 * Builds the canonical Redis storage key for a user record.
 * @param userId - The stored user id to embed in the cache key.
 * @returns The Redis key used for the user's primary record.
 */
function getUserKey(userId: string): string {
  return `user:${userId}`;
}

/**
 * Loads a stored user record directly from cache.
 * @param userId - The stored user id to load.
 * @returns The raw persisted user data, or null when no record exists.
 */
async function loadStoredUser(userId: string): Promise<DbUser | null> {
  return cache.get<DbUser>(getUserKey(userId));
}

/**
 * Saves a raw user record back to cache.
 * @param userData - The user record to write.
 * @param nx - When true, only create the record if it does not already exist.
 * @returns True when Redis reports a successful write.
 */
async function saveStoredUser(userData: DbUser, nx = false): Promise<boolean> {
  const result = await cache.set(getUserKey(userData.id), userData, nx ? { NX: true } : undefined);
  return result === "OK";
}

/**
 * Writes all reverse-lookup indexes for the provided user names.
 * @param userData - The user id and names that should become lookup indexes.
 */
async function addUserIndexes(userData: Pick<DbUser, "id" | "osrsName" | "discName" | "forumName">): Promise<void> {
  if (userData.osrsName) {
    await cache.set(`user:osrs:${userData.osrsName}`, userData.id);
  }
  if (userData.discName) {
    await cache.set(`user:discord:${userData.discName}`, userData.id);
  }
  if (userData.forumName) {
    await cache.set(`user:forum:${userData.forumName}`, userData.id);
  }
}

/**
 * Removes reverse-lookup indexes for the provided user names.
 * @param userData - The user name fields whose lookup indexes should be deleted.
 */
async function removeUserIndexes(userData: Partial<DbUser>): Promise<void> {
  if (userData.osrsName) {
    await cache.del(`user:osrs:${userData.osrsName}`);
  }
  if (userData.discName) {
    await cache.del(`user:discord:${userData.discName}`);
  }
  if (userData.forumName) {
    await cache.del(`user:forum:${userData.forumName}`);
  }
}

/**
 * Saves a user record and refreshes its membership and reverse indexes.
 * @param userData - The user record to persist.
 * @param nx - When true, only create the record if it does not already exist.
 * @returns True when the primary user record write succeeded.
 */
async function saveUserRecord(userData: DbUser, nx = false): Promise<boolean> {
  const saved = await saveStoredUser(userData, nx);
  if (!saved) {
    return false;
  }

  await cache.sAdd("users", userData.id);
  await addUserIndexes(userData);
  return true;
}

/**
 * Creates a new user record object.
 */
function createUserRecord(
  osrsName: string,
  discName: string,
  forumName: string,
  role: RoleType,
  hashedPass: string,
  createdAt: Date = new Date()
): DbUser {
  return {
    id: crypto.randomUUID(),
    osrsName,
    discName,
    forumName,
    role,
    hashedPass,
    createdAt,
  } as DbUser;
}

/**
 * Removes any lingering ROOT users before a fresh server-run ROOT is created.
 */
async function removeRootUsers(): Promise<void> {
  const userIds = await cache.sMembers("users");
  for (const userId of userIds) {
    const existingUser = await loadStoredUser(userId);
    if (existingUser?.role === Roles.ROOT) {
      await deleteUserById(userId);
    }
  }
}

/**
 * Authenticates a user and guarantees a valid session token is returned.
 * @param userId - The stored user id being authenticated.
 * @param hashedPass - The already-hashed password (for internal use like ROOT init).
 * @returns A valid session token for the user.
 */
async function authenticateUserSession(userId: string, hashedPass: string): Promise<string> {
  const user = await cache.get<ActorData>(`user:${userId}`);
  if (!user) {
    throw new Error("User not found");
  }

  // The hashedPass is already hashed, compare directly
  if (user.hashedPass !== hashedPass) {
    throw new Error("Password mismatch");
  }

  // Create a new session
  return await createSession(userId);
}

/**
 * Verifies a freshly issued session token and returns the confirmed user id.
 * @param userId - The stored user id expected to own the session.
 * @param sessionToken - The raw session token to verify.
 * @returns The verified user id.
 */
async function verifyAuthenticatedUser(userId: string, sessionToken: string): Promise<string> {
  const verifiedId = await verifySession(sessionToken);
  if (!verifiedId) {
    throw new Error("Failed to verify authenticated session");
  }

  return verifiedId;
}

/**
 * ROOT credentials storage (module-private, not exposed to process.env)
 */
let rootCredentials: {
  userId: string;
  sessionToken: string;
  hashedPass: string;
} | null = null;

/**
 * Stores the current ephemeral ROOT credentials in memory.
 * @param root - The in-memory ROOT user record for this server run.
 * @param verifiedId - The verified ROOT user id.
 * @param sessionToken - The active ROOT session token.
 */
function assignRootCredentials(root: DbUser, verifiedId: string, sessionToken: string): void {
  rootCredentials = {
    userId: verifiedId,
    sessionToken,
    hashedPass: root.hashedPass
  };
}

/**
 * Gets the stored ROOT credentials.
 * @returns The ROOT credentials object, or null if not set.
 */
export function getRootCredentials(): typeof rootCredentials {
  return rootCredentials;
}

/**
 * Deletes a user record and all of its reverse indexes.
 * @param userId - The stored user id to remove.
 * @returns True when a user record existed and was removed.
 */
async function deleteUserById(userId: string): Promise<boolean> {
  const user = await loadStoredUser(userId);
  if (!user) {
    await cache.sRem("users", userId);
    return false;
  }

  await cache.del(getUserKey(userId));
  await cache.sRem("users", userId);
  await removeUserIndexes(user);

  return true;
}

/**
 * Recreates the ephemeral root account for the current server run.
 * @returns The new in-memory ROOT user, or null when initialization fails.
 */
async function initializeRoot(): Promise<DbUser | null> {
  try {
    await removeRootUsers();

    const root = createUserRecord(
      "ROOT",
      "ROOT#0000",
      "ROOT",
      Roles.ROOT,
      await hashPassword(crypto.randomBytes(32).toString("hex")),
      new Date()
    );

    const saved = await saveUserRecord(root, true);
    if (!saved) {
      throw new Error("ROOT user already exists");
    }

    const sessionToken = await authenticateUserSession(root.id, root.hashedPass);
    const verifiedId = await verifyAuthenticatedUser(root.id, sessionToken);

    assignRootCredentials(root, verifiedId, sessionToken);

    console.log(`${colors.green}[user]${colors.reset} ROOT initialized`);
    printRootCredentials();
    return root;
  } catch (error: unknown) {
    console.error(`${colors.red}[user]${colors.reset} ROOT initialization failed:`, error);
    return null;
  }
}

/**
 * Creates and stores a user record without performing caller authorization checks.
 * @param osrsName - The RuneScape name to store on the new user record.
 * @param discName - The Discord handle to store on the new user record.
 * @param forumName - The forum username to store on the new user record.
 * @param role - The role value assigned to the newly created account.
 * @param password - The raw secret to hash and store as the account credential, or null for an empty secret.
 */
async function createUserInternal(
  osrsName: string,
  discName: string,
  forumName: string,
  role: RoleType = Roles.GUEST,
  password: string | null = null
): Promise<DbUser> {
  const hashedPass = password ? await hashPassword(password) : "";

  const user = createUserRecord(
    osrsName,
    discName,
    forumName,
    role,
    hashedPass
  );

  const result = await saveUserRecord(user, true);
  if (!result) throw new Error("User already exists");

  if (role !== Roles.GUEST || osrsName || discName || forumName) {
    console.log(`${colors.green}[user]${colors.reset} User created:`, { id: user.id, osrsName, discName, forumName, role });
  }

  return user;
}

/**
 * Creates a guest user and returns a valid session token for immediate use.
 * @param osrsName - An optional initial RuneScape name to attach to the guest account before first use.
 */
async function createGuestSession(osrsName = ""): Promise<GuestSession> {
  const guestSecret = crypto.randomBytes(16).toString("hex");
  const guest = await createUserInternal(osrsName, "", "", Roles.GUEST, guestSecret);
  const sessionToken = await authenticateUserSession(guest.id, guest.hashedPass);

  return {
    user: guest,
    sessionToken,
  };
}

/**
 * Updates the stored OSRS name and reverse lookup index for a user.
 * @param userId - The stored user id whose RuneScape name should be updated.
 * @param osrsName - The new RuneScape display name to normalize and persist.
 */
async function updateUserOsrsName(userId: string, osrsName: string): Promise<boolean> {
  const normalizedName = typeof osrsName === "string" ? osrsName.trim() : "";
  if (!userId || !normalizedName) {
    return false;
  }

  const user = await loadStoredUser(userId);
  if (!user) {
    return false;
  }

  if (user.osrsName === normalizedName) {
    return true;
  }

  await removeUserIndexes({ osrsName: user.osrsName });

  user.osrsName = normalizedName;
  await saveStoredUser(user);
  await addUserIndexes({
    id: userId,
    osrsName: normalizedName,
    discName: user.discName,
    forumName: user.forumName,
  });
  console.log(`${colors.cyan}[user]${colors.reset} Guest user named:`, {
    id: userId,
    osrsName: normalizedName,
    discName: user.discName || "",
    forumName: user.forumName || "",
    role: user.role,
  });
  return true;
}

/**
 * Creates a member account on behalf of an authorized actor.
 * @param actorSessionToken - The session token used to authorize the actor.
 * @param osrsName - The RuneScape name to assign to the new member.
 * @param discName - The Discord handle to assign to the new member.
 * @param forumName - The forum username to assign to the new member.
 * @param password - The raw password or secret that will be hashed for the new member.
 */
async function createUser(
  actorSessionToken: string,
  osrsName: string,
  discName: string,
  forumName: string,
  password: string
): Promise<DbUser> {
  // Pass plain password - createUserInternal will hash it
  return createUserInternal(osrsName, discName, forumName, Roles.MEMBER, password);
}

/**
 * Returns the current list of stored users.
 */
async function listUsers(actorSessionToken: string): Promise<DbUser[]> {
  const ids = await cache.sMembers("users");
  const userList: DbUser[] = [];
  let rootAlreadyIncluded = false;
  for (const id of ids) {
    const userData = await loadStoredUser(id);
    if (!userData) {
      continue;
    }

    if (userData.role === Roles.ROOT) {
      if (rootAlreadyIncluded) {
        continue;
      }
      rootAlreadyIncluded = true;
    }

    // Sanitize user data - never include hashedPass (use resetPassword instead)
    const { hashedPass, ...safeUserData } = userData;
    userList.push(safeUserData as DbUser);
  }
  return userList;
}

/**
 * Loads a single user by id for an authorized actor.
 */
async function getUser(
  actorSessionToken: string,
  targetId: string
): Promise<DbUser | null> {
  const userData = await loadStoredUser(targetId);
  if (!userData) return null;

  // Sanitize user data - never include hashedPass (use resetPassword instead)
  const { hashedPass, ...safeUserData } = userData;
  return safeUserData as DbUser;
}

/**
 * Updates a target user's role.
 */
async function setRole(
  actorSessionToken: string,
  targetId: string,
  newRole: string | number
): Promise<boolean> {
  const target = await loadStoredUser(targetId);
  const parsedRole = parseRole(newRole);
  if (!target) return false;
  if (parsedRole == null) {
    throw new Error("Invalid role");
  }

  // Cannot change ROOT
  if (target.role === Roles.ROOT) {
    throw new Error("Cannot change ROOT user's role");
  }

  target.role = parsedRole;
  await saveStoredUser(target);
  return true;
}

/**
 * Parses a role input into a valid RoleType.
 * @param role - The requested role value supplied as a number or role-name string.
 * @returns The parsed role value, or null when the input is invalid.
 */
function parseRole(role: string | number): RoleType | null {
  if (typeof role === "number") {
    if (Object.values(Roles).includes(role as RoleType)) return role as RoleType;
    return null;
  }
  if (typeof role === "string") {
    const upper = role.toUpperCase();
    const namedRole = upper as keyof typeof Roles;
    if (namedRole in Roles) return Roles[namedRole];
  }
  return null;
}

/**
 * Deletes a user account.
 */
async function deleteUser(
  actorSessionToken: string,
  targetId: string
): Promise<boolean> {
  // Cannot delete ROOT
  const target = await loadStoredUser(targetId);
  if (!target) return false;
  if (target.role === Roles.ROOT) {
    throw new Error("Cannot delete ROOT user");
  }

  await cache.del(`user:${targetId}`);
  await cache.sRem("users", targetId);
  await removeUserIndexes(target);
  return true;
}

/**
 * Looks up a user by ID or username (osrsName, discName, or forumName).
 * @param identifier - User ID or username to look up.
 * @returns The user data or null if not found.
 */
async function findUserByIdentifier(identifier: string): Promise<DbUser | null> {
  // First try as userId
  let user = await loadStoredUser(identifier);
  if (user) return user;

  // Try as osrsName
  const osrsId = await cache.get<string>(`user:osrs:${identifier}`);
  if (osrsId) return loadStoredUser(osrsId);

  // Try as discName
  const discId = await cache.get<string>(`user:discord:${identifier}`);
  if (discId) return loadStoredUser(discId);

  // Try as forumName
  const forumId = await cache.get<string>(`user:forum:${identifier}`);
  if (forumId) return loadStoredUser(forumId);

  return null;
}

/**
 * Internal helper to update a user's password.
 * @param target - The user record to update.
 * @param newPassword - The new password to hash and store.
 * @param logMessage - The log message prefix.
 */
async function _updateUserPassword(
  target: DbUser,
  newPassword: string,
  logMessage: string
): Promise<boolean> {
  const hashedPass = await hashPassword(newPassword);
  target.hashedPass = hashedPass;
  await saveStoredUser(target);
  console.log(`${colors.green}[user]${colors.reset} ${logMessage}:`, { userId: target.id });
  return true;
}

/**
 * Changes a user's password.
 */
async function changePassword(
  actorSessionToken: string,
  targetIdentifier: string,
  newPassword: string
): Promise<boolean> {
  // Look up target user
  const target = await findUserByIdentifier(targetIdentifier);
  if (!target) {
    throw new Error("User not found");
  }

  return _updateUserPassword(target, newPassword, "Password changed");
}

/**
 * Resets a user's password.
 */
async function resetPassword(
  actorSessionToken: string,
  targetIdentifier: string,
  newPassword: string
): Promise<boolean> {
  // Look up target user
  const target = await findUserByIdentifier(targetIdentifier);
  if (!target) {
    throw new Error("User not found");
  }

  return _updateUserPassword(target, newPassword, "Password reset");
}

export {
  initializeRoot,
  createUserInternal,
  createGuestSession,
  updateUserOsrsName,
  createUser,
  listUsers,
  getUser,
  setRole,
  deleteUser,
  changePassword,
  resetPassword,
  getUserDisplayName,
  type DbUser,
  type NewUser
};
