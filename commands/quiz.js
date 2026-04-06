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
            .map(([userId, points], i) => {
                const badge = database.getBadge(points);
                return `${i + 1}. <@${userId}> — ${points} points ${badge.emoji} **${badge.name}**`;
            })
            .join('\n');

            interaction.reply(`🏆 **Leaderboard**\n${text}`);
        }

    },

    {
        /**
         * Comando Stats
         * Visualizza i punti del giocatore + il badge 
         */
        data: new SlashCommandBuilder()
            .setName('stats')
            .setDescription('Shows your stats'),
        
        async execute(interaction) {
            // prendo id
            const userId = interaction.user.id;
            // punti
            const points = database.getScore(userId);
            // calcolo il badge in base ai punti
            const badge = database.getBadge(points);
            
            // calcolo il rank nella classifica
            const leaderboard = database.getLeaderboard();
            const rank = leaderboard.findIndex(([id]) => id === userId) + 1;

            // streak
            const streak = database.getStreak(userId);
            const maxStreak = database.getMaxStreak(userId);

            // piccoli calcoli per la nextTier e i punti per arrivarci
            const nextTierPoints = [5, 10, 20, 50, 100, Infinity];
            const currentTierIndex = [0, 5, 10, 20, 50].findIndex(p => points < p);
            const nextTier = nextTierPoints[currentTierIndex];
            const pointsToNext = nextTier - points;

            // output
            const statsText = `
            📊 **Your Personal Stats**
            ═══════════════════
            👤 Player: <@${userId}>
            🏅 Rank: #${rank} of ${leaderboard.length}
            ⭐ Points: ${points}
            🔥 Current Streak: ${streak}
            🏆 Best Streak: ${maxStreak}
            🎖️ Badge: ${badge.emoji} **${badge.name}** (Tier ${badge.tier})
            📈 Progress: ${points}/${nextTier} pts
            🎯 Next tier: +${pointsToNext} points
            `;

            // progressbar carina
            const progressPercentage = Math.round((points / nextTier) * 10);
            const filled = '█'.repeat(progressPercentage);
            const empty = '░'.repeat(10 - progressPercentage);
            // mi calcolo la perc
            const progressBar = `[${filled}${empty}] ${Math.round((points / nextTier) * 100)}%`;

            // aggiungo anche la statsbar
            const finalStats = `${statsText}
            ${progressBar}
            `;

            interaction.reply(finalStats);        
        }

    }, // TODO: aggiungere /streak
];

module.exports = commands;
