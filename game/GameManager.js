/**
 * Modulo GameManager - Gestisce il flusso principale del gioco di indovinelli
 * Caratteristiche: connessione al canale vocale, stream audio, gestione round, tracciamento punteggi
 */

const { joinVoiceChannel, getVoiceConnections, AudioPlayer } = require('@discordjs/voice');
const spotify = require('../spotify/client');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const database = require('../db/database');

/** @type {Object|null} Stato attuale del gioco incluso connessione, player, canzoni e punteggi */
let gameState = null;

/**
 * Avvia una nuova partita con una playlist Spotify
 * Si connette al canale vocale, recupera i brani dalla playlist e inizia a riprodurre un'anteprima casuale
 * @async
 * @param {Object} interaction - Oggetto interaction di Discord
 * @param {string} source - ID o URI della playlist Spotify
 * @param {string} userId - ID utente Discord che ha avviato la partita
 * @throws {Error} Se l'URL di anteprima non è disponibile per la canzone selezionata
 */
async function startGame(interaction, source, userId) {

    // prendo canale vocale
    const channel = interaction.member.voice.channel;
    if (!channel) return interaction.reply('Devi essere in un canale vocale!');

    // entro nel canale
    const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator,
    });

    // prendo le canzoni dalla playlist spotify
    const api = await spotify.apiForUser(userId);
    const data = await api.getPlaylistTracks(source);
    const songs = data.body.items.map(item => item.track);

    // canzone da indovinare
    const toGuess = songs[Math.floor(Math.random() * songs.length)];


    // TODO: migliorare se non c'è
    // controllo se esiste la preview (NON È DETTO)
    if (!toGuess.preview_url) return interaction.reply('The song isn\'t available, please try another one!');
    
    // streamma la preview
    const player = createAudioPlayer();
    const resource = createAudioResource(toGuess.preview_url);
    
    player.play(resource);
    connection.subscribe(player);
    
    await interaction.reply(`Guess the song!`);
    
    // salvo la partita
    gameState = {
        connection,
        player,
        toGuess,
        songs,
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

    // nuova random
    const toGuess = gameState.songs[Math.floor(Math.random() * gameState.songs.length)];
    // controllo ci sia la preview
    if (!toGuess.preview_url) return interaction.reply('The song isn\'t available, please try another one!');
    // nuovo player e streammo la preview
    const player = createAudioPlayer();
    const resource = createAudioResource(toGuess.preview_url);
    
    // stesso procedimento come in startGame()
    player.play(resource);
    gameState.connection.subscribe(player);
    
    await interaction.reply(`Guess the song!`);

    // aggiorno le variabili
    gameState.toGuess = toGuess;
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
    const toGuess = gameState.toGuess.name
    
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
    return gameState ? gameState.toGuess.name : null;
}


module.exports = { startGame, stopGame, nextRound, checkGuess, getToGuess }