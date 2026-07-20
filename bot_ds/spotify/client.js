// Gestisce tutta la comunicazione con le API Spotify. Ogni funzione riceve un `userId` e usa i suoi token personali.

const SpotifyWebApi = require('spotify-web-api-node');
const store = require('../db/firestore');

// permessi
const SCOPES = [
    'user-read-playback-state',
    'user-modify-playback-state',
    'user-read-currently-playing',
    'playlist-read-private',
    'playlist-read-collaborative',
    'user-top-read'
]

/**
 * Crea un'istanza SpotifyWebApi con le credenziali dell'app.
 * 
 * @returns {SpotifyWebApi} Un'istanza SpotifyWebApi non autenticata, con le credenziali dell'app caricate da .env
 */
function makeApi() {
    return new SpotifyWebApi({
        clientId:     process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        redirectUri:  process.env.SPOTIFY_REDIRECT_URI
    });
}   

/**
 * Restituisce un'istanza SpotifyWebApi già autenticata per l'utente specificato.
 * 
 * Se il token di accesso è scaduto, lo rinstruisce automaticamente.
 * Se l'utente non ha mai completato l'autenticazione, lancia un errore.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @returns {Promise<SpotifyWebApi>} Un'istanza SpotifyWebApi autenticata e pronta all'uso
 * @throws {Error} Lancia l'errore 'NOT_AUTHENTICATED' se l'utente non ha mai fatto /auth
 */
async function apiForUser(userId) {
    // prendo i token dell'utente
    const saved = await store.getTokens(userId);
    if (!saved) throw new Error('NOT_AUTHENTICATED')

    // api con token + refresh
    const api = makeApi();
    api.setAccessToken(saved.accessToken);
    api.setRefreshToken(saved.refreshToken);

    console.log('Token expiry check - expiresAt:', new Date(saved.expiresAt), 'now:', new Date(Date.now()));
    if (Date.now() > saved.expiresAt - 60_000) {
        console.log('Token expired or expiring soon, refreshing...');
        try {
            const data = await api.refreshAccessToken();
            console.log('Token refreshed successfully');
            api.setAccessToken(data.body.access_token);
            store.updateAccessToken(userId, data.body.access_token, data.body.expires_in);
        } catch (err) {
            console.error('Token refresh failed:', err.message);
            throw err;
        }
    } else {
        console.log('Token still valid');
    }

    return api;
}

/**
 * Genera il link OAuth2 da mandare all'utente per l'autenticazione.
 * 
 * L'utente cliccherà questo link e farà login con le sue credenziali Spotify.
 * Dopo il login, Spotify reindirizzerà a `SPOTIFY_REDIRECT_URI` con un codice.
 * 
 * @param {string} userId - L'ID dell'utente Discord (usato come state per sicurezza)
 * @returns {string} L'URL OAuth2 completo da inviare all'utente
 */
function getAuthUrl(userId) {
    const api = makeApi();
    return api.createAuthorizeURL(SCOPES, userId);
}

/**
 * Scambia il codice OAuth2 con i token di accesso e rinfresco.
 * 
 * Viene chiamato quando Spotify redirige l'utente indietro con il codice.
 * I token ottenuti vengono salvati nel tokenStore per usi futuri.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @param {string} code - Il codice di autorizzazione fornito da Spotify
 * @returns {Promise<void>}
 */
async function handleCallback(userId, code) {
    // api
    const api = makeApi()
    const data = await api.authorizationCodeGrant(code);

    const tokenData = {
        accessToken: data.body.access_token,
        refreshToken: data.body.refresh_token,
        expiresAt: Date.now() + (data.body.expires_in * 1000)
    }

    await store.saveTokens(userId, tokenData);
}

/**
 * Verifica se l'utente ha già completato l'autenticazione Spotify.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @returns {boolean} `true` se l'utente ha i token salvati, `false` altrimenti
 */
async function isAuthenticated(userId) {
    const token = await store.getTokens(userId)
    // i just discovered this nice thing
    // the first it's just a normal not, while the 
    // other "refactors" the logic truth
    // so in our case the first !
    // if token is true --> (there's something, in our case a { aaaaa }) -> false
    // if token is false --> (it's empty, so {} "") -> true
    // the second ! inverst the precedent value
    // so if token is true --> return true
    // else return false
    return !!token
}

/**
 * Cancella i token di accesso dell'utente, scollando l'account Spotify.
 * 
 * Dopo il logout, l'utente dovrà fare di nuovo /auth per riconnettere Spotify.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @returns {undefined}
 */
async function logout(userId) {    
    return await store.deleteTokens(userId);
}

/**
 * Cerca una canzone su Spotify e la avvia sul dispositivo attivo.
 * 
 * Ricerca il primo risultato per la query e lo riproduce.
 * L'utente deve avere Spotify Premium e un dispositivo attivo.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @param {string} query - Il nome della canzone da cercare (es: 'Blinding Lights The Weeknd')
 * @returns {Promise<Object>} Un oggetto con `success` e informazioni sulla canzone (name, artist, album, image, url, duration)
 */
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

/**
 * Mette in pausa la riproduzione Spotify dell'utente.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @returns {Promise<Object>} Un oggetto con `success: true` e messaggio di conferma
 */
async function pause(userId) {
    // api
    const api = await apiForUser(userId);
    await api.pause();
    return { success: true, message: 'In pause!' };
}

/**
 * Riprende la riproduzione Spotify dell'utente.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @returns {Promise<Object>} Un oggetto con `success: true` e messaggio di conferma
 */
async function resume(userId) {
    const api = await apiForUser(userId);
    await api.play()
    return { success: true, message: 'Playing'}
}

/**
 * Salta alla canzone successiva nella coda di riproduzione.
 * 
 * Attende 500ms per permettere a Spotify di aggiornare lo stato
 * prima di ritornare le informazioni della nuova canzone.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @returns {Promise<Object>} Informazioni sulla nuova canzone in riproduzione
 */
async function skip(userId) {
    const api = await apiForUser(userId);
    await api.skipToNext();
    // tempo di aggiornamento (non sovraccarichiamo)
    await new Promise(r => setTimeout(r, 500));
    return nowPlaying(userId);
}

/**
 * Torna alla canzone precedente nella coda di riproduzione.
 * 
 * Attende 500ms per permettere a Spotify di aggiornare lo stato
 * prima di ritornare le informazioni della canzone precedente.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @returns {Promise<Object>} Informazioni sulla canzone precedente in riproduzione
 */
async function previous(userId) {
    const api = await apiForUser(userId);
    await api.skipToPrevious();
    // tempo di aggiornamento (non sovraccarichiamo)
    await new Promise(r => setTimeout(r, 500));
    // stavolta ritorno cosa sto ascoltando ora
    return nowPlaying(userId);
}

/**
 * Imposta il volume di Spotify.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @param {number} volume - Il livello di volume (0-100)
 * @returns {Promise<Object>} Un oggetto con `success: true` e messaggio di conferma
 */
async function setVolume(userId, volume) {
    const api = await apiForUser(userId);
    await api.setVolume(volume);
    return { success: true, message: `Volume is now ${volume}%` };
}

/**
 * Legge il volume attuale
 * @param {string} userId 
 * @returns {Promise<Object>} un oggetto con `success` e `volume`
 */
async function getVolume(userId) {
    const api = await apiForUser(userId)
    const data = await api.getMyCurrentPlaybackState()
    if (!data.body || !data.body.device) return { success: false, message: 'No active device.'}
    // metto 50 nel caso fosse null
    return { success: true, volume: data.body.device.volume_percent ?? 50}
}


/**
 * Restituisce informazioni sulla canzone attualmente in riproduzione.
 * 
 * @param {string} userId - L'ID dell'utente Discord
 * @returns {Promise<Object>} Un oggetto con `success`, `isPlaying`, e informazioni sulla canzone (name, artist, album, image, url, duration, progress)
 */
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

/**
 * 
 * @param {*} userId 
 * @param {*} artistName 
 * @returns 
 */
async function searchArtist(userId, artistName) {
    const api = makeApi();
    try { // try catch per errori e trovare dove si trova un bug
        // non serve /auth
        const auth = await api.clientCredentialsGrant();
        api.setAccessToken(auth.body.access_token);
        // cerco
        const result = await api.searchArtists(artistName, { limit: 1 });
    
        // ritorno 
        const artists = result.body.artists.items;
        if (!artists.length) return null;
        return artists[0];
    } catch (err) {
        console.error('Full error:', err.statusCode, err.message, JSON.stringify(err.body));
        return null;
    }
}


/**
 * 
 * @param {*} userId 
 * @param {*} artistName 
 * @returns 
 */
async function getArtistTopTracks(userId, artistName) {
    const api = makeApi();
    const auth = await api.clientCredentialsGrant();
    api.setAccessToken(auth.body.access_token);
    
    const result = await api.searchTracks(`artist:${artistName}`, { limit: 10});
    console.log("Results", result.body.tracks.items)

    return result.body.tracks.items;
}

module.exports = { getAuthUrl, handleCallback, isAuthenticated, logout, play, pause, resume, skip, previous, setVolume, getVolume, nowPlaying, apiForUser, getArtistTopTracks, searchArtist };
