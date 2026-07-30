/**
 * Modulo RoundHandler - Gestisce un round di indovinelli su Slack: niente message
 * collector nativo come in discord.js, quindi teniamo lo stato del round attivo per
 * canale e lo confrontiamo coi messaggi che arrivano dal listener globale in index.js.
 */

const database = require('../db/firestore');

/** @type {Map<string, Object>} Round attivi per canale Slack */
const activeRounds = new Map();

const ROUND_MS = 30000;

// Hint progressivi invece di uno solo: il primo dà le iniziali, i successivi svelano
// lettere sparse nel mezzo. L'ultimo cade con qualche secondo di margine sulla fine del
// round, così resta il tempo di scrivere la risposta.
const HINT_SCHEDULE_MS = [10000, 18000, 24000];

// Quota (cumulativa) delle lettere nascoste svelata a ogni hint: il primo è solo iniziali.
const HINT_REVEAL_RATIO = [0, 0.35, 0.6];

/**
 * Maschera il titolo lasciando visibili solo i caratteri agli indici in `revealed`.
 * Gli underscore sono escapati perché su Slack `_testo_` diventa corsivo.
 */
function maskTitle(chars, revealed) {
    return chars.map((ch, i) => (ch === ' ' ? ' ' : revealed.has(i) ? ch : '\\_')).join('');
}

/**
 * Prepara la sequenza di hint per un titolo. Sempre visibili: spazi, punteggiatura e
 * l'iniziale di ogni parola; le altre lettere vengono svelate in ordine casuale, così
 * gli hint successivi riempiono buchi sparsi invece di scoprire il titolo da sinistra.
 * @returns {string[]} un hint per ogni soglia di HINT_SCHEDULE_MS
 */
function buildHints(title) {
    const chars = [...title];
    const revealed = new Set();
    const maskable = [];

    let wordStart = true;
    chars.forEach((ch, i) => {
        if (ch === ' ') { wordStart = true; return; }
        if (!/[\p{L}\p{N}]/u.test(ch)) { revealed.add(i); return; }
        if (wordStart) { revealed.add(i); wordStart = false; return; }
        maskable.push(i);
    });

    for (let i = maskable.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [maskable[i], maskable[j]] = [maskable[j], maskable[i]];
    }

    // revealed viene mutato a ogni giro: gli hint sono cumulativi, una lettera già
    // svelata non torna coperta.
    const hints = HINT_REVEAL_RATIO.map(ratio => {
        maskable.slice(0, Math.floor(maskable.length * ratio)).forEach(i => revealed.add(i));
        return maskTitle(chars, revealed);
    });

    // Su titoli corti due soglie possono svelare le stesse lettere: evito di postare
    // due volte di fila un hint identico.
    return hints.filter((hint, i) => i === 0 || hint !== hints[i - 1]);
}

/**
 * Avvia un nuovo round: 30 secondi per rispondere, con hint progressivi lungo il round.
 * @param {Object} params - { client, channelId, gameManager, gameState }
 */
function startRound({ client, channelId, gameManager, gameState }) {
    stopRound(channelId); // nel caso fosse rimasto un round precedente

    const round = {
        roundEnded: false,
        guessers: new Set(),
        hintTimeouts: [],
    };

    // Gli hint sono calcolati una volta sola a inizio round: ricalcolarli a ogni scadenza
    // rimescolerebbe le posizioni casuali e un hint potrebbe "ricoprire" lettere già viste.
    const currentSong = gameManager.getCurrentSong(channelId);
    const hints = currentSong ? buildHints(currentSong.title) : [];

    hints.forEach((hint, index) => {
        round.hintTimeouts.push(setTimeout(() => {
            if (round.roundEnded) return;
            client.chat.postMessage({
                channel: channelId,
                text: `💡 *Hint ${index + 1}/${hints.length}:* ${hint}`,
            }).catch(err => console.error('[RoundHandler] hint postMessage failed:', err.message));
        }, HINT_SCHEDULE_MS[index]));
    });

    // async dentro setTimeout: senza try/catch una singola await rigettata (Slack API
    // rate-limit, Firestore giù...) sarebbe una unhandled rejection che crasha l'intero
    // processo, non solo il round/canale coinvolto.
    round.endTimeout = setTimeout(async () => {
        try {
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
        } catch (err) {
            console.error('[RoundHandler] endTimeout failed:', err);
        }
    }, ROUND_MS);

    activeRounds.set(channelId, round);
}

/**
 * Ferma il round corrente sul canale, se presente.
 */
function stopRound(channelId) {
    const round = activeRounds.get(channelId);
    if (!round) return;
    round.hintTimeouts.forEach(clearTimeout);
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
    round.hintTimeouts.forEach(clearTimeout);
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
