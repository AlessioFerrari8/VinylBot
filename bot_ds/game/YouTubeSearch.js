const { execSync, spawn } = require('child_process');
const ytsr = require('@distube/ytsr');
const ffmpegPath = require('ffmpeg-static');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { PassThrough } = require('stream');
const SpotifyWebApi = require('spotify-web-api-node');




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

async function searchSpotifyTrack(query) {
    try {
        console.log('[Spotify] Searching for:', query);
        
        // Ottieni token di accesso usando Client Credentials Flow
        const tokenResponse = await fetch('https://accounts.spotify.com/api/token', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': 'Basic ' + Buffer.from(
                    `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
                ).toString('base64')
            },
            body: 'grant_type=client_credentials'
        });

        if (!tokenResponse.ok) {
            throw new Error(`Spotify token error: ${tokenResponse.status}`);
        }

        const tokenData = await tokenResponse.json();
        const accessToken = tokenData.access_token;

        // Cerca la canzone su Spotify
        const searchResponse = await fetch(
            `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track&limit=1`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        if (!searchResponse.ok) {
            throw new Error(`Spotify search error: ${searchResponse.status}`);
        }

        const searchData = await searchResponse.json();
        const tracks = searchData.tracks?.items;

        if (!tracks || !tracks.length) {
            console.warn('[Spotify] No results found');
            return null;
        }

        const track = tracks[0];
        
        if (!track.preview_url) {
            console.warn('[Spotify] Track found but no preview available:', track.name);
            return null;
        }

        console.log('[Spotify] ✅ Found track with preview:', track.name, 'by', track.artists[0].name);
        
        return {
            name: track.name,
            artist: track.artists.map(a => a.name).join(', '),
            album: track.album.name,
            image: track.album.images[0]?.url,
            preview_url: track.preview_url,
            duration: track.duration_ms
        };
    } catch (error) {
        console.error('[Spotify] Search error:', error.message);
        return null;
    }
}

async function createAudioStream(youtubeUrl) {
    const { StreamType } = require('@discordjs/voice');
    
    // Primo tentativo: play-dl (più veloce)
    try {
        const playdl = require('play-dl');
        
        console.log('\n[Audio Stream] Creating stream from:', youtubeUrl);
        console.log('[Audio Stream] Tentativo 1: play-dl...');
        
        const stream = await playdl.stream(youtubeUrl, {
            discordPlayerCompatibility: true
        });
        
        console.log('[Audio Stream] ✅ Stream creato con play-dl');
        
        return {
            stream: stream.stream,
            type: StreamType.WebmOpus
        };
    } catch (error) {
        console.warn('[Audio Stream] ⚠️  play-dl fallito:', error.message);
        console.log('[Audio Stream] Tentativo 2: yt-dlp con cookies...');
        
        // Fallback: yt-dlp (bypass migliore con cookies)
        try {
            return await createAudioStreamYtdlp(youtubeUrl);
        } catch (ytdlpError) {
            console.error('[Audio Stream Error] Entrambi i metodi falliti');
            throw new Error(`Impossibile creare stream audio: ${error.message} | Fallback fallito: ${ytdlpError.message}`);
        }
    }
}

async function createAudioStreamFromURL(audioUrl, durationSecs = 20) {
    const { StreamType } = require('@discordjs/voice');

    console.log('[Audio Stream] Creating stream from URL:', audioUrl.slice(0, 60) + '...');

    return new Promise((resolve, reject) => {
        const httpModule = audioUrl.startsWith('https') ? https : require('http');
        
        httpModule.get(audioUrl, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`HTTP ${response.statusCode} from audio URL`));
                return;
            }

            console.log('[Audio Stream] Downloaded audio, processing with ffmpeg...');

            // Convert to Opus using ffmpeg
            const ffmpeg = spawn(ffmpegPath, [
                '-i', 'pipe:0',
                '-t', String(durationSecs),
                '-c:a', 'libopus',
                '-f', 'ogg',
                '-ar', '48000',
                '-ac', '2',
                '-b:a', '128k',
                'pipe:1'
            ], { stdio: ['pipe', 'pipe', 'pipe'] });

            let errorOccurred = false;

            ffmpeg.on('error', (err) => {
                errorOccurred = true;
                reject(new Error(`[ffmpeg] ${err.message}`));
            });

            ffmpeg.on('exit', (code) => {
                if (code !== 0 && code !== null && !errorOccurred) {
                    console.error(`[ffmpeg] Process exited with code ${code}`);
                    errorOccurred = true;
                    reject(new Error(`ffmpeg exit code ${code}`));
                }
            });

            response.pipe(ffmpeg.stdin);

            response.on('error', (err) => {
                errorOccurred = true;
                reject(err);
            });

            ffmpeg.stdin.on('error', () => { });

            // Timeout detection
            let dataReceived = false;
            ffmpeg.stdout.once('data', () => {
                dataReceived = true;
                clearTimeout(dataTimeout);
            });

            const dataTimeout = setTimeout(() => {
                if (!dataReceived && !errorOccurred) {
                    errorOccurred = true;
                    console.error('[Audio Stream] Timeout: no data from ffmpeg in 3 seconds');
                    reject(new Error('Audio stream timeout - no data received'));
                }
            }, 3000);

            resolve({
                stream: ffmpeg.stdout,
                type: StreamType.OggOpus
            });
        }).on('error', (err) => {
            reject(new Error(`[Audio Download] ${err.message}`));
        });
    });
}

async function createAudioStreamFromSpotifyPreview(previewUrl, durationSecs = 20) {
    // Wrapper per compatibilità - usa createAudioStreamFromURL
    return createAudioStreamFromURL(previewUrl, durationSecs);
}

// BACKUP - Versione yt-dlp + ffmpeg (fallback quando play-dl fallisce)
async function createAudioStreamYtdlp(youtubeUrl) {
    const { StreamType } = require('@discordjs/voice');

    console.log('\n[Audio Stream] Starting yt-dlp download from:', youtubeUrl);

    // uso process.cwd cosi funziona sia in locale che in deploy
    const cookiePath = path.resolve(process.cwd(), 'cookies.txt');
    if (fs.existsSync(cookiePath)) {
        console.log('[Sistema] File cookies.txt trovato con successo.');
    } else {
        console.warn('[Avviso] cookies.txt NON trovato, continuiamo lo stesso:', cookiePath);
    }

    return new Promise((resolve, reject) => {
        // scarico la canzone con opzioni anti-bot più aggressive
        const ytdlpArgs = [
            // Prova multiple client in sequenza per bypass bot detection
            '--extractor-args', 'youtube:player_client=web_embedded',
            '--extractor-args', 'youtube:skip=hls',
            // Headers e user-agent spoofing
            '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            '--referer', 'https://www.youtube.com/',
            // Timeout e retry settings
            '--socket-timeout', '30',
            '--retries', '5',
            '--fragment-retries', '5',
            // Cookies per autenticazione
            ...(fs.existsSync(cookiePath) ? ['--cookies', cookiePath] : []),
            // Audio format
            '-f', 'bestaudio/best',
            '--no-playlist',
            '--audio-format', 'opus',
            '--audio-quality', '192',
            // Output
            '-o', '-',
            youtubeUrl
        ];

        const ytdlp = spawn('yt-dlp', ytdlpArgs, { stdio: ['ignore', 'pipe', 'pipe'] });

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

        let errorOccurred = false;
        let isBotDetection = false;

        // Gestisci errori di yt-dlp
        ytdlp.on('error', (err) => {
            errorOccurred = true;
            reject(new Error(`[yt-dlp] ${err.message}`));
        });

        ytdlp.on('exit', (code, signal) => {
            if (code !== 0 && code !== null) {
                console.error(`[yt-dlp] Process exited with code ${code}`);
                if (!errorOccurred) {
                    errorOccurred = true;
                    if (isBotDetection) {
                        reject(new Error(`YouTube bot detection - yt-dlp exit code ${code}`));
                    } else {
                        reject(new Error(`yt-dlp exit code ${code}`));
                    }
                }
            }
        });

        ytdlp.stderr.on('data', (data) => {
            const msg = data.toString();
            if (msg.includes('bot') || msg.includes('sign in') || msg.includes('Sign in')) {
                console.error('[yt-dlp] Bot detection detected!');
                isBotDetection = true;
                if (!errorOccurred) {
                    errorOccurred = true;
                    // Kill sia yt-dlp che ffmpeg immediatamente
                    ytdlp.kill('SIGKILL');
                    ffmpeg.kill('SIGKILL');
                    reject(new Error('YouTube bot detection - aborting stream'));
                }
            } else if (msg.includes('ERROR')) {
                console.error('[yt-dlp] Error:', msg.slice(0, 150));
            }
        });

        // Gestisci errori di ffmpeg
        ffmpeg.on('error', (err) => {
            errorOccurred = true;
            reject(new Error(`[ffmpeg] ${err.message}`));
        });

        ffmpeg.on('exit', (code) => {
            if (code !== 0 && code !== null && !errorOccurred) {
                console.error(`[ffmpeg] Process exited with code ${code}`);
                errorOccurred = true;
                reject(new Error(`ffmpeg exit code ${code}`));
            }
        });

        console.log('[Audio Stream] Piping yt-dlp output to ffmpeg...');
        ytdlp.stdout.pipe(ffmpeg.stdin);

        ytdlp.stdout.on('error', () => { });
        ytdlp.stdin?.on('error', () => { });
        ffmpeg.stdin.on('error', () => { });
        
        // Timeout: se nessun dato arriva in 8 secondi, probabilmente è fallito
        let dataReceived = false;
        ffmpeg.stdout.once('data', () => {
            dataReceived = true;
            clearTimeout(dataTimeout);
        });
        
        const dataTimeout = setTimeout(() => {
            if (!dataReceived && !errorOccurred) {
                errorOccurred = true;
                console.error('[Audio Stream] Timeout: no data from ffmpeg in 3 seconds');
                ytdlp.kill('SIGKILL');
                ffmpeg.kill('SIGKILL');
                reject(new Error('Audio stream creation timeout'));
            }
        }, 3000);

        // Risolvi SOLO se tutto ha successo
        if (!errorOccurred) {
            resolve({ 
                stream: ffmpeg.stdout, 
                type: StreamType.OggOpus 
            });
        }
    });
}

// BACKUP - Versione yt-dlp + ffmpeg (in caso play-dl fallisca)
// async function createAudioStreamYtdlp(youtubeUrl) {
//     const { StreamType } = require('@discordjs/voice');
//
//     console.log('\n[Audio Stream] Starting download from:', youtubeUrl);
//
//     // uso process.cwd cosi funziona sia in locale che in deploy
//     const cookiePath = path.resolve(process.cwd(), 'cookies.txt');
//     if (fs.existsSync(cookiePath)) {
//         console.log('[Sistema] File cookies.txt trovato con successo.');
//     } else {
//         console.error('[Errore] cookies.txt NON trovato nel percorso:', cookiePath);
//     }
//
//     // scarico la canzone
//     const ytdlp = spawn('yt-dlp', [
//         '--extractor-args', 'youtube:player_client=android', // Forza il client Android
//         '--socket-timeout', '30',     // Timeout di connessione
//         '-f', 'bestaudio',
//         '--no-playlist',
//         '--cookies', cookiePath,
//         '-o', '-',
//         youtubeUrl
//     ], { stdio: ['ignore', 'pipe', 'pipe'] });
//
//     // taglio con ffmpeg
//     const ffmpeg = spawn(ffmpegPath, [
//         '-i', 'pipe:0',
//         '-t', '30',
//         '-c:a', 'libopus',
//         '-f', 'ogg',
//         '-ar', '48000',
//         '-ac', '2',
//         '-b:a', '128k',
//         'pipe:1'
//     ], { stdio: ['pipe', 'pipe', 'pipe'] });
//
//     // Gestisci errori di yt-dlp
//     ytdlp.on('error', (err) => {
//         console.error('[yt-dlp Error]', err.message);
//     });
//
//     ytdlp.on('exit', (code, signal) => {
//         if (code !== 0 && code !== null) {
//             console.warn(`[yt-dlp] Process exited with code ${code}, signal: ${signal}`);
//         }
//     });
//
//     ytdlp.stderr.on('data', (data) => {
//         console.warn('[yt-dlp stderr]', data.toString().slice(0, 100));
//     });
//
//     ffmpeg.on('error', (err) => {
//         console.error('[ffmpeg Error]', err.message);
//     });
//
//     ffmpeg.on('exit', (code, signal) => {
//         if (code !== 0 && code !== null) {
//             console.warn(`[ffmpeg] Process exited with code ${code}, signal: ${signal}`);
//         }
//     });
//
//     ffmpeg.stderr.on('data', (data) => {
//         // Puoi commentare questo console.warn se intasa troppo la console, 
//         // ffmpeg stampa un sacco di roba su stderr per natura.
//     });
//
//     console.log('[Audio Stream] Piping yt-dlp output to ffmpeg...');
//     ytdlp.stdout.pipe(ffmpeg.stdin);
//
//     ytdlp.stdout.on('error', () => { });
//     ytdlp.stdin?.on('error', () => { });
//     ffmpeg.stdin.on('error', () => { });
//
//     return { stream: ffmpeg.stdout, type: StreamType.OggOpus };
// }

// Versione Invidious (backup - attualmente non funzionante)
async function createAudioStreamInvidious(youtubeUrl) {
    const { StreamType } = require('@discordjs/voice');

    // Estrai l'ID del video dall'URL di YouTube
    const urlObj = new URL(youtubeUrl);
    const videoId = urlObj.searchParams.get('v');
    if (!videoId) throw new Error('URL YouTube non valido');

    console.log(`[Invidious] Richiedo audio per video ID: ${videoId}`);

    // Ottieni l'URL diretto dell'audio da Invidious
    const audioUrl = await getInvidiousAudioUrl(videoId);
    console.log(`[Invidious] URL audio ottenuto: ${audioUrl}`);

    // Crea uno stream PassThrough per veicolare i dati audio
    const audioStream = new PassThrough();

    // Scarica l'audio con una semplice richiesta HTTPS
    const request = https.get(audioUrl, (response) => {
        if (response.statusCode !== 200) {
            audioStream.destroy(new Error(`HTTP ${response.statusCode} da Invidious`));
            return;
        }
        response.pipe(audioStream);
    });

    request.on('error', (err) => {
        audioStream.destroy(err);
    });

    // Restituisci lo stream nella forma che Discord voice richiede
    return {
        stream: audioStream,
        type: StreamType.Arbitrary   // Invidious restituisce tipicamente opus o aac, ok così
    };
}


async function getInvidiousAudioUrl(videoId) {
    // Lista di istanze pubbliche di Invidious (aggiornata a marzo 2025)
    const instances = [
        'https://yewtu.be',
        'https://invidious.snopyta.org',
        'https://inv.bp.projectsegfau.lt',
        'https://inv.riverside.rocks',
        'https://invidious.flokinet.net',
        'https://inv.vern.cc'
    ];

    for (const instance of instances) {
        try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);
            const res = await fetch(`${instance}/api/v1/videos/${videoId}`, { signal: controller.signal });
            clearTimeout(timeout);
            if (!res.ok) continue;

            const data = await res.json();
            if (data.error) continue;

            // Cerca il miglior stream audio (opus o m4a)
            const audioFormat = data.formatStreams?.find(f => 
                f.audioBitrate && (f.type.includes('audio/webm') || f.type.includes('audio/mp4'))
            );
            if (audioFormat) return audioFormat.url;

            // Fallback: primo formato che contiene audio
            const anyAudio = data.formatStreams?.find(f => f.audioBitrate);
            if (anyAudio) return anyAudio.url;
        } catch (err) {
            console.warn(`Invidious instance ${instance} failed:`, err.message);
        }
    }
    throw new Error('No invidious instances found');
}

/**
 * Crea uno stream audio intelligente:
 * 1. Prova Spotify (NO bot detection, sempre 30 sec)
 * 2. Se fallisce, tenta YouTube/play-dl
 * 3. Se YouTube fallisce per bot detection, prova Invidious (NO bot detection)
 * 4. Ultimo fallback: yt-dlp con cookies
 * 
 * @param {string} query - Nome della canzone/artista da cercare
 * @returns {Promise<{stream, type, source}>} Stream audio pronto per Discord
 */
async function createAudioStreamSmart(query) {
    const { StreamType } = require('@discordjs/voice');

    console.log('\n[Audio Stream Smart] Tentando di trovare:', query);

    // PRIMO TENTATIVO: Spotify (più affidabile, 30 sec preview, NO bot detection)
    console.log('[Audio Stream Smart] Tentativo 1: Spotify preview...');
    try {
        const spotifyTrack = await searchSpotifyTrack(query);
        if (spotifyTrack && spotifyTrack.preview_url) {
            console.log('[Audio Stream Smart] ✅ Found on Spotify:', spotifyTrack.name);
            const stream = await createAudioStreamFromSpotifyPreview(spotifyTrack.preview_url);
            return {
                ...stream,
                source: 'spotify',
                metadata: spotifyTrack
            };
        } else {
            console.warn('[Audio Stream Smart] ⚠️ Spotify: No preview available');
        }
    } catch (spotifyError) {
        console.warn('[Audio Stream Smart] ⚠️ Spotify failed:', spotifyError.message);
    }

    // SECONDO TENTATIVO: YouTube/play-dl
    console.log('[Audio Stream Smart] Tentativo 2: YouTube (play-dl)...');
    try {
        const youtubeVideo = await searchSong(query);
        if (youtubeVideo && youtubeVideo.url) {
            console.log('[Audio Stream Smart] ✅ Found on YouTube:', youtubeVideo.title);
            const stream = await createAudioStream(youtubeVideo.url);
            return {
                ...stream,
                source: 'youtube',
                metadata: youtubeVideo
            };
        }
    } catch (ytError) {
        console.warn('[Audio Stream Smart] ⚠️ YouTube failed:', ytError.message);
    }

    // TERZO TENTATIVO: Invidious (NO bot detection!)
    console.log('[Audio Stream Smart] Tentativo 3: Invidious (no bot detection)...');
    try {
        const youtubeVideo = await searchSong(query);
        if (youtubeVideo && youtubeVideo.url) {
            const urlObj = new URL(youtubeVideo.url);
            const videoId = urlObj.searchParams.get('v');
            if (videoId) {
                console.log('[Audio Stream Smart] Trying Invidious for:', videoId);
                const audioUrl = await getInvidiousAudioUrl(videoId);
                console.log('[Audio Stream Smart] Got Invidious URL, creating stream...');
                const stream = await createAudioStreamFromURL(audioUrl, 20);
                console.log('[Audio Stream Smart] ✅ Stream creato con Invidious!');
                return {
                    ...stream,
                    source: 'invidious',
                    metadata: youtubeVideo
                };
            }
        }
    } catch (invidiousError) {
        console.warn('[Audio Stream Smart] ⚠️ Invidious failed:', invidiousError.message);
    }

    // QUARTO TENTATIVO: yt-dlp diretto
    console.log('[Audio Stream Smart] Tentativo 4: yt-dlp diretto...');
    try {
        const youtubeVideo = await searchSong(query);
        if (youtubeVideo && youtubeVideo.url) {
            const stream = await createAudioStreamYtdlp(youtubeVideo.url);
            return {
                ...stream,
                source: 'yt-dlp',
                metadata: youtubeVideo
            };
        }
    } catch (ytdlpError) {
        console.warn('[Audio Stream Smart] ⚠️ yt-dlp failed:', ytdlpError.message);
    }

    console.error('[Audio Stream Smart] Tutti i metodi falliti!');
    throw new Error('Impossibile trovare la canzone su nessuna piattaforma');
}


module.exports = { 
    searchSong, 
    searchSpotifyTrack,
    createAudioStream, 
    createAudioStreamYtdlp, 
    createAudioStreamFromSpotifyPreview,
    createAudioStreamInvidious,
    createAudioStreamSmart
}