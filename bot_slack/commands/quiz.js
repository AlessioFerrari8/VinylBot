/**
 * Modulo Comandi Quiz - Registra tutti gli slash command del quiz su Bolt.
 * I nomi dei comandi vanno configurati anche lato Slack (api.slack.com/apps ->
 * Slash Commands), qui li registriamo solo lato codice.
 */

const database = require('../db/firestore');
const GameManager = require('../game/GameManager');

function register(app) {
    app.command('/vinylbot-quiz_start', async ({ command, ack, client }) => {
        await ack();
        const artistName = command.text.trim();

        if (!artistName) {
            await client.chat.postEphemeral({
                channel: command.channel_id, user: command.user_id,
                text: 'Usage: `/vinylbot-quiz_start <artist>`',
            });
            return;
        }
        if (GameManager.isGameActive(command.channel_id)) {
            await client.chat.postEphemeral({
                channel: command.channel_id, user: command.user_id,
                text: 'A game is already running in this channel! Use `/vinylbot-quiz_stop` first.',
            });
            return;
        }

        try {
            await GameManager.startGame({
                client, channelId: command.channel_id, teamId: command.team_id, artistName,
            });
        } catch (err) {
            console.error('[vinylbot-quiz_start]', err);
            await client.chat.postMessage({ channel: command.channel_id, text: 'Error starting game.' });
        }
    });

    app.command('/vinylbot-quiz_stop', async ({ command, ack, client }) => {
        await ack();
        GameManager.stopGame(command.channel_id);
        await client.chat.postMessage({ channel: command.channel_id, text: 'Game stopped!' });
    });

    app.command('/vinylbot-quiz_skip', async ({ command, ack, client }) => {
        await ack();
        if (!GameManager.isGameActive(command.channel_id)) {
            await client.chat.postEphemeral({
                channel: command.channel_id, user: command.user_id, text: 'No game running in this channel.',
            });
            return;
        }
        await GameManager.nextRound({ client, channelId: command.channel_id });
    });

    app.command('/vinylbot-leaderboard', async ({ command, ack, client }) => {
        await ack();
        const global = command.text.trim().toLowerCase() === 'global';
        const leaderboard = global
            ? await database.getGlobalLeaderboard()
            : await database.getLeaderboard(command.team_id);

        if (!leaderboard.length) {
            await client.chat.postMessage({ channel: command.channel_id, text: 'No scores yet!' });
            return;
        }

        const text = leaderboard
            .map(([userId, points], i) => `${i + 1}. <@${userId}> — ${points} pts ${database.getBadge(points).emoji}`)
            .join('\n');

        await client.chat.postMessage({
            channel: command.channel_id,
            text: `🏆 *${global ? 'Global' : 'Workspace'} Leaderboard*\n${text}`,
        });
    });

    app.command('/vinylbot-stats', async ({ command, ack, client }) => {
        await ack();
        const userId = command.user_id;
        const teamId = command.team_id;

        const points = await database.getScore(userId, teamId);
        const badge = database.getBadge(points);
        const leaderboard = await database.getLeaderboard(teamId);
        const rank = leaderboard.findIndex(([id]) => id === userId) + 1;
        const streak = await database.getStreak(userId, teamId);
        const maxStreak = await database.getMaxStreak(userId, teamId);

        const tierThresholds = [5, 10, 20, 50, 100];
        const nextTier = tierThresholds.find(t => points < t) ?? Infinity;
        const nextTierText = Number.isFinite(nextTier)
            ? `${nextTier - points} points to next tier`
            : 'max tier!';
        const rankText = rank > 0 ? `#${rank} of ${leaderboard.length}` : 'unranked';

        await client.chat.postEphemeral({
            channel: command.channel_id,
            user: userId,
            text: `${badge.emoji} *${badge.name}* — ${points} points (${rankText})\n🔥 Streak: ${streak} (best: ${maxStreak})\n${nextTierText}`,
        });
    });

    app.command('/vinylbot-streak', async ({ command, ack, client }) => {
        await ack();
        const userId = command.user_id;
        const teamId = command.team_id;

        const streak = await database.getStreak(userId, teamId);
        const maxStreak = await database.getMaxStreak(userId, teamId);

        await client.chat.postEphemeral({
            channel: command.channel_id,
            user: userId,
            text: `🔥 Current streak: *${streak}*\n🏅 Best streak: *${maxStreak}*`,
        });
    });
}

module.exports = { register };
