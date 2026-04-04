const { execSync, spawn } = require('child_process');
const ytsr = require('@distube/ytsr');
const ffmpegPath = require('ffmpeg-static');



async function searchSong(query) {
    try {
        // faccio una ricerca su yt
        console.log('Searching for:', query);
        
        const result = await ytsr(query, { limit: 1 });
        console.log('Search result:', result);

        // prendo il primo risultato
        const firstVideo = result.items[0];    

        if (!firstVideo) {
            console.log('No videos found in result');
            return null; 
        }

        console.log('Found video:', firstVideo.name);
        return firstVideo;
    } catch (error) {
        console.error('YouTube search error:', error);
        return null;
    }
}

function createAudioStream(youtubeUrl) {
    // scarico la canzone
    const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio',
        '--no-playlist',
        '-o', '-',          // output su stdout invece che su file
        youtubeUrl
    ]);

    // uso ffmpeg preso da npm perché sul mio sistema non va (solite dipendenze :()
    const ffmpeg = spawn(ffmpegPath, [
        '-i', 'pipe:0',
        '-t', '20',
        '-f', 's16le', // format for reproducing yt videos
        '-ar', '48000',
        '-ac', '2',
        'pipe:1'
    ]);


    // eventuali errori
    ytdlp.on('error', (err) => console.error('yt-dlp error:', err));
    ffmpeg.on('error', (err) => console.error('ffmpeg error:', err));

    ytdlp.stdout.pipe(ffmpeg.stdin);
    // gestioen altri errori
    ffmpeg.stdin.on('error', () => {}); 
    ytdlp.stderr.on('data', () => {});  

    return ffmpeg.stdout;
}

module.exports = { searchSong, createAudioStream }