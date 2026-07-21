/**
 * Modulo YouTubeSearch - Trova e scarica un estratto audio (mp3) di una canzone.
 * A differenza della versione Discord non serve uno stream live: qui il file mp3
 * finito viene caricato come allegato nel canale Slack, quindi ogni funzione
 * scarica/converte e ritorna un percorso file pronto per l'upload.
 */

const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const os = require('os');
const https = require('https');
const crypto = require('crypto');

const CLIP_SECONDS = 15;

function tmpMp3Path() {
    return path.join(os.tmpdir(), `vinylbot-${crypto.randomBytes(6).toString('hex')}.mp3`);
}

/**
 * Scarica un URL audio e lo taglia/converte in mp3 con ffmpeg, scrivendolo su file.
 * @param {string} audioUrl
 * @param {number} durationSecs
 * @returns {Promise<string>} percorso del file mp3 generato
 */
function downloadToMp3(audioUrl, durationSecs = CLIP_SECONDS) {
    return new Promise((resolve, reject) => {
        const httpModule = audioUrl.startsWith('https') ? https : require('http');
        const outPath = tmpMp3Path();

        httpModule.get(audioUrl, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} from audio URL`));
                return;
            }

            const ffmpeg = spawn(ffmpegPath, [
                '-i', 'pipe:0',
                '-t', String(durationSecs),
                '-vn',
                '-c:a', 'libmp3lame',
                '-b:a', '128k',
                '-y', outPath,
            ], { stdio: ['pipe', 'ignore', 'pipe'] });

            let errorOccurred = false;

            ffmpeg.on('error', (err) => {
                errorOccurred = true;
                reject(new Error(`[ffmpeg] ${err.message}`));
            });

            ffmpeg.on('exit', (code) => {
                if (errorOccurred) return;
                if (code !== 0 && code !== null) {
                    reject(new Error(`ffmpeg exit code ${code}`));
                    return;
                }
                resolve(outPath);
            });

            response.pipe(ffmpeg.stdin);
            response.on('error', (err) => { errorOccurred = true; reject(err); });
            ffmpeg.stdin.on('error', () => { });
        }).on('error', (err) => {
            reject(new Error(`[Audio Download] ${err.message}`));
        });
    });
}

/**
 * Scarica l'audio di un video YouTube via yt-dlp e lo converte in mp3.
 * @param {string} youtubeUrl
 * @returns {Promise<string>} percorso del file mp3 generato
 */
function downloadYtdlpToMp3(youtubeUrl) {
    const cookiePath = path.resolve(process.cwd(), 'cookies.txt');
    const outPath = tmpMp3Path();

    return new Promise((resolve, reject) => {
        const ytdlpArgs = [
            '--extractor-args', 'youtube:player_client=web_embedded',
            '--extractor-args', 'youtube:skip=hls',
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '--referer', 'https://www.youtube.com/',
            '--socket-timeout', '30',
            '--retries', '5',
            '--fragment-retries', '5',
            ...(fs.existsSync(cookiePath) ? ['--cookies', cookiePath] : []),
            '-f', 'bestaudio/best',
            '--no-playlist',
            '-o', '-',
            youtubeUrl,
        ];

        const ytdlp = spawn('yt-dlp', ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
        const ffmpeg = spawn(ffmpegPath, [
            '-i', 'pipe:0',
            '-t', String(CLIP_SECONDS),
            '-vn',
            '-c:a', 'libmp3lame',
            '-b:a', '128k',
            '-y', outPath,
        ], { stdio: ['pipe', 'ignore', 'pipe'] });

        let errorOccurred = false;
        const fail = (err) => {
            if (errorOccurred) return;
            errorOccurred = true;
            ytdlp.kill('SIGKILL');
            ffmpeg.kill('SIGKILL');
            reject(err);
        };

        ytdlp.on('error', (err) => fail(new Error(`[yt-dlp] ${err.message}`)));
        ytdlp.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('bot') || msg.toLowerCase().includes('sign in')) {
                fail(new Error('YouTube bot detection'));
            }
        });

        ffmpeg.on('error', (err) => fail(new Error(`[ffmpeg] ${err.message}`)));
        ffmpeg.on('exit', (code) => {
            if (errorOccurred) return;
            if (code !== 0 && code !== null) {
                fail(new Error(`ffmpeg exit code ${code}`));
                return;
            }
            resolve(outPath);
        });

        ytdlp.stdout.pipe(ffmpeg.stdin);
        ytdlp.stdout.on('error', () => { });
        ffmpeg.stdin.on('error', () => { });
    });
}

async function searchSong(query) {
    try {
        const playdl = require('play-dl');
        const results = await playdl.search(query, { limit: 1 });
        if (!results.length) return null;
        return results[0];
    } catch (error) {
        console.error('[YouTube] search error:', error.message);
        return null;
    }
}

async function searchSpotifyTrack(query) {
    try {
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
                ).toString('base64'),
            },
            body: 'grant_type=client_credentials',
        });
        if (!tokenResponse.ok) throw new Error(`Spotify token error: ${tokenResponse.status}`);
        const { access_token } = await tokenResponse.json();

        const searchResponse = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
            { headers: { Authorization: `Bearer ${access_token}` } }
        );
        if (!searchResponse.ok) throw new Error(`Spotify search error: ${searchResponse.status}`);
        const { tracks } = await searchResponse.json();
        const track = tracks?.items?.[0];
        if (!track || !track.preview_url) return null;

        return {
            name: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            preview_url: track.preview_url,
        };
    } catch (error) {
        console.error('[Spotify] search error:', error.message);
        return null;
    }
}

/**
 * Trova un estratto audio pronto (mp3, ~15s) per la query data.
 * Prova sempre Spotify preview per primo (nessun bot detection, funziona ovunque).
 * Su DEPLOY_ENV=vps si ferma qui e lancia NO_LOCAL_STREAM (YouTube è bloccato dai
 * datacenter) cosi il chiamante ripiega sui file locali; altrimenti prova anche YouTube.
 * @param {string} query
 * @returns {Promise<{filePath: string, source: string}>}
 */
async function createAudioClipSmart(query) {
    const isVps = process.env.DEPLOY_ENV === 'vps';

    console.log('[Audio Clip Smart] Cerco:', query);

    try {
        const spotifyTrack = await searchSpotifyTrack(query);
        if (spotifyTrack) {
            const filePath = await downloadToMp3(spotifyTrack.preview_url);
            return { filePath, source: 'spotify' };
        }
    } catch (err) {
        console.warn('[Audio Clip Smart] Spotify failed:', err.message);
    }

    if (isVps) throw new Error('NO_LOCAL_STREAM');

    try {
        const video = await searchSong(query);
        if (video && video.url) {
            const filePath = await downloadYtdlpToMp3(video.url);
            return { filePath, source: 'youtube' };
        }
    } catch (err) {
        console.warn('[Audio Clip Smart] YouTube failed:', err.message);
    }

    throw new Error('Impossibile trovare la canzone su nessuna piattaforma');
}

module.exports = { createAudioClipSmart };
