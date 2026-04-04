/**
 * Modulo GameManager - Gestisce il flusso principale del gioco di indovinelli
 * Caratteristiche: connessione al canale vocale, stream audio, gestione round, tracciamento punteggi
 */

const { joinVoiceChannel, getVoiceConnections, AudioPlayer, StreamType, entersState, VoiceConnectionStatus } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const database = require('../db/database');
const YouTube = require('./YouTubeSearch');
const RoundHandler = require('./RoundHandler');
const spotify = require('../spotify/client')


/** @type {Object|null} Stato attuale del gioco incluso connessione, player, canzoni e punteggi */
let gameState = null;

/**
 * Avvia una nuova partita con una playlist Spotify
 * Si connette al canale vocale, recupera i brani dalla playlist e inizia a riprodurre un'anteprima casuale
 * @async
 * @param {Object} interaction - Oggetto interaction di Discord
 * @param {string} source - artista o genere (es. The Beatles)
 * @param {string} userId - ID utente Discord che ha avviato la partita
 * @throws {Error} Se l'URL di anteprima non è disponibile per la canzone selezionata
 */
async function startGame(interaction, artistName, userId) {
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
        console.log(`Connection: ${old.status} -> ${newState.status}`);
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

    // ottengo l'artista 
    const artist = await spotify.searchArtist(userId, artistName)
    if (!artist) return interaction.editReply('Artist not found')
	
    // ottengo le tracks
    const tracks = await spotify.getArtistTopTracks(userId, artist.id)
    if (!tracks) return interaction.editReply('Error: didn\'t find any track for the artist')

    // scelgo una track random
    const track = tracks[Math.floor(Math.random() * tracks.length)];

    // cerco
    console.log('Artist:', artistName);
    const song = await YouTube.searchSong(`${track.name} ${track.artists[0].name}`);
    if (!song || !song.url) return interaction.editReply('No results found!');

    // creo lo stream audio
    const audioStream = await YouTube.createAudioStream(song.url);

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
        inputType: StreamType.OggOpus,
    });
    console.log('Resource created, playing...');

    player.play(resource)
    connection.subscribe(player)
    console.log('Player subscribed to connection');

    await interaction.editReply(`Guess the song!`);

    gameState = {
        connection,
        player,
        currentSong: {
            title: track.name,
            artist: track.artists[0].name,
            youtubeUrl: song.url,
        },
        tracks,
        userId,
        scores: {},
    };

    // inizio il round
    RoundHandler.startRound(interaction, module.exports)
}


/**
 * Ferma la partita corrente, interrompe la riproduzione audio e rimuove il bot dal canale vocale
 */
function stopGame() {
    // controllo se c'è una partita in corso
    if (!gameState) return;
    // fermo l'audio
    gameState.player.stop();
    // tolgo dalla chiamata
    gameState.connection.destroy();
    // nessuna partita
    gameState = null;
}


/**
 * Avanza al prossimo round con una canzone casuale diversa dalla playlist
 * Ferma l'audio corrente e riproduce una nuova anteprima
 * @async
 * @param {Object} interaction - Oggetto interaction di Discord
 * @throws {Error} Se l'URL di anteprima non è disponibile per la canzone selezionata
 */
async function nextRound(interaction) {
    if (!gameState) return;
    gameState.player.stop();

    // prendo nuova random
    const track = gameState.tracks[Math.floor(Math.random() * gameState.tracks.length)];

    // cerco la canzone
    const song = await YouTube.searchSong(`${track.name} ${track.artists[0].name}`);
    if (!song) return interaction.channel.send('No results found!');

    // creo stream e avvio riproduione
    console.log('Song URL:', song.url);
    const audioStream = await YouTube.createAudioStream(song.url);
    const player = createAudioPlayer();
    const resource = createAudioResource(audioStream.stream, {
        inputType: audioStream.type,
    });

    player.play(resource);
    gameState.connection.subscribe(player);

    await interaction.channel.send('Guess the song!');

    gameState.currentSong = {
        title: track.name,           
        artist: track.artists[0].name, 
        youtubeUrl: song.url,
    };

    gameState.player = player;
}


/**
 * Controlla se la risposta dell'utente combacia con il nome della canzone corrente
 * Se corretta, assegna un punto all'utente; altrimenti restituisce false
 * @param {string} userId - ID utente Discord
 * @param {string} guess - Risposta dell'utente per il nome della canzone
 * @returns {boolean} True se la risposta è corretta, false altrimenti
 */
function checkGuess(userId, guess) {
    // controllo se c'è una partita in corso
    if (!gameState) return;

    // prendo il nome della canzone da indovinare
    const toGuess = gameState.currentSong.title

    // confronto
    if (guess.toLowerCase() === toGuess.toLowerCase()) { // TODO: maiuscole e minuscole
        database.addPoint(userId)
        return true
    } else {
        return false
    }
}

/**
 * Recupera il nome della canzone corrente da indovinare
 * @returns {string|null} Il nome della canzone corrente o null se nessuna partita è attiva
 */
function getToGuess() {
    return gameState ? gameState.currentSong.title : null;
}

/**
 * Recupera l'oggetto canzone attuale
 * @returns 
 */
function getCurrentSong() {
    return gameState ? gameState.currentSong : null;
}


module.exports = { startGame, stopGame, nextRound, checkGuess, getToGuess, getCurrentSong }