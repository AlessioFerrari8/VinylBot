/**
 * Modulo Comandi Spotify - Gestisce l'autenticazione e la riproduzione Spotify
 * Comandi: auth, logout, play
 */

const { SlashCommandBuilder } = require('discord.js');
const spotifyClient = require('../spotify/client');
const commands = [
    {
        /**
         * Comando Auth
         * Avvia il flusso di autenticazione OAuth2 di Spotify
         * L'utente è reindirizzato alla pagina di login di Spotify
         */
        data: new SlashCommandBuilder()
            .setName('auth')
            .setDescription('Links your Spotify account'),
        
        async execute(interaction) {
            try {
                // prendo id e chiamo il metodo x auth
                const userId = interaction.user.id;
                const authUrl = spotifyClient.getAuthUrl(userId);
                
                // aspetto risposta e do ack
                await interaction.reply({
                    content: `Click here to authenticate with Spotify:\n${authUrl}`,
                    ephemeral: true // temporaneo
                });
            } catch (error) {
                await interaction.reply({
                    content: 'Error: Error during authentication',
                    ephemeral: true
                });
            }
        }
    },

    {
        /**
         * Comando Logout
         * Scollega l'account Spotify dell'utente dal bot
         */
        data: new SlashCommandBuilder()
            .setName('logout')
            .setDescription('Unlinks your Spotify account'),
        
        async execute(interaction) {
            try {
                // prendo id e chiamo il metodo per il logout
                const userId = interaction.user.id;
                spotifyClient.logout(userId);
                
                // aspetto e do ack
                await interaction.reply({
                    content: 'Spotify account unlinked!',
                    ephemeral: true
                });
            } catch (error) {
                await interaction.reply({
                    content: 'Error: Error during logout',
                    ephemeral: true
                });
            }
        }
    },

    {
        /**
         * Comando Play
         * Cerca una canzone su Spotify e la riproduce (se l'anteprima è disponibile)
         */
        data: new SlashCommandBuilder()
            .setName('play')
            .setDescription('Search and play a song from Spotify')
            .addStringOption(option =>
                option
                    .setName('song')
                    .setDescription('Name of the song to play')
                    .setRequired(true)
            ),
        
        async execute(interaction) {
            try {
                // solito 
                const userId = interaction.user.id;
                const query = interaction.options.getString('song');
                
                // tempo per "gestire"
                await interaction.deferReply();
                
                // risultato 
                const result = await spotifyClient.play(userId, query);
                
                // errore
                if (!result.success) {
                    return await interaction.editReply({
                        content: `Error: ${result.message}`
                    });
                }
                
                // scrivo la traccia attuale
                const { track } = result;
                await interaction.editReply({
                    content: `Now playing: **${track.name}** by *${track.artist}*\nAlbum: ${track.album}`
                });
            } catch (error) {
                if (error.message === 'NOT_AUTHENTICATED') {
                    return await interaction.reply({
                        content: 'Error: You are not authenticated! Use `/auth` to link your Spotify account',
                        ephemeral: true
                    });
                }
                await interaction.editReply({
                    content: 'Error: Error while playing song'
                });
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('pause')
            .setDescription('Pauses playback'),
        
        async execute(interaction) {
            try {
                // solito
                const userId = interaction.user.id;
                const result = await spotifyClient.pause(userId);
                
                // ack
                await interaction.reply({
                    content: `${result.message}`
                });
            } catch (error) {
                if (error.message === 'NOT_AUTHENTICATED') {
                    return await interaction.reply({
                        content: 'Error: You are not authenticated! Use `/auth` to link your Spotify account',
                        ephemeral: true
                    });
                }
                await interaction.reply({
                    content: 'Error: Error while pausing'
                });
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('resume')
            .setDescription('Resumes playback'),
        
        async execute(interaction) {
            try {
                const userId = interaction.user.id;
                const result = await spotifyClient.resume(userId);
                
                await interaction.reply({
                    content: `${result.message}`
                });
            } catch (error) {
                if (error.message === 'NOT_AUTHENTICATED') {
                    return await interaction.reply({
                        content: 'Error: You are not authenticated! Use `/auth` to link your Spotify account',
                        ephemeral: true
                    });
                }
                await interaction.reply({
                    content: 'Error: Error while resuming'
                });
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('skip')
            .setDescription('Skips to the next song'),
        
        async execute(interaction) {
            try {
                const userId = interaction.user.id;
                await interaction.deferReply();
                
                const result = await spotifyClient.skip(userId);
                
                if (!result.success) {
                    return await interaction.editReply({
                        content: `Error: ${result.message}`
                    });
                }
                
                const { track } = result;
                await interaction.editReply({
                    content: `Skipped! Now playing: **${track.name}** by *${track.artist}*`
                });
            } catch (error) {
                if (error.message === 'NOT_AUTHENTICATED') {
                    return await interaction.reply({
                        content: 'Error: You are not authenticated! Use `/auth` to link your Spotify account',
                        ephemeral: true
                    });
                }
                await interaction.editReply({
                    content: 'Error: Error while skipping'
                });
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('previous')
            .setDescription('Goes to the previous song'),
        
        async execute(interaction) {
            try {
                const userId = interaction.user.id;
                await interaction.deferReply();
                
                const result = await spotifyClient.previous(userId);
                
                if (!result.success) {
                    return await interaction.editReply({
                        content: `Error: ${result.message}`
                    });
                }
                
                const { track } = result;
                await interaction.editReply({
                    content: `Previous! Now playing: **${track.name}** by *${track.artist}*`
                });
            } catch (error) {
                if (error.message === 'NOT_AUTHENTICATED') {
                    return await interaction.reply({
                        content: 'Error: You are not authenticated! Use `/auth` to link your Spotify account',
                        ephemeral: true
                    });
                }
                await interaction.editReply({
                    content: 'Error: Error while going previous'
                });
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('volume')
            .setDescription('Sets the Spotify volume')
            .addIntegerOption(option =>
                option
                    .setName('level')
                    .setDescription('Volume level (0-100)')
                    .setMinValue(0)
                    .setMaxValue(100)
                    .setRequired(true)
            ),
        
        async execute(interaction) {
            try {
                const userId = interaction.user.id;
                const volume = interaction.options.getInteger('level');
                
                const result = await spotifyClient.setVolume(userId, volume);
                
                await interaction.reply({
                    content: `${result.message}`
                });
            } catch (error) {
                if (error.message === 'NOT_AUTHENTICATED') {
                    return await interaction.reply({
                        content: 'Error: You are not authenticated! Use `/auth` to link your Spotify account',
                        ephemeral: true
                    });
                }
                await interaction.reply({
                    content: 'Error: Error setting volume'
                });
            }
        }
    },

    {
        data: new SlashCommandBuilder()
            .setName('nowplaying')
            .setDescription('Shows the currently playing song'),
        
        async execute(interaction) {
            try {
                const userId = interaction.user.id;
                await interaction.deferReply();
                
                const result = await spotifyClient.nowPlaying(userId);
                
                if (!result.success) {
                    return await interaction.editReply({
                        content: `Error: ${result.message}`
                    });
                }
                
                const { track, isPlaying } = result;
                const status = isPlaying ? 'Playing' : 'Paused';
                const progress = Math.floor(track.progress / 1000);
                const duration = Math.floor(track.duration / 1000);
                
                await interaction.editReply({
                    content: `${status}\n**${track.name}** by *${track.artist}*\nAlbum: ${track.album}\n${progress}s / ${duration}s`
                });
            } catch (error) {
                if (error.message === 'NOT_AUTHENTICATED') {
                    return await interaction.reply({
                        content: 'Error: You are not authenticated! Use `/auth` to link your Spotify account',
                        ephemeral: true
                    });
                }
                await interaction.editReply({
                    content: 'Error: Error retrieving current song'
                });
            }
        }
    }
];

module.exports = commands;
