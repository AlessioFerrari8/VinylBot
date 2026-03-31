// startGame(interaction, source) — avvia la partita (source = artista o playlist)
// stopGame() — ferma la partita
// nextRound() — passa al round successivo
// checkGuess(userId, guess) — controlla se la risposta è giusta


const { joinVoiceChannel, getVoiceConnections, AudioPlayer } = require('@discordjs/voice');
const spotify = require('../spotify/client');
const { createAudioPlayer, createAudioResource, AudioPlayerStatus } = require('@discordjs/voice');
const database = require('../db/database');

// partita
let gameState = null;


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
 * Controllare se c'è una partita in corso
Prendere il nome della canzone da indovinare da gameState.toGuess
Confrontare guess con il nome della canzone (ignorando maiuscole/minuscole)
Se è giusto → aggiungere un punto all'utente con database.addPoint(userId) e restituire true
Se è sbagliato → restituire false
 * @param {*} userId 
 * @param {*} guess 
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


module.exports = { startGame, stopGame, nextRound, checkGuess }