/**
 * Modulo GameManager - Gestisce il flusso principale del gioco di indovinelli
 * Caratteristiche: connessione al canale vocale, stream audio, gestione round, tracciamento punteggi
 */

const { joinVoiceChannel, getVoiceConnections, AudioPlayer } = require('@discordjs/voice');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const database = require('../db/database');
const YouTube = require('./YouTubeSearch');

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
async function startGame(interaction, query, userId) {
    // canale
    let guild = interaction.guild;
    if (!guild) guild = await interaction.client.guilds.fetch(interaction.guildId);
    const voiceState = guild.voiceStates.cache.get(userId);
    const channel = voiceState?.channel;
    // se non è in un canale
    if (!channel) return interaction.editReply('You must be in a voice channel!');
    // connessione
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });

    // cerco
    const song = await YouTube.searchSong(query)
    if (!song) return interaction.editReply('No results found!');

    // creo lo stream audio
    const stream = YouTube.createAudioStream(song.url)

    // streammo la canzone
    const player = createAudioPlayer()
    const resource = createAudioResource(stream)

    player.play(resource)
    connection.subscribe(player)

    await interaction.editReply(`Guess the song!`);

    gameState = {
        connection,
        player,
        currentSong: {
            title: song.title,
            artist: song.author.name,
            url: song.url,
        },
        query,
        scores: {},
    };
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
    // controllo se c'è una partita in corso
    if (!gameState) return;
    // fermo il player
    gameState.player.stop()

    // cerco
    const song = await YouTube.searchSong(gameState.query);
    if (!song) return interaction.editReply('No results found!');

    // creo lo stream audio
    const stream = YouTube.createAudioStream(song.url)

    // streammo la canzone
    const player = createAudioPlayer()
    const resource = createAudioResource(stream)

    player.play(resource)
    gameState.connection.subscribe(player)

    await interaction.channel.send('Guess the song!');

    // aggiorno le variabili
    gameState.currentSong = {
        title: song.title,
        artist: song.author.name,
        url: song.url,
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


module.exports = { startGame, stopGame, nextRound, checkGuess, getToGuess }