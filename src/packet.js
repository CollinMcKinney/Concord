const datastore = require('./datastore');
const auth = require('./auth');
const runtimeConfig = require('./runtime_config');
const users = require('./users');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
require('dotenv').config();

const packetEvents = new EventEmitter();

const ROOT_ID = process.env.ROOT_ID || process.env.ROOT_USER_ID;
const RUNELITE_DEDUPE_WINDOW_MS = 1500;
const recentRuneliteFingerprints = new Map();

class Packet {
  constructor({
    version = 1,
    type = 'chat.message',
    id = uuidv4(),
    origin = 'server',
    timestamp = Date.now(),
    actor = {},
    auth: authData = {},
    data = {},
    meta = {},
    deleted = false,
    editedContent = null,
  } = {}) {
    this.version = version;
    this.type = type;
    this.id = id;
    this.origin = origin;
    this.timestamp = timestamp;
    this.actor = {
      id: actor.id || null,
      name: actor.name || 'Unknown',
      roles: actor.roles || [],
      permissions: actor.permissions || [],
    };
    this.auth = {
      userId: authData.userId || null,
      sessionToken: authData.sessionToken || null,
    };
    this.data = data || {};
    this.meta = meta || {};
    this.deleted = deleted;
    this.editedContent = editedContent;
  }

  markDeleted() {
    this.deleted = true;
  }

  edit(newContent) {
    this.editedContent = newContent;
    this.data.body = newContent;
  }

  serialize() {
    return {
      version: this.version,
      type: this.type,
      id: this.id,
      origin: this.origin,
      timestamp: this.timestamp,
      actor: this.actor,
      auth: this.auth,
      data: this.data,
      meta: this.meta,
      deleted: this.deleted,
      editedContent: this.editedContent,
    };
  }

  async save() {
    await datastore.client.set(`packet:${this.id}`, JSON.stringify(this.serialize()));
    await datastore.client.zAdd('packets', { score: this.timestamp, value: this.id });
  }

  static async load(id) {
    const data = await datastore.client.get(`packet:${id}`);
    if (!data) return null;
    return Packet.fromJson(data);
  }

  static fromJson(jsonInput) {
    const parsed = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
    return new Packet(parsed);
  }
}

async function createPacket(actorId, body, actorDetails, origin = 'server', data = {}, meta = {}) {
  return new Packet({
    type: 'chat.message',
    origin,
    actor: {
      id: actorId || null,
      name: actorDetails?.name || 'Unknown',
      roles: actorDetails?.roles || [],
      permissions: actorDetails?.permissions || [],
    },
    data: {
      body: body || '',
      ...data,
    },
    meta,
  });
}

async function addPacket(packet) {
  if (!packet || !(packet instanceof Packet)) return false;

  switch (packet.origin) {
    case 'discord': return addPacketDiscord(packet);
    case 'runelite': return addPacketRunelite(packet);
    case 'admin':
    case 'server':
    default: return addPacketAdmin(packet);
  }
}

async function addPacketAdmin(packet) {
  packet.actor.id ||= ROOT_ID || null;
  await packet.save();
  packetEvents.emit('packetAdded', packet);
  return true;
}

async function addPacketDiscord(packet) {
  packet.actor.id ||= ROOT_ID || null;
  await packet.save();
  packetEvents.emit('packetAdded', packet);
  return true;
}

async function addPacketRunelite(packet) {
  const verifiedUserId = await verifyRunelitePacketAuth(packet);
  if (!verifiedUserId) {
    return false;
  }

  await syncRuneliteProfile(packet, verifiedUserId);

  if (packet.type === "auth.profileSync") {
    return true;
  }

  if (await isSuppressedRuneliteMessage(packet)) {
    return true;
  }

  const fingerprint = buildRuneliteFingerprint(packet);
  const now = Date.now();
  const previousSeenAt = recentRuneliteFingerprints.get(fingerprint);

  if (previousSeenAt && (now - previousSeenAt) < RUNELITE_DEDUPE_WINDOW_MS) {
    return true;
  }

  recentRuneliteFingerprints.set(fingerprint, now);
  packet.actor.id = verifiedUserId;
  packet.auth.userId = verifiedUserId;
  await packet.save();
  packetEvents.emit('packetAdded', packet);
  return true;
}

async function verifyRunelitePacketAuth(packet) {
  const userId = packet.auth?.userId || packet.actor?.id;
  const sessionToken = packet.auth?.sessionToken;
  if (!userId || !sessionToken) {
    return null;
  }

  return auth.verifySession(userId, sessionToken);
}

async function syncRuneliteProfile(packet, userId) {
  const actorName = packet.actor?.name;
  const osrsName = packet.data?.osrsName || actorName;
  if (!osrsName) {
    return;
  }

  await users.updateUserOsrsName(userId, osrsName);
}

function buildRuneliteFingerprint(packet) {
  pruneRuneliteFingerprints();
  const actorName = packet.actor?.name || 'Unknown';
  const body = packet.data?.body || '';
  return JSON.stringify({ actorName, body });
}

function pruneRuneliteFingerprints() {
  const cutoff = Date.now() - RUNELITE_DEDUPE_WINDOW_MS;
  for (const [fingerprint, seenAt] of recentRuneliteFingerprints.entries()) {
    if (seenAt < cutoff) {
      recentRuneliteFingerprints.delete(fingerprint);
    }
  }
}

async function isSuppressedRuneliteMessage(packet) {
  const body = normalizeRuneliteMessage(packet.data?.body || "");
  const suppressedPrefixes = await runtimeConfig.getSuppressedPrefixes();
  return suppressedPrefixes.some(rule => doesSuppressionRuleMatch(body, rule));
}

function normalizeRuneliteMessage(message) {
  return String(message)
    .replace(/<[^>]+>/g, "")
    .trim();
}

function doesSuppressionRuleMatch(message, rule) {
  const normalizedRule = String(rule || "").trim();
  if (!normalizedRule) {
    return false;
  }

  const regex = parseSuppressionRegex(normalizedRule);
  if (regex) {
    return regex.test(message);
  }

  return message.includes(normalizeRuneliteMessage(normalizedRule));
}

function parseSuppressionRegex(rule) {
  const match = /^\/([\s\S]*)\/([dgimsuy]*)$/.exec(rule);
  if (!match) {
    return null;
  }

  try {
    return new RegExp(match[1], match[2]);
  } catch (error) {
    console.warn(`Ignoring invalid suppression regex ${JSON.stringify(rule)}: ${error.message}`);
    return null;
  }
}

async function getPackets(limit = 50) {
  const ids = await datastore.client.zRange('packets', -limit, -1);
  const packets = [];
  for (const id of ids) {
    const packet = await Packet.load(id);
    if (packet) packets.push(packet.serialize());
  }
  return packets;
}

async function deletePacket(packetId) {
  const packet = await Packet.load(packetId);
  if (!packet) return false;
  packet.markDeleted();
  await packet.save();
  packetEvents.emit('packetDeleted', packet);
  return true;
}

async function editPacket(packetId, newContent) {
  const packet = await Packet.load(packetId);
  if (!packet) return false;
  packet.edit(newContent);
  await packet.save();
  packetEvents.emit('packetEdited', packet);
  return true;
}

module.exports = {
  Packet,
  addPacket,
  addPacketAdmin,
  addPacketDiscord,
  addPacketRunelite,
  createPacket,
  getPackets,
  editPacket,
  deletePacket,
  packetEvents,
};
