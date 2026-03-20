// user.js
const crypto = require("crypto");
const datastore = require("./datastore");
const auth = require("./auth");
const { Roles } = require("./roles");
const runtimeConfig = require("./runtime_config");

/**
 * User class
 */
class User {
  constructor({ id, osrs_name, disc_name, forum_name, role, hashedPass, created_at } = {}) {
    this.id = id;
    this.osrs_name = osrs_name || "";
    this.disc_name = disc_name || "";
    this.forum_name = forum_name || "";
    this.role = role;
    this.hashedPass = hashedPass;
    this.created_at = created_at;
  }

  /**
   * Returns a single display name for the user.
   * Preference order: OSRS → Discord → Forum → truncated ID
   */
  getDisplayName() {
    const osrs = this.osrs_name?.trim();
    const disc = this.disc_name?.trim();
    const forum = this.forum_name?.trim();

    return osrs || disc || forum || this.id.slice(0, 12);
  }

  /**
   * Hash a password/token
   */
  static hashToken(token) {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}

function printRootCredentials() {
  console.log("Paste these into the admin page:");
  console.log("ROOT_CREDENTIALS:");
  console.log(`${process.env.ROOT_USER_ID || ""}=${process.env.ROOT_SESSION_TOKEN || ""}`);
}

async function deleteUserById(userId) {
  const user = await datastore.get(`user:${userId}`);
  if (!user) {
    await datastore.sRem("users", userId);
    return false;
  }

  await datastore.del(`user:${userId}`);
  await datastore.sRem("users", userId);

  if (user.osrs_name) await datastore.del(`user:osrs:${user.osrs_name}`);
  if (user.disc_name) await datastore.del(`user:discord:${user.disc_name}`);
  if (user.forum_name) await datastore.del(`user:forum:${user.forum_name}`);

  return true;
}

async function initializeRoot() {
  const userIds = await datastore.sMembers("users");
  for (const userId of userIds) {
    const existingUser = await datastore.get(`user:${userId}`);
    if (existingUser?.role === Roles.ROOT) {
      console.log(`Deleting existing ROOT user ${userId}...`);
      await deleteUserById(userId);
    }
  }

  // Create new ROOT user
  const rootId = crypto.randomUUID(); // new unique ID
  const root = new User({
    id: rootId,
    osrs_name: "ROOT",
    disc_name: "ROOT#0000",
    forum_name: "ROOT",
    role: Roles.ROOT,
    hashedPass: User.hashToken(crypto.randomBytes(32).toString("hex")),
    created_at: new Date()
  });

  // Save new ROOT in datastore
  await datastore.set(`user:${root.id}`, root, { NX: true });
  await datastore.sAdd("users", root.id);

  // Authenticate
  const sessionToken = await auth.authenticate(root.id, root.hashedPass);
  const verifiedID = await auth.verifySession(root.id, sessionToken);

  if (!verifiedID) {
    console.error("ROOT failed to verify");
    return null;
  }

  process.env.ROOT_USER_ID = verifiedID;
  process.env.ROOT_SESSION_TOKEN = sessionToken;
  process.env.ROOT_HASHED_PASS = root.hashedPass;

  console.log("New ROOT created for this server run.");
  printRootCredentials();

  return root;
}

/**
 * --- Internal user creation ---
 */
async function createUserInternal(osrs_name, disc_name, forum_name, role = Roles.GUEST, password = null) {

  // Prevent multiple ROOT users
  if (role === Roles.ROOT) {
    const existingRootId = await datastore.get("user:role:ROOT");
    if (existingRootId) throw new Error("ROOT user already exists!");
  }

  const id = crypto.randomUUID();
  const hashedPass = User.hashToken(password);

  const user = new User({
    id,
    osrs_name,
    disc_name,
    forum_name,
    role,
    hashedPass,
    created_at: Date.now(),
  });

  const result = await datastore.set(`user:${id}`, user, { NX: true });
  if (!result) throw new Error("User already exists");

  await datastore.sAdd("users", id);

  if (osrs_name) await datastore.set(`user:osrs:${osrs_name}`, id);
  if (disc_name) await datastore.set(`user:discord:${disc_name}`, id);
  if (forum_name) await datastore.set(`user:forum:${forum_name}`, id);

  if (role !== Roles.GUEST || osrs_name || disc_name || forum_name) {
    console.log("User created:", { id, osrs_name, disc_name, forum_name, role });
  }

  return user;
}

async function createGuestSession(osrsName = "") {
  const guestSecret = crypto.randomBytes(32).toString("hex");
  const guest = await createUserInternal(osrsName, "", "", Roles.GUEST, guestSecret);
  const sessionToken = await auth.authenticate(guest.id, guest.hashedPass);

  return {
    user: guest,
    sessionToken,
  };
}

async function updateUserOsrsName(userId, osrsName) {
  const normalizedName = typeof osrsName === "string" ? osrsName.trim() : "";
  if (!userId || !normalizedName) {
    return false;
  }

  const user = await datastore.get(`user:${userId}`);
  if (!user) {
    return false;
  }

  if (user.osrs_name === normalizedName) {
    return true;
  }

  if (user.osrs_name) {
    await datastore.del(`user:osrs:${user.osrs_name}`);
  }

  user.osrs_name = normalizedName;
  await datastore.set(`user:${userId}`, user);
  await datastore.set(`user:osrs:${normalizedName}`, userId);
  console.log("Guest user named:", {
    id: userId,
    osrs_name: normalizedName,
    disc_name: user.disc_name || "",
    forum_name: user.forum_name || "",
    role: user.role,
  });
  return true;
}

/**
 * --- Public user creation ---
 */
async function createUser(actorId, actorSessionToken, osrs_name, disc_name, forum_name, password) {
  const minimumRole = await runtimeConfig.getRequiredRoleForCommand("createUser");
  if (minimumRole != null) {
    await auth.requireRole(actorId, actorSessionToken, minimumRole);
  }

  return createUserInternal(osrs_name, disc_name, forum_name, Roles.MEMBER, password);
}

/**
 * --- List all users ---
 */
async function listUsers(actorId, actorSessionToken) {
  const minimumRole = await runtimeConfig.getRequiredRoleForCommand("listUsers");
  if (minimumRole != null) {
    await auth.requireRole(actorId, actorSessionToken, minimumRole);
  }

  const ids = await datastore.sMembers("users");
  const users = [];
  let rootAlreadyIncluded = false;
  for (const id of ids) {
    const data = await datastore.get(`user:${id}`);
    if (!data) {
      continue;
    }

    if (data.role === Roles.ROOT) {
      if (rootAlreadyIncluded) {
        continue;
      }
      rootAlreadyIncluded = true;
    }

    users.push(new User(data));
  }
  return users;
}

/**
 * --- Get a single user ---
 */
async function getUser(actorId, actorSessionToken, targetId) {
  const minimumRole = await runtimeConfig.getRequiredRoleForCommand("getUser");
  if (minimumRole != null) {
    await auth.requireRole(actorId, actorSessionToken, minimumRole);
  }
  const data = await datastore.get(`user:${targetId}`);
  return data ? new User(data) : null;
}

/**
 * --- Update user role ---
 */
async function setRole(actorId, actorSessionToken, targetId, newRole) {
  const minimumRole = await runtimeConfig.getRequiredRoleForCommand("setRole");
  const actor = minimumRole == null
    ? await auth.getVerifiedActor(actorId, actorSessionToken)
    : await auth.requireRole(actorId, actorSessionToken, minimumRole);
  const target = await datastore.get(`user:${targetId}`);
  const parsedRole = parseRole(newRole);
  if (!target) return false;
  if (parsedRole == null) {
    throw new Error("Invalid role");
  }

  if (actor.role <= target.role) return false;
  if (actor.role <= parsedRole) return false;

  target.role = parsedRole;
  await datastore.set(`user:${targetId}`, target);
  return true;
}

/**
 * --- Helper: parse role ---
 */
function parseRole(role) {
  if (typeof role === "number") {
    if (Object.values(Roles).includes(role)) return role;
    return null;
  }
  if (typeof role === "string") {
    const upper = role.toUpperCase();
    if (Roles[upper] !== undefined) return Roles[upper];
  }
  return null;
}

module.exports = {
  User,
  initializeRoot,
  printRootCredentials,
  createGuestSession,
  updateUserOsrsName,
  createUser,
  listUsers,
  getUser,
  setRole
};
