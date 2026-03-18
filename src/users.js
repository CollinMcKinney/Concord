// user.js
const crypto = require("crypto");
const datastore = require("./datastore");
const auth = require("./auth");
const { Roles } = require("./roles");

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

// Auto-run once on module load
async function initializeRoot() {
  // Delete existing ROOT if present
  const existingRoot = await datastore.get("user:ROOT");
  if (existingRoot) {
    console.log("Deleting existing ROOT user...");
    await datastore.del(`user:ROOT`);
    await datastore.sRem("users", "ROOT");
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

  console.log("New ROOT created!");
  console.log("ROOT ID:", process.env.ROOT_USER_ID);
  console.log("ROOT Token:", process.env.ROOT_SESSION_TOKEN);
  console.log("ROOT Hashed Pass:", process.env.ROOT_HASHED_PASS);

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

  console.log("User created:", { id, osrs_name, disc_name, forum_name, role });

  return user;
}

/**
 * --- Public user creation ---
 */
async function createUser(actorId, actorSessionToken, osrs_name, disc_name, forum_name, password) {
  const verified = await auth.verifySession(actorId, actorSessionToken);
  if (!verified) throw new Error("Actor not authenticated");

  const actor = await datastore.get(`user:${actorId}`);
  if (!actor || actor.role < Roles.MODERATOR) throw new Error("Insufficient role");

  return createUserInternal(osrs_name, disc_name, forum_name, Roles.USER, password);
}

/**
 * --- List all users ---
 */
async function listUsers(actorId, actorSessionToken) {
  const verified = await auth.verifySession(actorId, actorSessionToken);
  if (!verified) throw new Error("Actor not authenticated");

  const actor = await datastore.get(`user:${actorId}`);
  if (!actor || actor.role < Roles.MODERATOR) throw new Error("Insufficient role");

  const ids = await datastore.sMembers("users");
  const users = [];
  for (const id of ids) {
    const data = await datastore.get(`user:${id}`);
    if (data) users.push(new User(data));
  }
  return users;
}

/**
 * --- Get a single user ---
 */
async function getUser(actorId, actorSessionToken, targetId) {
  await auth.verifySession(actorId, actorSessionToken);
  const data = await datastore.get(`user:${targetId}`);
  return data ? new User(data) : null;
}

/**
 * --- Update user role ---
 */
async function setRole(actorId, actorSessionToken, targetId, newRole) {
  const verified = await auth.verifySession(actorId, actorSessionToken);
  if (!verified) return false;

  const actor = await datastore.get(`user:${actorId}`);
  const target = await datastore.get(`user:${targetId}`);
  if (!actor || !target) return false;

  if (actor.role < Roles.MODERATOR) return false;
  if (actor.role <= target.role) return false;
  if (actor.role <= newRole) return false;

  target.role = parseRole(newRole);
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
  createUser,
  listUsers,
  getUser,
  setRole
};