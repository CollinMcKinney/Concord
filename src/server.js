// server.js
const express = require("express");
const bodyParser = require("body-parser");
const { initStorage, saveState, loadState, startAutoSaveDynamic } = require("./datastore");
const auth = require("./auth");
const { initializeRoot } = require("./users");
const { Roles } = require("./roles");

// Import Discord bot (starts automatically)
require('./discord_bot');

// Import admin router
const adminRouter = require("./admin_router");

const app = express(); // <-- app must exist before using app.use

// Middleware
app.use(bodyParser.json());

// Mount the admin router at /admin
app.use("/admin", adminRouter);

async function start() {
  
  await initStorage();
  await loadState();

  await initializeRoot();

  startAutoSaveDynamic();
  await saveState();
}

start();

app.listen(process.env.API_PORT, () => {
  console.log(`Concord API running at http://localhost:${process.env.API_PORT}`);
});