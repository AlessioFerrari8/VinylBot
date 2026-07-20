/**
 * Modulo Comandi Quiz - Gestisce tutti i comandi slash relativi al quiz
 * Comandi: quiz_start, quiz_stop, quiz_skip, leaderboard
 */

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const database = require('../db/firestore');
const GameManager = require('../game/GameManager');
const { buildLeaderboardCard, buildStatsCard, buildStreakCard } = require('../game/statsUI');


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
                    .setRequired(true),
            )
            .addStringOption(option => 
                option
                    .setName('mode')
                    .setDescription('Game mode')
                    .addChoices(
                        { name: 'local', value: 'local'},
                        { name: 'spotify', value: 'spotify'}
                    )
            ),
            
        
        async execute(interaction) {
            const userId = interaction.user.id;
            // metto pure playlist nel dubbio (magari è rimasto in cache playlist e non prende artist)
            const playlist = interaction.options.getString('playlist') || interaction.options.getString('artist');
            const mode = interaction.options.getString('mode') || 'local';
            
            await interaction.deferReply();
            console.log('Artist option:', playlist)
            console.log('All options:', interaction.options.data);
            console.log('Artist option:', interaction.options.getString('artist'));

            try {
                await GameManager.startGame(interaction, playlist, userId, mode);
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
                GameManager.stopGame(interaction.guildId);
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
            .setDescription('Shows the leaderboard')
            .addBooleanOption(option =>
                option
                .setName('global')
                .setDescription('Global leaderboard')
                .setRequired(false)
            ),
        
        async execute(interaction) {
            await interaction.deferReply();

            const global = interaction.options.getBoolean('global') ?? false;
            const leaderboard = global
                ? await database.getGlobalLeaderboard()
                : await database.getLeaderboard(interaction.guildId);
            if (!leaderboard.length) return interaction.editReply('No scores yet!');

            const entries = leaderboard.map(([userId, points]) => ({
                userId,
                points,
                badge: database.getBadge(points),
            }));

            interaction.editReply({
                components: [buildLeaderboardCard(entries)],
                flags: MessageFlags.IsComponentsV2,
            });
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
            await interaction.deferReply();

            // prendo id
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            // punti
            const points = await database.getScore(userId, guildId);
            // calcolo il badge in base ai punti
            const badge = database.getBadge(points);

            // calcolo il rank nella classifica (di questo server)
            const leaderboard = await database.getLeaderboard(guildId);
            const rank = leaderboard.findIndex(([id]) => id === userId) + 1;

            // streak
            const streak = await database.getStreak(userId, guildId);
            const maxStreak = await database.getMaxStreak(userId, guildId);

            // prossima soglia di tier: la prima nella lista che è ancora sopra i punti attuali
            const tierThresholds = [5, 10, 20, 50, 100];
            const nextTier = tierThresholds.find(t => points < t) ?? Infinity;
            const pointsToNext = Number.isFinite(nextTier) ? nextTier - points : 0;

            interaction.editReply({
                components: [buildStatsCard({
                    userId,
                    avatarURL: interaction.user.displayAvatarURL(),
                    points,
                    badge,
                    rank,
                    total: leaderboard.length,
                    streak,
                    maxStreak,
                    nextTier,
                    pointsToNext,
                })],
                flags: MessageFlags.IsComponentsV2,
            });
        }

    },
    {
        /**
         * Comando Streak
         * Mostra la streak di un utente + record personale 
         */
        data: new SlashCommandBuilder()
            .setName('streak')
            .setDescription('Shows your actual streak and your record'),
        
        async execute(interaction) {
            await interaction.deferReply();

            // prendo id
            const userId = interaction.user.id;
            const guildId = interaction.guildId;
            // streak
            const streak = await database.getStreak(userId, guildId);
            const maxStreak = await database.getMaxStreak(userId, guildId);

            interaction.editReply({
                components: [buildStreakCard({ userId, streak, maxStreak })],
                flags: MessageFlags.IsComponentsV2,
            });
        }

    },
];

module.exports = commands;
