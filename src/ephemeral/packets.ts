import { EventEmitter } from "node:events";

import "dotenv/config";
import { v4 as uuidv4 } from "uuid";

import * as cache from "./cache.ts";
import { getRootCredentials } from "../persistent/users.ts";

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
};

/**
 * Primitive JSON values allowed inside packet payloads and metadata.
 */
export type PacketPrimitive = string | number | boolean | null;
export type PacketValue = PacketPrimitive | PacketObject | PacketValue[];
export interface PacketObject {
  [key: string]: PacketValue | undefined;
}

/**
 * Event emitter for packet lifecycle updates.
 */
export const packetEvents = new EventEmitter();

/**
 * Identity details describing the actor that originated a packet.
 */
export interface ActorInfo {
  id: string | null;
  name: string;
  roles: number[];
  permissions: string[];
}

/**
 * Authentication context attached to a packet.
 */
export interface AuthData {
  userId: string | null;
  sessionToken: string | null;
}

/**
 * Packet payload type.
 */
export interface PacketData extends PacketObject {
  body?: string;
}

/**
 * Serialized packet for storage/broadcast.
 */
export interface SerializedPacket {
  version: number;
  type: string;
  id: string;
  origin: string;
  timestamp: number;
  actor: ActorInfo;
  auth: AuthData;
  data: PacketData;
  meta: PacketObject;
  deleted: boolean;
  editedContent: string | null;
}

interface PacketInit {
  version?: number;
  type?: string;
  id?: string;
  origin?: string;
  timestamp?: number;
  actor?: Partial<ActorInfo> | null;
  auth?: Partial<AuthData> | null;
  data?: PacketData;
  meta?: PacketObject;
  deleted?: boolean;
  editedContent?: string | null;
}

/**
 * Packet class for chat messages.
 */
export class Packet {
  version: number;
  type: string;
  id: string;
  origin: string;
  timestamp: number;
  actor: ActorInfo;
  auth: AuthData;
  data: PacketData;
  meta: PacketObject;
  deleted: boolean;
  editedContent: string | null;

  constructor({
    version = 1,
    type = "chat.message",
    id = uuidv4(),
    origin = "server",
    timestamp = Date.now(),
    actor,
    auth: authData,
    data = {},
    meta = {},
    deleted = false,
    editedContent = null,
  }: PacketInit = {}) {
    this.version = version;
    this.type = type;
    this.id = id;
    this.origin = origin;
    this.timestamp = timestamp;
    this.actor = normalizeActorInfo(actor);
    this.auth = normalizeAuthData(authData);
    this.data = data || {};
    this.meta = meta || {};
    this.deleted = deleted;
    this.editedContent = editedContent;
  }

  markDeleted(): void {
    this.deleted = true;
  }

  edit(newContent: string): void {
    this.editedContent = newContent;
    this.data.body = newContent;
  }

  serialize(): SerializedPacket {
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

  /**
   * Saves packet to Redis sorted set.
   */
  async save(): Promise<void> {
    await cache.set(`packet:${this.id}`, this.serialize());
    await cache.zAdd("packets", { score: this.timestamp, value: this.id });
  }

  /**
   * Loads a packet from Redis.
   */
  static async load(id: string): Promise<Packet | null> {
    const data = await cache.get<SerializedPacket>(`packet:${id}`);
    if (!data) return null;
    return Packet.fromJson(data);
  }

  /**
   * Creates a Packet from JSON.
   */
  static fromJson(jsonInput: string | SerializedPacket): Packet {
    const parsed = typeof jsonInput === "string" ? (JSON.parse(jsonInput) as SerializedPacket) : jsonInput;
    return new Packet(parsed);
  }
}

function normalizeActorInfo(actor?: Partial<ActorInfo> | null): ActorInfo {
  return {
    id: actor?.id || null,
    name: actor?.name || "Unknown",
    roles: actor?.roles || [],
    permissions: actor?.permissions || [],
  };
}

function normalizeAuthData(authData?: Partial<AuthData> | null): AuthData {
  return {
    userId: authData?.userId || null,
    sessionToken: authData?.sessionToken || null,
  };
}

/**
 * Creates a chat packet.
 */
export async function createPacket(
  actorId: string | null,
  body: string,
  actorDetails?: Partial<ActorInfo>,
  origin = "server",
  data: PacketData = {},
  meta: PacketObject = {}
): Promise<Packet> {
  return new Packet({
    type: "chat.message",
    origin,
    actor: {
      id: actorId || null,
      name: actorDetails?.name || "Unknown",
      roles: actorDetails?.roles || [],
      permissions: actorDetails?.permissions || [],
    },
    data: {
      body: body || "",
      ...data,
    },
    meta,
  });
}

/**
 * Adds a packet to Redis.
 */
export async function addPacket(packet: Packet): Promise<boolean> {
  if (!packet || !(packet instanceof Packet)) return false;

  const trustedOrigin = packet.origin === "admin" || packet.origin === "discord" || packet.origin === "server";
  const actorId = trustedOrigin ? packet.actor.id || getRootId() || null : packet.actor.id || null;
  return persistPacket(packet, actorId);
}

/**
 * Persists a packet to Redis.
 */
export async function persistPacket(packet: Packet, actorId: string | null = packet.actor.id || null): Promise<boolean> {
  packet.actor.id = actorId;
  if (packet.auth.userId == null && actorId != null) {
    packet.auth.userId = actorId;
  }
  await packet.save();
  packetEvents.emit("packetAdded", packet);
  return true;
}

/**
 * Gets recent packets from Redis.
 */
export async function getPackets(limit = 50): Promise<SerializedPacket[]> {
  const packetIds = await cache.zRange("packets", 0, -1);
  const limitedIds = packetIds.slice(-limit);

  const packets: SerializedPacket[] = [];
  for (const packetId of limitedIds) {
    const packetData = await cache.get<SerializedPacket>(`packet:${packetId}`);
    if (packetData && !packetData.deleted) {
      packets.push(packetData);
    }
  }

  return packets.reverse();
}

/**
 * Deletes a packet from Redis.
 */
export async function deletePacket(packetId: string): Promise<boolean> {
  const packetData = await cache.get<SerializedPacket>(`packet:${packetId}`);
  if (!packetData) return false;

  await cache.del(`packet:${packetId}`);
  await cache.zRem("packets", packetId);

  packetEvents.emit("packetDeleted", packetId);
  return true;
}

/**
 * Edits a packet's content.
 */
export async function editPacket(packetId: string, newContent: string): Promise<boolean> {
  const packet = await Packet.load(packetId);
  if (!packet) return false;

  packet.edit(newContent);
  await packet.save();

  packetEvents.emit("packetEdited", packetId);
  return true;
}

function getRootId(): string | null {
  return getRootCredentials()?.userId ?? null;
}
