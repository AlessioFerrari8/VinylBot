/**
 * Modulo Comandi Quiz - Gestisce tutti i comandi slash relativi al quiz
 * Comandi: quiz_start, quiz_stop, quiz_skip, leaderboard
 */

const { SlashCommandBuilder } = require('discord.js');
const database = require('../db/database');
const GameManager = require('../game/GameManager');


// lista comandi
const commands = [
    {
        /**
         * Comando Quiz Start
         * Avvia una nuova partita di indovinelli con un artista preso da yt
         */
        data: new SlashCommandBuilder()
            .setName('quiz_start')
            .setDescription('Starts a game with an artist or a genre')
            .addStringOption(option =>
                option
                    .setName('artist')
                    .setDescription('Artist o musical genre')
                    .setRequired(true)
            ),
        
        async execute(interaction) {
            const userId = interaction.user.id;
            // metto pure playlist nel dubbio (magari è rimasto in cache playlist e non prende artist)
            const playlist = interaction.options.getString('playlist') || interaction.options.getString('artist');
            
            await interaction.deferReply();
            console.log('Artist option:', playlist)
            console.log('All options:', interaction.options.data);
            console.log('Artist option:', interaction.options.getString('artist'));

            try {
                await GameManager.startGame(interaction, playlist, userId);
            } catch (error) {
                console.error(error);
                if (error.message === 'NOT_AUTHENTICATED') {
                return interaction.editReply('Use `/auth` first!');
                }
                interaction.editReply('Error starting game.');
            }
        }
    },

    {
        /**
         * Comando Quiz Stop
         * Termina la sessione di gioco corrente
         */
        data: new SlashCommandBuilder()
            .setName('quiz_stop')
            .setDescription('Stops the game'),
        
        async execute(interaction) {
            // utente
            const userId = interaction.user.id;
            await interaction.deferReply();

            try {
                GameManager.stopGame();
                await interaction.editReply('Game stopped!');
            } catch (error) {
                if (error.message === 'NOT_AUTHENTICATED') {
                    return interaction.editReply('Use `/auth` first!');
                }
                interaction.editReply('Error stopping game.');
            }
        }
    },

    {
        /**
         * Comando Quiz Skip
         * Salta al round successivo, riproducendo un'anteprima di una canzone diversa
         */
        data: new SlashCommandBuilder()
            .setName('quiz_skip')
            .setDescription('Goes to the next round'),
        
        async execute(interaction) {
            try {
                await interaction.deferReply();
                await GameManager.nextRound(interaction);
            } catch (error) {
                interaction.editReply('Error skipping round.');
            }
        }

    },

    {
        /**
         * Comando Leaderboard
         * Visualizza la classifica attuale con i punteggi di tutti i giocatori
         */
        data: new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('Shows the leaderboard'),
        
        async execute(interaction) {
            const leaderboard = database.getLeaderboard();
            if (!leaderboard.length) return interaction.reply('No scores yet!');
            
            // formattazione carina fatta 
            const text = leaderboard
                .map(([userId, points], i) => `${i + 1}. <@${userId}> — ${points} points`)
                .join('\n');
            
            interaction.reply(`🏆 **Leaderboard**\n${text}`);
        }

    },
];

module.exports = commands;
