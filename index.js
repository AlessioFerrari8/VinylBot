/**
 * VinylBot - Bot Discord per il gioco di indovinelli di canzoni Spotify
 * 
 * Punto di ingresso principale che:
 * - Carica le variabili d'ambiente e la configurazione di Discord/Spotify
 * - Inizializza il client del bot Discord e carica i comandi slash
 * - Configura il server Express per la gestione del callback OAuth di Spotify
 * - Registra i comandi con Discord e gestisce le interazioni
 */

require('dotenv').config();
const spotify = require('./spotify/client');
const { MessageFlags } = require('discord.js');


// Load environment variables
const discord_token = process.env.DISCORD_TOKEN
const discord_client = process.env.DISCORD_CLIENT_ID
const spotify_client = process.env.SPOTIFY_CLIENT_ID
const spotify_secret = process.env.SPOTIFY_CLIENT_SECRET
const spotify_redirect = process.env.SPOTIFY_REDIRECT_URI

// Moduli Discord.js
const { Client, GatewayIntentBits, Collection, REST, Routes } = require('discord.js')

// Crea il client del bot Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,  // per entrare in vocale
    GatewayIntentBits.GuildMembers,  
  ]
});

// Inizializza la collezione di comandi
client.commands = new Collection()

// Modulo file system per caricare i comandi
const fs = require('fs');

// Carica tutti i file di comandi dalla directory commands
const commandFiles = fs.readdirSync('./commands').filter(f => f.endsWith('.js'))

// prendo i singoli comandi
for (const file of commandFiles) {
    const commandModule = require(`./commands/${file}`)
    
    // gestisci sia array di comandi che singoli comandi
    const commands = Array.isArray(commandModule) ? commandModule : [commandModule];
    
    for (const command of commands) {
        if (command && command.data && command.data.name) {
            client.commands.set(command.data.name, command);
        }
    }
}


// Evento bot pronto
client.once('clientReady', async () => {
  console.log(`Bot running on ${client.user.tag}`);
  await registerCommands();
});

/**
 * Gestisce le interazioni dei comandi slash
 * @event interactionCreate
 */
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: 'Error!', flags: MessageFlags.Ephemeral });
  }
});

// Server Express per il callback OAuth di Spotify
const express = require('express');
const app = express()

/**
 * Endpoint di callback OAuth di Spotify
 * Riceve il codice di autorizzazione e l'ID utente dal redirect di Spotify
 * Scambia il codice con i token di accesso/refresh
 * @route GET /callback
 * @param {string} code - Codice di autorizzazione Spotify
 * @param {string} state - ID utente (inviato come parametro state per la sicurezza)
 * @param {string} error - Messaggio di errore se l'utente ha negato l'autorizzazione
 */
app.get('/callback', async (req, res) => {
  const { code, state: userId, error } = req.query;

  if (error) return res.send(`<h2>Error: ${error}</h2>!`);
  if (!code || !userId) return res.send('<h2>Missing data!</h2>');

  try {
    await spotify.handleCallback(userId, code);
    res.send(`<h1 style="color:#1DB954">Spotify linked succesfully! You can close this page.</h1>`);
  } catch (err) {
    res.send('<h2>Error while authenticating. Retry /auth.</h2>');
  }
});

app.listen(process.env.PORT || 8888, () => {
  console.log(`Server listening on http://localhost:${process.env.PORT || 8888}`);
});

/**
 * Registra tutti i comandi slash con Discord
 * Recupera le definizioni dei comandi da tutti i file e li registra globalmente
 * @async
 * @function registerCommands
 */
async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  
  const commands = [];
  for (const file of commandFiles) {
    const commandModule = require(`./commands/${file}`);
    const cmds = Array.isArray(commandModule) ? commandModule : [commandModule];
    for (const cmd of cmds) {
      if (cmd && cmd.data) commands.push(cmd.data.toJSON());
    }
  }

  // Registra globalmente se GUILD_ID non è impostato, altrimenti solo nel server specificato
  const route = process.env.GUILD_ID 
    ? Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID)
    : Routes.applicationCommands(process.env.DISCORD_CLIENT_ID);

  await rest.put(route, { body: commands });
  console.log('Commands registered');
}

// Effettua il login su Discord (registerCommands() viene chiamato nel clientReady event)
client.login(process.env.DISCORD_TOKEN);
