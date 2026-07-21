require("dotenv").config();

const { App } = require("@slack/bolt");
const quizCommands = require("./commands/quiz");
const GameManager = require("./game/GameManager");
const RoundHandler = require("./game/RoundHandler");

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  appToken: process.env.SLACK_APP_TOKEN,
  socketMode: true
});

app.command("/vinylbot-ping", async ({ command, ack, respond }) => {
  const start = Date.now();
  await ack();
  const latency = Date.now() - start;
  await respond({ text: `Pong!\nLatency: ${latency}ms` });
});

quizCommands.register(app);

// Ogni messaggio di chat è una potenziale risposta al quiz in corso sul canale.
// RoundHandler ignora silenziosamente i messaggi se non c'è un round attivo lì.
app.message(async ({ message, client }) => {
  if (message.subtype || message.bot_id) return; // ignoro bot/edit/join ecc.

  await RoundHandler.handleMessage({
    client,
    gameManager: GameManager,
    channelId: message.channel,
    userId: message.user,
    text: message.text || "",
  });
});



// Server HTTP separato: servirà per il callback OAuth di Spotify, intanto espone l'health check
const express = require("express");
const web = express();

// true solo dopo che la connessione Socket Mode a Slack è partita
let botReady = false;

/**
 * Endpoint di health check per la pagina /status del sito
 * @route GET /health
 */
web.get("/health", (req, res) => {
  res.set("Access-Control-Allow-Origin", "*"); // la fetch parte dal dominio del sito
  res.json({
    status: botReady ? "online" : "degraded",
    uptime: process.uptime()   // secondi da quando il processo è partito
  });
});

web.listen(process.env.PORT || 8889, "0.0.0.0", () => {
  console.log(`Web server listening on http://0.0.0.0:${process.env.PORT || 8889}`);
});

(async () => {
  await app.start();
  botReady = true;
  console.log("bot is running!");
})();
