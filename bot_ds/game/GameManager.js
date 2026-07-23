/**
 * Modulo GameManager - Gestisce il flusso principale del gioco di indovinelli
 * Caratteristiche: connessione al canale vocale, stream audio, gestione round, tracciamento punteggi
 */

const { joinVoiceChannel, getVoiceConnections, AudioPlayer, StreamType, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const database = require('../db/firestore');
const YouTube = require('./YouTubeSearch');
const RoundHandler = require('./RoundHandler');
const spotify = require('../spotify/client')
const fs = require('fs')
const path = require('path')
const LocalMusicManager = require('./LocalMusicManager');


/** @type {Object|null} Stato attuale del gioco incluso connessione, player, canzoni e punteggi */
// prima gestivo una singola partita, quindi se due server provavano a connettersi
// solo uno andava
const games = new Map()


const MUSIC_DIR = path.join(__dirname, '../music');
const localMusic = new LocalMusicManager(MUSIC_DIR);
localMusic.loadSongs();  // Carica le canzoni all'avvio


/**
 * Prova a ottenere l'audio per una track Spotify (Spotify preview / YouTube, a seconda
 * di DEPLOY_ENV — vedi YouTubeSearch.createAudioStreamSmart). Se lo stream non è
 * disponibile e ci sono file locali, ripiega su una canzone locale casuale — slegata
 * dalla track richiesta, ma sempre una canzone vera da far indovinare.
 * @param {Object} track - Oggetto track Spotify (name, artists[])
 * @returns {Promise<{resource, currentSong}|null>} null se non c'è nessuna sorgente disponibile
 */
/**
 * Crea un AudioPlayer con i listener di base già agganciati. Fondamentale il listener
 * 'error': un player senza .on('error', ...) fa sì che un errore di stream/ffmpeg
 * (playback fallito a metà round) butti giù l'intero processo Node invece di restare
 * confinato alla singola partita — vedi @discordjs/voice, gli EventEmitter senza
 * listener su 'error' rilanciano come eccezione non gestita.
 */
function createPlayer() {
    const player = createAudioPlayer();
    player.on('error', err => console.error('[Player Error]', err));
    player.on('stateChange', (old, newState) => {
        console.log(`[Player State] ${old.status} -> ${newState.status}`);
    });
    player.on(AudioPlayerStatus.Playing, () => console.log('Audio is playing!'));
    player.on(AudioPlayerStatus.Idle, () => console.log('Audio idle'));
    return player;
}

async function resolveTrackAudio(track) {
    console.log('Searching for:', `${track.name} ${track.artists[0].name}`);
    try {
        const audioStream = await YouTube.createAudioStreamSmart(`${track.name} ${track.artists[0].name}`);
        return {
            resource: createAudioResource(audioStream.stream, { inputType: audioStream.type }),
            currentSong: {
                title: track.name,
                artist: track.artists[0].name,
                source: audioStream.source,
            },
        };
    } catch (error) {
        console.warn('[resolveTrackAudio] Stream non disponibile, provo i file locali:', error.message);

        if (localMusic.songs.length === 0) return null;

        const randomSong = localMusic.getRandomSong();
        const resource = localMusic.createAudioResourceFromFile(randomSong.filePath);
        if (!resource) return null;

        return {
            resource,
            currentSong: { title: randomSong.name, artist: 'Local', source: 'local' },
        };
    }
}

/**
 * Avvia una nuova partita con i brani top di un artista Spotify
 * Si connette al canale vocale, recupera i brani dell'artista e inizia a riprodurre una traccia casuale
 * @async
 * @param {Object} interaction - Oggetto interaction di Discord
 * @param {string} artistName - artista (es. The Beatles)
 * @param {string} userId - ID utente Discord che ha avviato la partita
 */
async function startGame(interaction, artistName, userId) {

    // metto obbl per il momento la auth
    if (!spotify.isAuthenticated(userId)) {
        return interaction.editReply('You need to link your Spotify account first! Use `/auth`.');
    }

    // connessione a canale vocale
    const guild = interaction.guild || interaction.client.guilds.cache.get(interaction.guildId)

    // errori vari
    if (!guild) return interaction.editReply('Error: Could not access server.');

    const voiceState = guild.voiceStates.cache.get(userId);
    const channel = voiceState?.channel;

    // errori vari
    if (!channel) return interaction.editReply('You must be in a voice channel!');

    // connessione effettiva
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: guild.id,
        adapterCreator: guild.voiceAdapterCreator,
        selfDeaf: false,
        selfMute: false,
    });

    console.log('Connection state:', connection.state.status);
    connection.on('debug', msg => console.log('[Voice Debug]', msg));
    connection.on('error', err => console.error('[Voice Error]', err));
    connection.on('stateChange', (old, newState) => {
        console.log(`[Connection]: ${old.status} -> ${newState.status}`);
    });

    // devo aspettare che la connessione sia pronta, altrimenti rimane signalling
    try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30_000);
        console.log('Connection ready!');
    } catch (err) {
        console.error('Connection failed! Error:', err.message);
        console.error('Connection state:', connection.state.status);
        connection.destroy();
        return interaction.editReply('Could not connect to voice channel! Check bot permissions.');
    }

    // Da qui in poi qualsiasi eccezione (Spotify down, rate-limit, stream non
    // disponibile...) deve comunque liberare la connessione voice, altrimenti il bot
    // resta agganciato al canale senza che games abbia una entry da ripulire.
    let track, audio, tracks;
    try {
        // ottengo l'artista
        const artist = await spotify.searchArtist(userId, artistName)
        if (!artist) {
            connection.destroy();
            return interaction.editReply('Artist not found')
        }

        // ottengo le tracks
        tracks = await spotify.getArtistTopTracks(userId, artistName)
        if (!tracks) {
            connection.destroy();
            return interaction.editReply('Error: didn\'t find any track for the artist')
        }

        // scelgo una track random
        track = tracks[Math.floor(Math.random() * tracks.length)];

        audio = await resolveTrackAudio(track);
        if (!audio) {
            connection.destroy();
            return interaction.editReply('No results found!');
        }
    } catch (err) {
        console.error('[startGame] Failed before playback started:', err);
        connection.destroy();
        return interaction.editReply('Error starting game.');
    }

    // streammo la canzone
    const player = createPlayer();

    player.play(audio.resource)
    connection.subscribe(player)
    console.log('Player subscribed to connection');

    await interaction.editReply(`Round 1 - Guess the song!`);

    const guildId = interaction.guildId;

    const gameState = {
        connection,
        player,
        currentSong: audio.currentSong,
        tracks,
        userId,
        scores: {},
        playedTracks: [track],   // il round 1 va tracciato subito, altrimenti nextRound può ripescarlo
        roundNumber: 1,
    };
    games.set(guildId, gameState);

    // per passarlo alla funzione startRound
    // inizio il round
    RoundHandler.startRound(interaction, module.exports, gameState)
}


/**
 * Ferma la partita corrente, interrompe la riproduzione audio e rimuove il bot dal canale vocale
 */
function stopGame(guildId) {
    // ottengo il gameState del server
    const gameState = games.get(guildId);
    // controllo se c'è una partita in corso
    if (!gameState) return;

    // fermo l'audio
    gameState.player.stop();

    // tolgo dalla chiamata
    if (gameState.connection) gameState.connection.destroy()

    // Rimuovi la partita dalla Map
    games.delete(guildId);
}


/**
 * Avanza al prossimo round con una canzone casuale diversa dalla playlist
 * Ferma l'audio corrente e riproduce una nuova anteprima
 * @async
 * @param {Object} interaction - Oggetto interaction di Discord
 * @throws {Error} Se l'URL di anteprima non è disponibile per la canzone selezionata
 */
async function nextRound(interaction) {
    const guildId = interaction.guildId;

    // recupero lo stato del game del server
    const gameState = games.get(guildId);

    if (!gameState) return;

    if (gameState.roundNumber >= 10) {
        // prendo la classifica
        const scores = await database.getLeaderboard(guildId)

        const text = scores
            .map(([userId, points], i) => `${i + 1}. <@${userId}> — ${points} points`)
            .join('\n');

        await interaction.channel.send(`🎮 **Game Over!**\n\n🏆 **Final Leaderboard**\n${text}`);
        // fine "game"
        stopGame(guildId);
        return;
    }

    // fermo collector precedente
    RoundHandler.stopRound(guildId);
    gameState.player.stop();

    // prendo nuova random
    let track;
    // Se tutte le tracce sono state giocate, riparte dal ciclo
    // TODO: gestire meglio: magari far andare ad un altro artista o terminare il game
    if (gameState.playedTracks.length >= gameState.tracks.length) {
        gameState.playedTracks = [];
    }
    do {
        track = gameState.tracks[Math.floor(Math.random() * gameState.tracks.length)];
        // controllo non sia la stessa
    } while (gameState.playedTracks.includes(track));

    // la aggiungo a played tracks
    gameState.playedTracks.push(track)

    const audio = await resolveTrackAudio(track);
    if (!audio) return interaction.channel.send('No results found!');

    const player = createPlayer();
    player.play(audio.resource);
    gameState.connection.subscribe(player);

    // round + messaggio
    gameState.roundNumber = (gameState.roundNumber || 0) + 1;
    await interaction.channel.send(`Round ${gameState.roundNumber} - Guess the song!`)

    gameState.currentSong = audio.currentSong;
    gameState.player = player;

    // faccio ripartire il collector
    RoundHandler.startRound(interaction, module.exports, gameState)
}


/**
 * Controlla se la risposta dell'utente combacia con il nome della canzone corrente.
 * Volutamente sincrona (nessun await, nessuna scrittura su db): RoundHandler la usa
 * come lock atomico per evitare che due risposte corrette quasi simultanee vengano
 * processate entrambe (assegnazione punto e nextRound() sono responsabilità del
 * chiamante, una volta sola per round).
 * @param {string} userId - ID utente Discord (solo per i log)
 * @param {string} guess - Risposta dell'utente per il nome della canzone
 * @param {string} guildId - ID del server
 * @returns {boolean} True se la risposta è corretta, false altrimenti
 */
function isCorrectGuess(userId, guess, guildId) {
    const gameState = games.get(guildId)
    // controllo se c'è una partita in corso
    if (!gameState) return false

    // prendo il nome della canzone da indovinare
    const toGuess = gameState.currentSong.title

    // pulisco meglio - preservo spazi interni e converto a minuscole
    const clean = str => str
        .toLowerCase()
        .replace(/\(.*\)|\[.*\]/g, "") // Rimuove tutto tra parentesi tonde o quadre
        .replace(/[-–—].*/g, "")       // Rimuove tutto dopo un trattino
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[''´`]/g, "'");

    const cleanGuess = clean(guess);
    const cleanToGuess = clean(toGuess);

    console.log(`[isCorrectGuess] User: ${userId}, Guess: "${guess}" → "${cleanGuess}", Expected: "${toGuess}" → "${cleanToGuess}"`);

    // Controllo esatto ignorando punteggiatura
    if (cleanGuess === cleanToGuess) {
        console.log('[isCorrectGuess] Exact match!');
        return true;
    }

    // Controllo se è una corrispondenza principale (es: "let it be" vs "Let It Be - Remaster")
    // Estrai la parte principale del titolo (prima di qualsiasi "-" o parentesi)
    const mainTitle = cleanToGuess.split(/[-–—]/)[0].trim();

    if (cleanGuess === mainTitle) {
        console.log('[isCorrectGuess] Main title match!');
        return true;
    }

    console.log('[isCorrectGuess] No match found');
    return false;
}

/**
 * Recupera il nome della canzone corrente da indovinare
 * @returns {string|null} Il nome della canzone corrente o null se nessuna partita è attiva
 */
function getToGuess(guildId) {
    const gameState = games.get(guildId);
    return gameState ? gameState.currentSong.title : null;
}

/**
 * Recupera l'oggetto canzone attuale
 * @returns 
 */
function getCurrentSong(guildId) {
    const gameState = games.get(guildId);
    return gameState ? gameState.currentSong : null;
}


module.exports = { startGame, stopGame, nextRound, isCorrectGuess, getToGuess, getCurrentSong }