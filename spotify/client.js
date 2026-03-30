// Gestisce tutta la comunicazione con le API Spotify. Ogni funzione riceve un `userId` e usa i suoi token personali.

const SpotifyWebApi = require('spotify-web-api-node');
const store = require('./tokenStore');

// permessi
const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
]

/**
 * crea un'istanza SpotifyWebApi 
 * @returns l'istanza creata
 */
function makeApi() {
    return new SpotifyWebApi({
        clientId:     process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri:  process.env.SPOTIFY_REDIRECT_URI
    });
}   

/**
 * crea un'istanza già autenticata per quell'utente, 
 * rinnovando il token se scaduto. Lancia errore `NOT_AUTHENTICATED` se l'utente non ha mai fatto `/auth`
 * @param {*} userId id dell'utente
 * @returns l'istanza autenticata
 */
async function apiForUser(userId) {
    // prendo i token dell'utente
    const saved = store.getTokens(userId);
    if (!saved) throw new Error('NOT_AUTHENTICATED')

    // api con token + refresh
    const api = makeApi();
    api.setAccessToken(saved.accessToken);
    api.setRefreshToken(saved.refreshToken);

    if (Date.now() > saved.expiresAt - 60_000) {
        const data = await api.refreshAccessToken();
        api.setAccessToken(data.body.access_token);
        store.updateAccessToken(userId, data.body.access_token, data.body.expires_in);
    }

    return api;
}


function getAuthUrl(userId) {
    const api = makeApi();
    return api.createAuthorizeURL(SCOPES, userId);
}

async function handleCallback(userId, code) {
    const api = makeApi()
    const data = await api.authorizationCodeGrant(code);
    store.setTokens(userId, data.body.access_token, data.body.refresh_token, data.body.expires_in)
}

function isAuthenticated(userId) {
    const token = store.getTokens(userId)
    if (!token) return false
    return true
}

function logout(userId) {    
    return store.removeTokens(userId);
}

async function play(userId, query) {
    // prendo api e cerco 
    const api = await apiForUser(userId)
    const search = await api.searchTracks(query, { limit: 1 });
    
    const tracks = search.body.tracks.items;
    if (!tracks.length) return { success: false, message: `No results for: **${query}**` };

    const track = tracks[0]
    await api.play({ uris: [track.uri] });

    return { success: true, track: {
        name:   track.name,
        artist: track.artists.map(a => a.name).join(', '),
        album:  track.album.name,
        image:  track.album.images[0]?.url,
        url:    track.external_urls.spotify,
        duration: track.duration_ms,
    }};

}

async function pause(userId) {
    // api
    const api = await apiForUser(userId);
    await api.pause();
    return { success: true, message: 'In pause!' };
}

async function resume(userId) {
    const api = await apiForUser(userId);
    await api.play()
    return { success: true, message: 'Playing'}
}

async function skip(userId) {
    const api = await apiForUser(userId);
    await api.skipToNext();
    // tempo di aggiornamento (non sovraccarichiamo)
    await new Promise(r => setTimeout(r, 500));
    return nowPlaying(userId);
}

async function previous(userId) {
    const api = await apiForUser(userId);
    await api.skipToPrevious();
    // tempo di aggiornamento (non sovraccarichiamo)
    await new Promise(r => setTimeout(r, 500));
    // stavolta ritorno cosa sto ascoltando ora
    return nowPlaying(userId);
}

async function setVolume(userId, volume) {
    const api = await apiForUser(userId);
    await api.setVolume(volume);
    return { success: true, message: `Volume is now ${volume}%` };
}


async function nowPlaying(userId) {
    const api = await apiForUser(userId);
    const data = await api.getMyCurrentPlayingTrack();

    if (!data.body || !data.body.item) return { success: false, message: 'No song playing rn.' };
    const track = data.body.item;

    return { success: true, isPlaying: data.body.is_playing, track: {
        name:   track.name,
        artist: track.artists.map(a => a.name).join(', '),
        progress: data.body.progress_ms,
        album:  track.album.name,
        image:  track.album.images[0]?.url,
        url:    track.external_urls.spotify,
        duration: track.duration_ms,
    }}; 
}


module.exports = { getAuthUrl, handleCallback, isAuthenticated, logout, play, pause, resume, skip, previous, setVolume, nowPlaying };
