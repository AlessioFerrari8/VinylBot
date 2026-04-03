const { execSync, spawn } = require('child_process');
const search = require('yt-search');


async function searchSong(query) {
    // faccio una ricerca su yt
    const result = await search(query);
    // prendo il primo risultato
    const firstVideo = result[0];    

    if (!firstVideo) return null; 
    // prendo l'url
    const url = firstVideo.url;  

    return createAudioStream(url);
}

function createAudioStream(youtubeUrl) {
    // scarico la canzone
    const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio',
        '--no-playlist',
        '-o', '-',          // output su stdout invece che su file
        youtubeUrl
    ]);

    // prendo solo quello che mi serve con ffmpeg
    const ffmpeg = spawn('ffmpeg', [
        '-i', 'pipe:0',     // stdin
        '-t', '20',         // 20 secondi
        '-f', 'opus',       // audio per Discord
        '-ar', '48000',     // sample rate Discord
        '-ac', '2',         // stereo
        'pipe:1'            // stdout
    ]);

    // eventuali errori
    ytdlp.on('error', (err) => console.error('yt-dlp error:', err));
    ffmpeg.on('error', (err) => console.error('ffmpeg error:', err));

    ytdlp.stdout.pipe(ffmpeg.stdin);
    return ffmpeg.stdout;
}

module.exports = { searchSong, createAudioStream }