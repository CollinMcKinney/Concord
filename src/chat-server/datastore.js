// datastore.js
const redis = require("redis");

// Read host and port from environment variables, with defaults
const redisHost = process.env.REDIS_HOST || "127.0.0.1";
const redisPort = process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379;

console.log(`Initializing Redis client on ${redisHost}:${redisPort}...`);

const client = redis.createClient({
  socket: {
    host: redisHost,
    port: redisPort
  }
});

client.on("error", (err) => console.error("Redis Client Error", err));

async function initStorage() {
  await client.connect();
  console.log("Storage connected!");
}

// Basic operations
async function get(key) {
  const data = await client.get(key);
  return data ? JSON.parse(data) : null;
}

async function set(key, value, options = {}) {
  return client.set(key, JSON.stringify(value), options);
}

async function exists(key) {
  return client.exists(key);
}

async function sAdd(key, value) {
  return client.sAdd(key, value);
}

async function sMembers(key) {
  return client.sMembers(key);
}

async function zAdd(key, { score, value }) {
  return client.zAdd(key, { score, value });
}

async function zRange(key, start, end) {
  return client.zRange(key, start, end);
}

async function del(key) {
  return client.del(key);
}

// ========================
// Persistence (save/load full state)
// ========================
async function saveState() {
  console.log("Saving state...");
  const keys = await client.keys("*");
  const state = {};
  for (const key of keys) {
    const data = await get(key);
    if (data) state[key] = data;
  }
  console.log("Finished saving state.");
  return state;
}

async function loadState(state) {
  console.log("Loading previously saved state...");
  for (const [key, value] of Object.entries(state)) {
    await set(key, value);
  }
  console.log("Finished loading previously saved state.");
}

module.exports = {
  client,
  initStorage,
  get,
  set,
  exists,
  sAdd,
  sMembers,
  zAdd,
  zRange,
  del,
  saveState,
  loadState
};