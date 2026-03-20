// packet.js
const datastore = require('./datastore');
const auth = require('./auth');
const { v4: uuidv4 } = require('uuid');
const EventEmitter = require('events');
require('dotenv').config();

const packetEvents = new EventEmitter();

// ========================
// Development root constants
// ========================
const ROOT_ID = process.env.ROOT_ID;
const ROOT_TOKEN = process.env.ROOT_TOKEN;
const ROOT_HASH = process.env.ROOT_HASH

// ========================
// Packet class
// ========================
class Packet {
  /**
   * @param {string} actorId
   * @param {string} body
   * @param {object} actor - { name, roles, permissions }
   * @param {string} [id]
   * @param {number} [timestamp]
   * @param {string} [origin] - 'discord' | 'runelite' | 'server' | 'api'
   * @param {object} [data]
   * @param {object} [meta]
   */
  constructor(
    actorId,
    body,
    actor = { name: "Unknown" },
    id = uuidv4(),
    timestamp = Date.now(),
    origin = 'server',
    data = {},
    meta = {}
  ) {
    actor = actor || {};
    actor.name ||= "Unknown";

    this.id = id;
    this.origin = origin;
    this.timestamp = timestamp;

    this.actor = {
      id: actorId || ROOT_ID,
      name: actor.name,
      roles: actor.roles || [],
      permissions: actor.permissions || [],
    };

    this.data = {
      body: body || "empty_message",
      attachments: data.attachments || [],
      ...data,
    };

    this.meta = meta || {};
    this.deleted = false;
    this.editedContent = null;

    // Dev-mode authentication
    this.token = ROOT_TOKEN;
    this.hash = ROOT_HASH;
  }

  /** Mark packet as deleted */
  markDeleted() {
    this.deleted = true;
  }

  /** Edit packet content */
  edit(newContent) {
    this.editedContent = newContent;
    this.data.body = newContent;
  }

  /** Serialize packet to plain object */
  serialize() {
    return {
      id: this.id,
      origin: this.origin,
      timestamp: this.timestamp,
      actor: this.actor,
      data: this.data,
      meta: this.meta,
      deleted: this.deleted,
      editedContent: this.editedContent,
      token: this.token,
      hash: this.hash,
    };
  }

  /** Save packet to datastore */
  async save() {
    await datastore.client.set(`packet:${this.id}`, JSON.stringify(this.serialize()));
    await datastore.client.zAdd('packets', { score: this.timestamp, value: this.id });
  }

  /** Load packet from datastore by ID */
  static async load(id) {
    const data = await datastore.client.get(`packet:${id}`);
    if (!data) return null;

    const parsed = JSON.parse(data);
    const actor = parsed.actor || {};
    actor.name ||= "Unknown";

    const packet = new Packet(
      parsed.actor?.id || ROOT_ID,
      parsed.data?.body || "",
      actor,
      parsed.id,
      parsed.timestamp || Date.now(),
      parsed.origin || 'server',
      parsed.data || {},
      parsed.meta || {}
    );

    packet.deleted = parsed.deleted;
    packet.editedContent = parsed.editedContent;
    packet.token = parsed.token || ROOT_TOKEN;
    packet.hash = parsed.hash || ROOT_HASH;

    return packet;
  }

  /** Create a Packet from JSON string/object safely */
  static fromJson(jsonInput) {
    const parsed = typeof jsonInput === 'string' ? JSON.parse(jsonInput) : jsonInput;
    const actor = parsed.actor || {};
    actor.name ||= "Unknown";

    return new Packet(
      parsed.actor?.id || ROOT_ID,
      parsed.data?.body || "",
      actor,
      parsed.id,
      parsed.timestamp || Date.now(),
      parsed.origin || "server",
      parsed.data || {},
      parsed.meta || {}
    );
  }
}

// ========================
// API Functions
// ========================

async function createPacket(actorId, body, actorDetails, origin = 'server', data = {}, meta = {}) {
  return new Packet(actorId, body, actorDetails, undefined, Date.now(), origin, data, meta);
}

/** Generic addPacket dispatcher */
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

/** Development-safe packet additions */
async function addPacketAdmin(packet) {
  packet.actor.id ||= ROOT_ID;
  packet.token ||= ROOT_TOKEN;
  packet.hash ||= ROOT_HASH;
  await packet.save();
  packetEvents.emit('packetAdded', packet);
  return true;
}

async function addPacketDiscord(packet) {
  packet.actor.id ||= ROOT_ID;
  packet.token ||= ROOT_TOKEN;
  packet.hash ||= ROOT_HASH;
  await packet.save();
  packetEvents.emit('packetAdded', packet);
  return true;
}

async function addPacketRunelite(packet) {
  packet.actor.id ||= ROOT_ID;
  packet.token ||= ROOT_TOKEN;
  packet.hash ||= ROOT_HASH;
  await packet.save();
  packetEvents.emit('packetAdded', packet);
  return true;
}

// ========================
// Other functions
// ========================

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

// ========================
// Exports
// ========================

module.exports = {
  Packet,
  addPacket,
  addPacketAdmin,
  addPacketDiscord,
  addPacketRunelite,
  getPackets,
  editPacket,
  deletePacket,
  packetEvents,
};