require('dotenv').config();
const { Client, GatewayIntentBits, WebhookClient } = require('discord.js');
const { addMessage, getMessages, messageEvents, Message } = require('./messages');
const { initStorage } = require('./datastore');
const Users = require('./users');

const bot = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const webhook = new WebhookClient({
  id: process.env.WEBHOOK_ID,
  token: process.env.WEBHOOK_TOKEN,
});

// ---------------- Discord → Chat Server ----------------
bot.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  try {
    await addMessage(process.env.ROOT_USER_ID, process.env.ROOT_SESSION_TOKEN, message.content);
    console.log(`Discord → Server: ${message.content}`);
  } catch (err) {
    console.error('Failed to relay Discord message:', err);
  }
});

// ---------------- Chat Server → Discord ----------------
messageEvents.on('messageAdded', async (msg) => {
  if (msg.deleted) 
    return;

  try {
    await webhook.send({
      content: msg.content,
      username: `User:${msg.actorId}`,
    });
    console.log(`Server → Discord: ${msg.content}`);
  } catch (err) {
    console.error('Webhook send failed:', err);
  }
});

// ---------------- Startup ----------------
async function startBot() {
  bot.once('clientReady', () => {
    console.log(`Bot logged in as ${bot.user.tag}`);
  });

  await bot.login(process.env.BOT_TOKEN).catch(console.error);
}

startBot();