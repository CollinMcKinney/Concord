const WebSocket = require("ws");
const { Packet, addPacket } = require("./packet");
const { createGuestSession, updateUserOsrsName } = require("./users");
const runtimeConfig = require("./runtime_config");
const auth = require("./auth");

const clients = new Set();
const GUEST_INIT_DELAY_MS = 500;

function attachToServer(httpServer) {
  const webSocketServer = new WebSocket.Server({ server: httpServer });

  webSocketServer.on("connection", async (webSocket, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`RuneLite client connected from ${clientIp}`);
    clients.add(webSocket);
    webSocket.clientAuth = null;
    webSocket.initialized = false;
    webSocket.guestInitTimer = setTimeout(() => {
      initializeGuestSession(webSocket, clientIp).catch(err => {
        console.error(`Failed to initialize RuneLite guest session for ${clientIp}:`, err);
        webSocket.close();
      });
    }, GUEST_INIT_DELAY_MS);

    webSocket.on("message", async (rawPacket) => {
      try {
        const rawJson = Buffer.isBuffer(rawPacket) ? rawPacket.toString("utf8") : String(rawPacket);
        const packet = Packet.fromJson(rawJson);

        if (!webSocket.initialized && packet.type === "auth.resume") {
          const resumed = await tryResumeGuestSession(webSocket, clientIp, packet);
          if (!resumed) {
            await initializeGuestSession(webSocket, clientIp);
          }
          return;
        }

        const success = await addPacket(packet);
        if (!success) {
          console.warn("Failed to add packet from RuneLite client:", packet.serialize());
          return;
        }

        if (packet.type === "auth.profileSync") {
          console.log(`Updated RuneLite guest profile for ${packet.actor.name || packet.data.osrsName || "Unknown"}`);
        } else {
          console.log(`Received and stored packet from ${packet.actor.name}: "${packet.data.body || ""}"`);
        }
      } catch (err) {
        console.error("RuneLite WS error processing packet:", err);
        webSocket.send(JSON.stringify({ error: err.message }));
      }
    });

    webSocket.on("close", () => {
      console.log(`RuneLite client disconnected: ${clientIp}`);
      clearGuestInitTimer(webSocket);
      clients.delete(webSocket);
    });

    webSocket.on("error", (err) => {
      console.error(`RuneLite WS error from ${clientIp}:`, err);
    });
  });

  return webSocketServer;
}

function clearGuestInitTimer(webSocket) {
  if (webSocket.guestInitTimer) {
    clearTimeout(webSocket.guestInitTimer);
    webSocket.guestInitTimer = null;
  }
}

async function initializeGuestSession(webSocket, clientIp) {
  if (webSocket.initialized || webSocket.readyState !== WebSocket.OPEN) {
    return;
  }

  clearGuestInitTimer(webSocket);

  const guestSession = await createGuestSession();
  webSocket.clientAuth = {
    userId: guestSession.user.id,
    sessionToken: guestSession.sessionToken,
  };
  webSocket.initialized = true;

  await sendGuestIssuedPacket(webSocket, guestSession.user.id, guestSession.sessionToken);
  console.log(`Issued new RuneLite guest session for ${clientIp}: ${guestSession.user.id}`);
}

async function tryResumeGuestSession(webSocket, clientIp, packet) {
  const userId = packet.auth?.userId || packet.data?.userId;
  const sessionToken = packet.auth?.sessionToken || packet.data?.sessionToken;
  if (!userId || !sessionToken) {
    return false;
  }

  const verifiedUserId = await auth.verifySession(userId, sessionToken);
  if (!verifiedUserId) {
    console.warn(`Failed to resume RuneLite guest session for ${clientIp}: invalid session`);
    return false;
  }

  const osrsName = packet.data?.osrsName || packet.actor?.name;
  if (osrsName) {
    await updateUserOsrsName(verifiedUserId, osrsName);
  }

  clearGuestInitTimer(webSocket);
  webSocket.clientAuth = {
    userId: verifiedUserId,
    sessionToken,
  };
  webSocket.initialized = true;

  await sendGuestIssuedPacket(webSocket, verifiedUserId, sessionToken);
  console.log(`Resumed RuneLite guest session for ${clientIp}: ${verifiedUserId}`);
  return true;
}

async function sendGuestIssuedPacket(webSocket, userId, sessionToken) {
  const suppressedPrefixes = await runtimeConfig.getSuppressedPrefixes();
  const authPacket = new Packet({
    type: "auth.guestIssued",
    origin: "server",
    actor: {
      id: process.env.ROOT_USER_ID || null,
      name: "Concord",
    },
    data: {
      userId,
      sessionToken,
      suppressedPrefixes,
      discordInviteUrl: process.env.DISCORD_INVITE_URL || "",
    },
  });

  webSocket.send(JSON.stringify(authPacket.serialize()));
}

function broadcast(packet) {
  const payload = JSON.stringify(packet instanceof Packet ? packet.serialize() : packet);

  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  }
}

function broadcastSuppressedPrefixesUpdate(suppressedPrefixes) {
  const packet = new Packet({
    type: "config.suppressedPrefixes",
    origin: "server",
    actor: {
      id: process.env.ROOT_USER_ID || null,
      name: "Concord",
    },
    data: {
      suppressedPrefixes,
    },
  });

  broadcast(packet);
}

function broadcastDiscordInviteUrlUpdate(discordInviteUrl) {
  const packet = new Packet({
    type: "config.discordInviteUrl",
    origin: "server",
    actor: {
      id: process.env.ROOT_USER_ID || null,
      name: "Concord",
    },
    data: {
      discordInviteUrl: discordInviteUrl || "",
    },
  });

  broadcast(packet);
}

module.exports = {
  attachToServer,
  broadcast,
  broadcastSuppressedPrefixesUpdate,
  broadcastDiscordInviteUrlUpdate,
};
