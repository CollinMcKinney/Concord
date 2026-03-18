const auth = require("./auth");
const datastore = require("./datastore");
const packets = require("./packet"); // Packet.js
const users = require("./users");

module.exports = {
  authenticate: auth.authenticate,
  verifySession: auth.verifySession,
  saveState: datastore.saveState,
  loadState: datastore.loadState,
  addPacket: packets.addPacket,
  getPackets: packets.getPackets,
  deletePacket: packets.deletePacket,
  editPacket: packets.editPacket,
  createUser: users.createUser,
  listUsers: users.listUsers,
  getUser: users.getUser,
  setRole: users.setRole,
};