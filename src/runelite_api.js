const { getMessages, addMessage } = require("./packet");
const { getUser } = require("./users");

class Message {
  constructor() {
    this.type = "";
    this.data = new Data();
  }
}

class Data {
  constructor() {
    this.name = "";
    this.body = "";
    this.timestamp = 0;
  }
}

module.exports = {
  Message,
  Data,
  getMessages,
  addMessage,
  getUser,
  // any other RuneLite-accessible function
};