/**
 * Modulo LocalMusicManager - Gestisce le canzoni hostate localmente sul VPS
 * Funzionalità: scansione directory, selezione casuale, creazione stream audio
 */

const fs = require('fs');
const path = require('path');
const { createAudioResource } = require('@discordjs/voice');

class LocalMusicManager {
    constructor(musicDirectoryPath) {
        this.musicDirectory = musicDirectoryPath;
        this.songs = [];
    }

    // Scansiona la cartella e carica l'elenco delle canzoni
    loadSongs() {
        if (!fs.existsSync(this.musicDirectory)) {
            fs.mkdirSync(this.musicDirectory, { recursive: true });
            console.log(`[LocalMusic] Creata cartella: ${this.musicDirectory}`);
            return [];
        }
        const files = fs.readdirSync(this.musicDirectory);
        const audioExtensions = ['.mp3', '.ogg', '.wav', '.flac'];
        this.songs = files
            .filter(file => audioExtensions.includes(path.extname(file).toLowerCase()))
            .map(file => ({
                name: path.basename(file, path.extname(file)), // titolo della canzone
                filePath: path.join(this.musicDirectory, file)
            }));
        console.log(`[LocalMusic] Caricate ${this.songs.length} canzoni da ${this.musicDirectory}`);
        return this.songs;
    }

    // Restituisce una canzone casuale
    getRandomSong() {
        if (this.songs.length === 0) return null;
        const index = Math.floor(Math.random() * this.songs.length);
        return this.songs[index];
    }

    // Crea una risorsa audio pronta per Discord a partire dal file
    createAudioResourceFromFile(filePath) {
        try {
            // createAudioResource accetta direttamente il percorso del file
            // Discord.js ottimizzerà automaticamente il formato
            return createAudioResource(filePath);
        } catch (error) {
            console.error('[LocalMusic] Errore creazione risorsa audio:', error);
            return null;
        }
    }
}

module.exports = LocalMusicManager;