// packet.js
const datastore = require('./datastore');
const auth = require('./auth');
const { v4: uuidv4 } = require('uuid');
const { Roles } = require('./roles');
const EventEmitter = require('events');

const packetEvents = new EventEmitter();

// ========================
// ConcordPacket class
// ========================
class Packet {
  /**
   * @param {string} actorId - Unique ID of the actor
   * @param {string} body - Main text content
   * @param {object} actor - Actor details { name, roles, permissions }
   * @param {string} [id] - Unique ID (auto-generated)
   * @param {number} [timestamp] - Timestamp in ms
   * @param {string} [origin] - 'discord' | 'runelite' | 'server' | 'api'
   * @param {object} [data] - Additional payload (attachments etc.)
   * @param {object} [meta] - Metadata
   */
  constructor(
    actorId,
    body,
    actor,
    id = uuidv4(),
    timestamp = Date.now(),
    origin = 'server',
    data = {},
    meta = {}
  ) {
    if (!actor || !actor.name) throw new Error('Actor with name is required');

    this.id = id;
    this.origin = origin;
    this.timestamp = timestamp;

    this.actor = {
      id: actorId,
      name: actor.name,
      roles: actor.roles || [],
      permissions: actor.permissions || [],
    };

    this.data = {
      body,
      attachments: data.attachments || [], // array of { type, url }
      ...data,
    };

    this.meta = meta || {};
    this.deleted = false;
    this.editedContent = null;
  }

  markDeleted() {
    this.deleted = true;
  }

  edit(newContent) {
    this.editedContent = newContent;
    this.data.body = newContent; // sync body
  }

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
    };
  }

  async save() {
    await datastore.client.set(`packet:${this.id}`, JSON.stringify(this.serialize()));
    await datastore.client.zAdd('packets', { score: this.timestamp, value: this.id });
  }

  static async load(id) {
    const data = await datastore.client.get(`packet:${id}`);
    if (!data) return null;
    const parsed = JSON.parse(data);
    const packet = new Packet(
      parsed.actor.id,
      parsed.data.body,
      parsed.actor,
      parsed.id,
      parsed.timestamp,
      parsed.origin,
      parsed.data,
      parsed.meta
    );
    packet.deleted = parsed.deleted;
    packet.editedContent = parsed.editedContent;
    return packet;
  }
}

// ========================
// API Functions
// ========================
async function createPacket(actorId, body, actorDetails, origin = 'server', data = {}, meta = {}) {
  return new Packet(actorId, body, actorDetails, undefined, Date.now(), origin, data, meta);
}

async function addPacket(actorId, actorSessionToken, body, actorDetails = {}, origin = 'server', data = {}, meta = {}) {
  const verified = await auth.verifySession(actorId, actorSessionToken);
  if (!verified) return false;

  const actor = await datastore.client.get(`user:${actorId}`);
  if (!actor || JSON.parse(actor).role === Roles.BLOCKED) return false;

  const packet = await createPacket(actorId, body, actorDetails, origin, data, meta);
  await packet.save();

  packetEvents.emit('packetAdded', packet);

  return true;
}

async function getPackets(actorId, actorSessionToken, limit = 50) {
  const verified = await auth.verifySession(actorId, actorSessionToken);
  if (!verified) return [];

  const ids = await datastore.client.zRange('packets', -limit, -1);
  const packets = [];
  for (const id of ids) {
    const packet = await Packet.load(id);
    if (packet) packets.push(packet.serialize());
  }
  return packets;
}

async function deletePacket(actorId, actorSessionToken, packetId) {
  const verified = await auth.verifySession(actorId, actorSessionToken);
  if (!verified) return false;

  const packet = await Packet.load(packetId);
  if (!packet) return false;

  const actor = await datastore.client.get(`user:${actorId}`);
  if (!actor || JSON.parse(actor).role < Roles.MODERATOR) return false;

  packet.markDeleted();
  await packet.save();

  packetEvents.emit('packetDeleted', packet);
  return true;
}

async function editPacket(actorId, actorSessionToken, packetId, newContent) {
  const verified = await auth.verifySession(actorId, actorSessionToken);
  if (!verified) return false;

  const packet = await Packet.load(packetId);
  if (!packet) return false;

  const actor = await datastore.client.get(`user:${actorId}`);
  if (!actor || JSON.parse(actor).role < Roles.MODERATOR) return false;

  packet.edit(newContent);
  await packet.save();

  packetEvents.emit('packetEdited', packet);
  return true;
}

module.exports = {
  Packet,
  addPacket,
  getPackets,
  editPacket,
  deletePacket,
  packetEvents,
};