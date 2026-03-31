require('dotenv').config();
const spotify = require('./spotify/client');

// carico variabili env
const discord_token = process.env.DISCORD_TOKEN
const discort_client = process.env.DISCORD_CLIENT_ID
const spotify_client = process.env.SPOTIFY_CLIENT_ID
const spotify_secret = process.env.SPOTIFY_CLIENT_SECRET
const spotify_redirect = process.env.SPOTIFY_REDIRECT_URI

// crezione client ds

// cose da discord.js
const { Client, GatewayIntentBits, Collection } = require('discord.js')

// creo il client
const client = new Client({
    intents: [GatewayIntentBits.Guilds]
});

// creo la collection di comandi
client.commands = new Collection()


// leggo i comandi
const fs = require('fs');

// comandi (ignoro file che non sono .js)
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


client.once('ready', () => {
  console.log(`Bot running on ${client.user.tag}`);
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) return;

  try {
    await command.execute(interaction);
  } catch (err) {
    console.error(err);
    await interaction.reply({ content: 'Error!', ephemeral: true });
  }
});

// server 
const express = require('express');
const app = express()

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

// gestione comandi
async function registerCommands() {
  const { REST, Routes } = require('discord.js');
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  
  const commands = [];
  for (const file of commandFiles) {
    const commandModule = require(`./commands/${file}`);
    const cmds = Array.isArray(commandModule) ? commandModule : [commandModule];
    for (const cmd of cmds) {
      if (cmd && cmd.data) commands.push(cmd.data.toJSON());
    }
  }

  await rest.put(
    Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
    { body: commands }
  );
  console.log('Commands registered');
}


// chiamo la funzione
registerCommands();
client.login(process.env.DISCORD_TOKEN);

