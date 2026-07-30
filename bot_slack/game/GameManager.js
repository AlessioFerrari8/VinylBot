/**
 * Modulo GameManager - Gestisce il flusso principale del gioco di indovinelli su Slack.
 * Niente canale vocale: l'estratto audio viene caricato come file nel canale e gli
 * utenti indovinano scrivendo normalmente in chat.
 */

const fs = require('fs');
const path = require('path');
const database = require('../db/firestore');
const YouTube = require('./YouTubeSearch');
const RoundHandler = require('./RoundHandler');
const spotify = require('../spotify/client');
const LocalMusicManager = require('./LocalMusicManager');

/** @type {Map<string, Object>} Stato di gioco per canale Slack (channelId -> gameState) */
const games = new Map();

const MUSIC_DIR = path.join(__dirname, '../music');
const localMusic = new LocalMusicManager(MUSIC_DIR);
localMusic.loadSongs();

const MAX_ROUNDS = 10;

/** @type {Map<string, string[]>} channelId -> titoli usciti nelle partite recenti */
const recentTitles = new Map();

// Quante canzoni ricordare per canale tra una partita e l'altra: due partite piene, così
// rigiocare subito lo stesso artista dà un set diverso invece delle solite canzoni.
const RECENT_MEMORY = MAX_ROUNDS * 2;

/**
 * Escapa i caratteri speciali di Slack prima di interpolare testo utente in un messaggio
 * non-ephemeral: senza questo, un artistName tipo "<!channel>" o "<!here>" verrebbe
 * interpretato da Slack come mention broadcast, permettendo di pingare tutto il canale.
 */
function escapeSlackText(text) {
    return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Ripulisce un titolo da suffissi tipo "- Remastered 2009" o "(Live)": stessa logica
 * usata per il confronto in isCorrectGuess, applicata già in fase di storage così hint
 * e messaggi mostrano sempre il titolo pulito, non il nome grezzo restituito da Spotify.
 */
function cleanTitle(title) {
    return title
        .replace(/\(.*?\)|\[.*?\]/g, '')
        .replace(/[-–—].*/g, '')
        .trim()
        .replace(/\s+/g, ' ');
}

/** Chiave di confronto tra tracce: la stessa canzone compare più volte con nomi diversi. */
function trackKey(track) {
    return cleanTitle(track.name).toLowerCase();
}

/**
 * Toglie i doppioni dal pool. La search Spotify restituisce la stessa canzone più volte
 * (album diversi, remaster, versioni live) come track distinte: senza dedup il pool è
 * molto più piccolo di quanto sembri e la partita ripropone sempre gli stessi brani.
 */
function dedupeTracks(tracks) {
    const seen = new Set();
    return tracks.filter(track => {
        const key = trackKey(track);
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

/** Segna una canzone come "appena uscita" su questo canale, per le partite successive. */
function rememberTrack(channelId, track) {
    const key = trackKey(track);
    const previous = (recentTitles.get(channelId) || []).filter(k => k !== key);
    recentTitles.set(channelId, [key, ...previous].slice(0, RECENT_MEMORY));
}

/**
 * Sceglie la prossima canzone: mai una già uscita in questa partita e, a parità di
 * scelta, preferisce quelle che non sono uscite nemmeno nelle partite recenti sullo
 * stesso canale. Se il pool si esaurisce si riparte da capo invece di bloccare il gioco.
 * @returns {Object} track Spotify
 */
function pickTrack(channelId, gameState) {
    const played = new Set(gameState.playedTracks.map(trackKey));
    let pool = gameState.tracks.filter(track => !played.has(trackKey(track)));
    if (!pool.length) {
        // Pool esaurito (artista con meno brani dei round): si ricomincia il giro, ma
        // l'ultima canzone resta esclusa, altrimenti sul cambio di giro uscirebbe due
        // volte di fila. Se l'artista ha un solo brano non c'è alternativa.
        const last = gameState.playedTracks[gameState.playedTracks.length - 1];
        gameState.playedTracks = last ? [last] : [];
        pool = last ? gameState.tracks.filter(track => trackKey(track) !== trackKey(last)) : gameState.tracks;
        if (!pool.length) pool = gameState.tracks;
    }

    // avoidTitles è la fotografia scattata a inizio partita, non la mappa viva: leggendo
    // recentTitles ad ogni round la partita in corso eroderebbe la propria memoria
    // (ogni canzone nuova espelle la più vecchia), e a metà partita i brani di due
    // partite fa tornerebbero pescabili.
    const fresh = pool.filter(track => !gameState.avoidTitles.has(trackKey(track)));
    if (fresh.length) pool = fresh;

    const track = pool[Math.floor(Math.random() * pool.length)];
    gameState.playedTracks.push(track);
    rememberTrack(channelId, track);
    return track;
}

/**
 * Prova a ottenere un estratto audio per una track Spotify. Se Spotify/YouTube non
 * hanno risultati, ripiega su una canzone locale casuale — slegata dalla track
 * richiesta, ma sempre una canzone vera da far indovinare.
 * @param {Object} track - Oggetto track Spotify (name, artists[])
 * @returns {Promise<{filePath: string, isTemp: boolean, currentSong: Object}|null>}
 */
async function resolveTrackAudio(track) {
    const query = `${track.name} ${track.artists[0].name}`;
    console.log('[GameManager] Searching for:', query);
    try {
        const clip = await YouTube.createAudioClipSmart(query);
        return {
            filePath: clip.filePath,
            isTemp: true,
            currentSong: { title: cleanTitle(track.name), artist: track.artists[0].name, source: clip.source },
        };
    } catch (error) {
        console.warn('[GameManager] Estratto non disponibile, provo i file locali:', error.message);

        const randomSong = localMusic.getRandomSong();
        if (!randomSong) return null;

        return {
            filePath: randomSong.filePath,
            isTemp: false,
            currentSong: { title: cleanTitle(randomSong.name), artist: 'Local', source: 'local' },
        };
    }
}

/**
 * Carica l'estratto audio nel canale Slack e cancella il file temporaneo dopo l'upload.
 */
async function postClip(client, channelId, audio, comment) {
    try {
        await client.files.uploadV2({
            channel_id: channelId,
            file: fs.createReadStream(audio.filePath),
            // MAI il titolo della canzone nel filename: Slack lo mostra nel player, spoilerebbe la risposta
            filename: `clip-round.mp3`,
            initial_comment: comment,
        });
    } finally {
        // ripulisco anche se l'upload fallisce, altrimenti il file resta orfano in tmpdir
        if (audio.isTemp) fs.unlink(audio.filePath, () => { });
    }
}

/**
 * Avvia una nuova partita con i brani top di un artista Spotify.
 * @param {Object} params - { client, channelId, teamId, artistName }
 */
async function startGame({ client, channelId, teamId, artistName }) {
    const artist = await spotify.searchArtist(artistName);
    if (!artist) {
        await client.chat.postMessage({ channel: channelId, text: `Artist not found: *${escapeSlackText(artistName)}*` });
        return;
    }

    const tracks = dedupeTracks(await spotify.getArtistTracks(artist));
    if (!tracks.length) {
        await client.chat.postMessage({ channel: channelId, text: `No tracks found for *${escapeSlackText(artistName)}*` });
        return;
    }

    const gameState = {
        teamId,
        currentSong: null,
        tracks,
        playedTracks: [],
        avoidTitles: new Set(recentTitles.get(channelId) || []),
        roundNumber: 1,
    };

    const track = pickTrack(channelId, gameState);
    const audio = await resolveTrackAudio(track);
    if (!audio) {
        await client.chat.postMessage({ channel: channelId, text: 'No results found!' });
        return;
    }

    await postClip(client, channelId, audio, 'Round 1 - Guess the song! 🎵');

    gameState.currentSong = audio.currentSong;
    games.set(channelId, gameState);

    RoundHandler.startRound({ client, channelId, gameManager: module.exports, gameState });
}

/**
 * Ferma la partita corrente sul canale.
 */
function stopGame(channelId) {
    RoundHandler.stopRound(channelId);
    games.delete(channelId);
}

/**
 * Avanza al round successivo con una canzone diversa dalla playlist corrente.
 */
async function nextRound({ client, channelId }) {
    const gameState = games.get(channelId);
    if (!gameState) return;

    if (gameState.roundNumber >= MAX_ROUNDS) {
        const scores = await database.getLeaderboard(gameState.teamId);
        const text = scores.length
            ? scores.map(([userId, points], i) => `${i + 1}. <@${userId}> — ${points} points`).join('\n')
            : 'No scores yet!';

        await client.chat.postMessage({
            channel: channelId,
            text: `🎮 *Game Over!*\n\n🏆 *Final Leaderboard*\n${text}`,
        });
        stopGame(channelId);
        return;
    }

    RoundHandler.stopRound(channelId);

    // Prova qualche traccia diversa prima di arrendersi: una singola track senza audio
    // disponibile (né Spotify né YouTube né locale) non deve bloccare l'intera partita.
    const MAX_TRACK_ATTEMPTS = 3;
    let audio = null;
    for (let attempt = 0; attempt < MAX_TRACK_ATTEMPTS && !audio; attempt++) {
        audio = await resolveTrackAudio(pickTrack(channelId, gameState));
    }

    if (!audio) {
        await client.chat.postMessage({
            channel: channelId,
            text: "Couldn't find any playable song for this artist right now — ending the game.",
        });
        stopGame(channelId);
        return;
    }

    gameState.roundNumber += 1;
    gameState.currentSong = audio.currentSong;

    await postClip(client, channelId, audio, `Round ${gameState.roundNumber} - Guess the song! 🎵`);

    RoundHandler.startRound({ client, channelId, gameManager: module.exports, gameState });
}

/**
 * Controlla se la risposta combacia col titolo della canzone corrente. Volutamente
 * sincrona (nessun await): RoundHandler la usa come lock atomico per evitare che due
 * risposte corrette quasi simultanee vengano processate entrambe.
 * @returns {boolean}
 */
function isCorrectGuess(guess, channelId) {
    const gameState = games.get(channelId);
    if (!gameState) return false;

    const toGuess = gameState.currentSong.title;

    const clean = str => str
        .toLowerCase()
        .replace(/\(.*\)|\[.*\]/g, "")
        .replace(/[-–—].*/g, "")
        .replace(/[''´`]/g, "'")
        .replace(/[.,!?;:]/g, "")
        .trim()
        .replace(/\s+/g, ' ');

    const cleanGuess = clean(guess);
    const cleanToGuess = clean(toGuess);

    if (cleanGuess === cleanToGuess) return true;

    const mainTitle = cleanToGuess.split(/[-–—]/)[0].trim();
    if (cleanGuess === mainTitle) return true;

    return false;
}

function getToGuess(channelId) {
    const gameState = games.get(channelId);
    return gameState ? gameState.currentSong.title : null;
}

function getCurrentSong(channelId) {
    const gameState = games.get(channelId);
    return gameState ? gameState.currentSong : null;
}

function isGameActive(channelId) {
    return games.has(channelId);
}

function getTeamId(channelId) {
    const gameState = games.get(channelId);
    return gameState ? gameState.teamId : null;
}

module.exports = {
    startGame, stopGame, nextRound, isCorrectGuess,
    getToGuess, getCurrentSong, isGameActive, getTeamId,
};
