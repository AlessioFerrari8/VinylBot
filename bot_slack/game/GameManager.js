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
 * Avvia una nuova partita con una playlist Spotify
 * Si connette al canale vocale, recupera i brani dalla playlist e inizia a riprodurre un'anteprima casuale
 * @async
 * @param {Object} interaction - Oggetto interaction di Discord
 * @param {string} source - artista o genere (es. The Beatles)
 * @param {string} userId - ID utente Discord che ha avviato la partita
 * @throws {Error} Se l'URL di anteprima non è disponibile per la canzone selezionata
 */
async function startGame(interaction, artistName, userId, mode = 'spotify') {

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

    if (mode === 'local') {
        // non ci sono canzoni
        if (localMusic.songs.length === 0) {
            connection.destroy();
            return interaction.editReply('No local songs available. Add some to the music folder.');
        }
        // preparo canzone + risorsa
        const randomSong = localMusic.getRandomSong();
        const resource = localMusic.createAudioResourceFromFile(randomSong.filePath);
        if (!resource) return interaction.editReply('Error creating audio resource.');

        // player
        const player = createAudioPlayer();
        player.play(resource);
        connection.subscribe(player);

        // Salva game state
        const gameState = {
            connection,
            player,
            currentSong: {
                title: randomSong.name,
                artist: 'Local',
                source: 'local'
            },
            tracks: localMusic.songs,   // <- tutte le canzoni locali
            userId,
            scores: {},
            playedTracks: [],
            roundNumber: 1,
            mode: 'local'
        };
        games.set(interaction.guildId, gameState);
        await interaction.editReply(`Round 1 - Guess the song!`);
        RoundHandler.startRound(interaction, module.exports, gameState);
        return;
    } else {
        // ottengo l'artista 
        const artist = await spotify.searchArtist(userId, artistName)
        if (!artist) return interaction.editReply('Artist not found')

        // ottengo le tracks
        const tracks = await spotify.getArtistTopTracks(userId, artistName)
        if (!tracks) return interaction.editReply('Error: didn\'t find any track for the artist')

        // scelgo una track random
        const track = tracks[Math.floor(Math.random() * tracks.length)];

        // cerco la canzone con la funzione intelligente (prova Spotify prima di YouTube)
        console.log('Searching for:', `${track.name} ${track.artists[0].name}`);
        let audioStream;
        try {
            audioStream = await YouTube.createAudioStreamSmart(`${track.name} ${track.artists[0].name}`);
        } catch (error) {
            console.error('Failed to create audio stream:', error.message);
            return interaction.editReply('No results found!');
        }
        if (!audioStream) return interaction.editReply('No results found!');

        // streammo la canzone
        const player = createAudioPlayer()

        player.on('error', err => console.error('[Player Error]', err));
        player.on('stateChange', (old, newState) => {
            console.log(`[Player State] ${old.status} -> ${newState.status}`);
        });
        player.on(AudioPlayerStatus.Playing, () => console.log('Audio is playing!'));
        player.on(AudioPlayerStatus.Idle, () => console.log('Audio idle'));

        // creo risorsa audio con tipo corretto dallo stream
        console.log('Creating audio resource with type:', audioStream.type.toString());
        const resource = createAudioResource(audioStream.stream, {
            inputType: audioStream.type,
        });
        console.log('Resource created, playing...');

        player.play(resource)
        connection.subscribe(player)
        console.log('Player subscribed to connection');

        await interaction.editReply(`Round 1 - Guess the song!`);

        const guildId = interaction.guildId;

        const gameState = {
            connection,
            player,
            currentSong: {
                title: track.name,
                artist: track.artists[0].name,
                source: audioStream.source,
            },
            tracks,
            userId,
            scores: {},
            playedTracks: [],
            roundNumber: 1,
            mode: 'spotify'
        };
        games.set(guildId, gameState);

        // per passarlo alla funzione startRound
        // inizio il round
        RoundHandler.startRound(interaction, module.exports, gameState)
    }
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
        const scores = await database.getLeaderboard()

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

    if (gameState.mode === 'local') {
        // stessa cosa di startGame
        const resource = localMusic.createAudioResourceFromFile(track.filePath);
        if (!resource) {
            console.error('[nextRound] Error while creating resource for song');
            return interaction.channel.send('Error loading next song.');
        }
        const player = createAudioPlayer();
        player.play(resource);
        gameState.connection.subscribe(player);
        gameState.player = player;
        gameState.currentSong = {
            title: track.name,
            artist: 'Local',
            source: 'local'
        };
        gameState.roundNumber++;
        await interaction.channel.send(`Round ${gameState.roundNumber} - Guess the song!`);
        RoundHandler.startRound(interaction, module.exports, gameState);
        return;
    } else {
        // MODALITÀ SPOTIFY
        // cerco la canzone con la funzione intelligente (prova Spotify prima di YouTube)
        console.log('Searching for:', `${track.name} ${track.artists[0].name}`);
        let audioData;
        try {
            audioData = await YouTube.createAudioStreamSmart(`${track.name} ${track.artists[0].name}`);
        } catch (error) {
            console.error('Failed to create audio stream:', error.message);
            return interaction.channel.send('No results found!');
        }
        if (!audioData) return interaction.channel.send('Impossible creating audio stream');
        const player = createAudioPlayer();
        const resource = createAudioResource(audioData.stream, {
            inputType: audioData.type
        });

        player.play(resource);
        gameState.connection.subscribe(player);

        // round + messaggio
        gameState.roundNumber = (gameState.roundNumber || 0) + 1;
        await interaction.channel.send(`Round ${gameState.roundNumber} - Guess the song!`)

        gameState.currentSong = {
            title: track.name,
            artist: track.artists[0].name,
            source: audioData.source,
        };

        gameState.player = player;

        // faccio ripartire il collector
        RoundHandler.startRound(interaction, module.exports, gameState)
    }
}


/**
 * Controlla se la risposta dell'utente combacia con il nome della canzone corrente
 * Se corretta, assegna un punto all'utente; altrimenti restituisce false
 * @param {string} userId - ID utente Discord
 * @param {string} guess - Risposta dell'utente per il nome della canzone
 * @returns {boolean} True se la risposta è corretta, false altrimenti
 */
async function checkGuess(userId, guess, guildId) {
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

    console.log(`[checkGuess] User: ${userId}, Guess: "${guess}" → "${cleanGuess}", Expected: "${toGuess}" → "${cleanToGuess}"`);

    // Controllo esatto ignorando punteggiatura
    if (cleanGuess === cleanToGuess) {
        console.log('[checkGuess] Exact match!');
        await database.addPoint(userId);
        return true;
    }

    // Controllo se è una corrispondenza principale (es: "let it be" vs "Let It Be - Remaster")
    // Estrai la parte principale del titolo (prima di qualsiasi "-" o parentesi)
    const mainTitle = cleanToGuess.split(/[-–—]/)[0].trim();

    if (cleanGuess === mainTitle) {
        console.log('[checkGuess] Main title match!');
        await database.addPoint(userId);
        return true;
    }

    console.log('[checkGuess] No match found');
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


module.exports = { startGame, stopGame, nextRound, checkGuess, getToGuess, getCurrentSong }