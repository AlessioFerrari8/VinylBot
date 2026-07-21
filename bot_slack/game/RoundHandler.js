/**
 * Modulo RoundHandler - Gestisce un round di indovinelli su Slack: niente message
 * collector nativo come in discord.js, quindi teniamo lo stato del round attivo per
 * canale e lo confrontiamo coi messaggi che arrivano dal listener globale in index.js.
 */

const database = require('../db/firestore');

/** @type {Map<string, Object>} Round attivi per canale Slack */
const activeRounds = new Map();

const ROUND_MS = 30000;
const HINT_MS = 15000;

/**
 * Avvia un nuovo round: 30 secondi per rispondere, hint dopo 15.
 * @param {Object} params - { client, channelId, gameManager, gameState }
 */
function startRound({ client, channelId, gameManager, gameState }) {
    stopRound(channelId); // nel caso fosse rimasto un round precedente

    const round = {
        roundEnded: false,
        guessers: new Set(),
    };

    round.hintTimeout = setTimeout(() => {
        const currentSong = gameManager.getCurrentSong(channelId);
        if (!currentSong) return;
        const hint = currentSong.title
            .split(' ')
            .map(w => w[0] + '\\_'.repeat(Math.max(w.length - 1, 0)))
            .join(' ');
        client.chat.postMessage({ channel: channelId, text: `💡 *Hint:* ${hint}` });
    }, HINT_MS);

    round.endTimeout = setTimeout(async () => {
        if (round.roundEnded) return;
        round.roundEnded = true;
        activeRounds.delete(channelId);

        for (const userId of round.guessers) {
            await database.resetStreak(userId, gameState.teamId);
        }

        const toGuess = gameManager.getToGuess(channelId);
        if (toGuess) {
            await client.chat.postMessage({ channel: channelId, text: `Time's up! The song was *${toGuess}*` });
        }
        await gameManager.nextRound({ client, channelId });
    }, ROUND_MS);

    activeRounds.set(channelId, round);
}

/**
 * Ferma il round corrente sul canale, se presente.
 */
function stopRound(channelId) {
    const round = activeRounds.get(channelId);
    if (!round) return;
    clearTimeout(round.hintTimeout);
    clearTimeout(round.endTimeout);
    activeRounds.delete(channelId);
}

/**
 * Processa un messaggio di chat come possibile risposta al round attivo sul canale.
 * Chiamato dal listener globale `app.message()` in index.js.
 * @param {Object} params - { client, gameManager, channelId, userId, text }
 */
async function handleMessage({ client, gameManager, channelId, userId, text }) {
    // Con l'evento message.channels arriva un messaggio da ogni canale pubblico del
    // workspace, non solo da quelli con un round attivo: questo controllo scarta la
    // stragrande maggioranza in un singolo lookup, senza loggare (rumore inutile su
    // un workspace grande — vedi bot_slack/README.md).
    const round = activeRounds.get(channelId);
    if (!round || round.roundEnded) return;

    round.guessers.add(userId);

    // controllo sincrono, nessun await prima del lock: se due persone rispondono
    // quasi in contemporanea, solo la prima arriva a settare roundEnded
    const correct = gameManager.isCorrectGuess(text, channelId);
    console.log(`[RoundHandler] Guess from ${userId}: "${text}" -> correct=${correct}, expected="${gameManager.getToGuess(channelId)}"`);
    if (!correct) return;

    round.roundEnded = true;
    clearTimeout(round.hintTimeout);
    clearTimeout(round.endTimeout);
    activeRounds.delete(channelId);

    const teamId = gameManager.getTeamId(channelId);
    await database.addPoint(userId, teamId);

    const currentSong = gameManager.getCurrentSong(channelId);
    if (currentSong) {
        await client.chat.postMessage({
            channel: channelId,
            text: `The song was guessed by <@${userId}> — *${currentSong.title}* by _${currentSong.artist}_`,
        });
    }

    await gameManager.nextRound({ client, channelId });
}

module.exports = { startRound, stopRound, handleMessage };
