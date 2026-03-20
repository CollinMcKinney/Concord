const auth = require("./auth");
const datastore = require("./datastore");
const packets = require("./packet"); // Packet.js
const users = require("./users");
const fs = require("fs");
const path = require("path");
const { Roles } = require("./roles");
const runtimeConfig = require("./runtime_config");
const { broadcastSuppressedPrefixesUpdate, broadcastDiscordInviteUrlUpdate } = require("./runelite_router");

const ENV_FILE = path.join(__dirname, "..", ".env");

async function requireRole(actorId, actorSessionToken, minimumRole) {
  if (minimumRole == null) {
    return actorId ? auth.getVerifiedActor(actorId, actorSessionToken) : null;
  }

  return auth.requireRole(actorId, actorSessionToken, minimumRole);
}

async function requireCommandRole(commandName, actorId, actorSessionToken) {
  const minimumRole = await runtimeConfig.getRequiredRoleForCommand(commandName);
  return requireRole(actorId, actorSessionToken, minimumRole);
}

async function addPacket(actorId, actorSessionToken, body, actorDetails = {}, origin = "admin", data = {}, meta = {}) {
  await requireCommandRole("addPacket", actorId, actorSessionToken);

  const actorUser = await datastore.get(`user:${actorId}`);
  const packet = new packets.Packet({
    type: "chat.message",
    origin,
    actor: {
      id: actorId,
      name: actorDetails.name || actorUser?.osrs_name || actorUser?.disc_name || actorUser?.forum_name || "Unknown",
      roles: actorDetails.roles || [],
      permissions: actorDetails.permissions || [],
    },
    auth: {
      userId: actorId,
      sessionToken: actorSessionToken,
    },
    data: {
      body,
      ...data,
    },
    meta,
  });

  console.log(`[admin_api.addPacket] ${new Date().toISOString()} packetId=${packet.id} origin=${packet.origin} body=${JSON.stringify(packet.data.body)}`);
  return packets.addPacket(packet);
}

async function getPackets(actorId, actorSessionToken, limit = 50) {
  await requireCommandRole("getPackets", actorId, actorSessionToken);
  return packets.getPackets(limit);
}

async function deletePacket(actorId, actorSessionToken, packetId) {
  await requireCommandRole("deletePacket", actorId, actorSessionToken);
  return packets.deletePacket(packetId);
}

async function editPacket(actorId, actorSessionToken, packetId, newContent) {
  await requireCommandRole("editPacket", actorId, actorSessionToken);
  return packets.editPacket(packetId, newContent);
}

async function setEnvVar(actorId, actorSessionToken, key, value) {
  await requireCommandRole("setEnvVar", actorId, actorSessionToken);

  if (!key || typeof key !== "string") {
    throw new Error("Environment variable key is required");
  }

  const normalizedKey = key.trim();
  if (!/^[A-Z0-9_]+$/i.test(normalizedKey)) {
    throw new Error("Environment variable key contains invalid characters");
  }

  const normalizedValue = value == null ? "" : String(value);
  process.env[normalizedKey] = normalizedValue;

  let envContents = "";
  if (fs.existsSync(ENV_FILE)) {
    envContents = fs.readFileSync(ENV_FILE, "utf8");
  }

  const envLine = `${normalizedKey}=${normalizedValue}`;
  const envPattern = new RegExp(`^${normalizedKey}=.*$`, "m");
  const updatedContents = envPattern.test(envContents)
    ? envContents.replace(envPattern, envLine)
    : `${envContents}${envContents && !envContents.endsWith("\n") ? "\n" : ""}${envLine}\n`;

  fs.writeFileSync(ENV_FILE, updatedContents, "utf8");

  if (normalizedKey === "DISCORD_INVITE_URL") {
    broadcastDiscordInviteUrlUpdate(normalizedValue);
  }

  return {
    key: normalizedKey,
    value: normalizedValue,
    persisted: true,
    note: "Updated process.env immediately. Some settings may still require a server restart to fully take effect.",
  };
}

async function getSuppressedPrefixes(actorId, actorSessionToken) {
  await requireCommandRole("getSuppressedPrefixes", actorId, actorSessionToken);
  return runtimeConfig.getSuppressedPrefixes();
}

async function setSuppressedPrefixes(actorId, actorSessionToken, prefixes) {
  await requireCommandRole("setSuppressedPrefixes", actorId, actorSessionToken);
  const updatedPrefixes = await runtimeConfig.setSuppressedPrefixes(prefixes);
  broadcastSuppressedPrefixesUpdate(updatedPrefixes);
  return updatedPrefixes;
}

async function getCommandRoleRequirements(actorId, actorSessionToken) {
  await requireCommandRole("getCommandRoleRequirements", actorId, actorSessionToken);
  return runtimeConfig.getCommandRoleRequirements();
}

async function setCommandRoleRequirement(actorId, actorSessionToken, commandName, role) {
  await requireCommandRole("setCommandRoleRequirement", actorId, actorSessionToken);
  return runtimeConfig.setCommandRoleRequirement(commandName, role);
}

module.exports = {
  authenticate: auth.authenticate,
  verifySession: auth.verifySession,
  saveState: (actorId, actorSessionToken) => requireCommandRole("saveState", actorId, actorSessionToken).then(() => datastore.saveState()),
  loadState: (actorId, actorSessionToken) => requireCommandRole("loadState", actorId, actorSessionToken).then(() => datastore.loadState()),
  addPacket,
  getPackets,
  deletePacket,
  editPacket,
  setEnvVar,
  getSuppressedPrefixes,
  setSuppressedPrefixes,
  getCommandRoleRequirements,
  setCommandRoleRequirement,
  createUser: users.createUser,
  listUsers: users.listUsers,
  getUser: users.getUser,
  setRole: users.setRole,
};
