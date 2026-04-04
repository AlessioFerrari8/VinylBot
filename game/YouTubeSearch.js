const { execSync, spawn } = require('child_process');
const ytsr = require('@distube/ytsr');
const ffmpegPath = require('ffmpeg-static');



async function searchSong(query) {
    try {
        const playdl = require('play-dl')
        // faccio una ricerca su yt
        console.log('Searching for:', query);
        const results = await playdl.search(query, { limit: 1 });

        if (!results.length) return null;
        console.log('Found video:', results[0].title);

        // per vedere come è fatto l'oggetto
        console.log('Song object:', JSON.stringify(results[0], null, 2));
        // solo il primo
        return results[0];
    } catch (error) {
        console.error('YouTube search error:', error);
        return null;
    }
}

async function createAudioStream(youtubeUrl) {
    const { StreamType } = require('@discordjs/voice');
    
    console.log('\n[Audio Stream] Starting download from:', youtubeUrl);
    
    // scarico la canzone
    const ytdlp = spawn('yt-dlp', [
        '-f', 'bestaudio',
        '--no-playlist',
        '-o', '-',
        youtubeUrl
    ], { stdio: ['ignore', 'pipe', 'pipe'] });

    // taglio con ffmpeg
    const ffmpeg = spawn(ffmpegPath, [
        '-i', 'pipe:0',
        '-t', '30',
        '-c:a', 'libopus',
        '-f', 'ogg',
        '-ar', '48000',
        '-ac', '2',
        '-b:a', '128k',
        'pipe:1'
    ], { stdio: ['pipe', 'pipe', 'pipe'] });

    // Gestisci errori di yt-dlp
    ytdlp.on('error', (err) => {
        console.error('[yt-dlp Error]', err.message);
    });
    
    ytdlp.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
            console.warn(`[yt-dlp] Process exited with code ${code}, signal: ${signal}`);
        }
    });

    // Cattura stderr di yt-dlp
    let ytdlpErr = '';
    ytdlp.stderr.on('data', (data) => {
        ytdlpErr += data.toString();
        console.warn('[yt-dlp stderr]', data.toString().slice(0, 100));
    });

    // Gestisci errori di ffmpeg
    ffmpeg.on('error', (err) => {
        console.error('[ffmpeg Error]', err.message);
    });

    ffmpeg.on('exit', (code, signal) => {
        if (code !== 0 && code !== null) {
            console.warn(`[ffmpeg] Process exited with code ${code}, signal: ${signal}`);
        }
    });

    // Cattura stderr di ffmpeg
    let ffmpegErr = '';
    ffmpeg.stderr.on('data', (data) => {
        ffmpegErr += data.toString();
        console.warn('[ffmpeg stderr]', data.toString().slice(0, 100));
    });

    // Pipe output
    console.log('[Audio Stream] Piping yt-dlp output to ffmpeg...');
    ytdlp.stdout.pipe(ffmpeg.stdin);

    // gestisco errori vari
    ytdlp.stdout.on('error', () => {});  
    ytdlp.stdin?.on('error', () => {});  
    ffmpeg.stdin.on('error', () => {});
    
    ffmpeg.stdout.on('data', (chunk) => {
        console.log(`[ffmpeg stdout] Chunk received: ${chunk.length} bytes`);
    });

    return { stream: ffmpeg.stdout, type: StreamType.OggOpus };

}

module.exports = { searchSong, createAudioStream }