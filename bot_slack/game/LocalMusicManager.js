/**
 * Modulo LocalMusicManager - Gestisce le canzoni hostate localmente sul VPS.
 * Fallback quando né Spotify preview né YouTube trovano un estratto: i file
 * vengono caricati su Slack così come sono (nessuna riconversione necessaria).
 */

const fs = require('fs');
const path = require('path');

class LocalMusicManager {
    constructor(musicDirectoryPath) {
        this.musicDirectory = musicDirectoryPath;
        this.songs = [];
    }

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
                name: path.basename(file, path.extname(file)),
                filePath: path.join(this.musicDirectory, file),
            }));
        console.log(`[LocalMusic] Caricate ${this.songs.length} canzoni da ${this.musicDirectory}`);
        return this.songs;
    }

    getRandomSong() {
        if (this.songs.length === 0) return null;
        const index = Math.floor(Math.random() * this.songs.length);
        return this.songs[index];
    }
}

module.exports = LocalMusicManager;
