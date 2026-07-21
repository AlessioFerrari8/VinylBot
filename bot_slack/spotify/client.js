// Ricerca artista/tracce su Spotify. Solo Client Credentials Flow (nessun login utente:
// il quiz non ha bisogno di controllare la riproduzione personale di nessuno, a differenza del bot Discord).

const SpotifyWebApi = require('spotify-web-api-node');

function makeApi() {
    return new SpotifyWebApi({
        clientId: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    });
}

/**
 * Cerca un artista per nome.
 * @param {string} artistName
 * @returns {Promise<Object|null>}
 */
async function searchArtist(artistName) {
    const api = makeApi();
    try {
        const auth = await api.clientCredentialsGrant();
        api.setAccessToken(auth.body.access_token);

        const result = await api.searchArtists(artistName, { limit: 1 });
        const artists = result.body.artists.items;
        if (!artists.length) return null;
        return artists[0];
    } catch (err) {
        console.error('[Spotify] searchArtist error:', err.statusCode, err.message);
        return null;
    }
}

/**
 * Recupera fino a 10 tracce di un artista (usato come pool di canzoni da indovinare).
 * @param {string} artistName
 * @returns {Promise<Array>}
 */
async function getArtistTopTracks(artistName) {
    const api = makeApi();
    const auth = await api.clientCredentialsGrant();
    api.setAccessToken(auth.body.access_token);

    const result = await api.searchTracks(`artist:${artistName}`, { limit: 10 });
    return result.body.tracks.items;
}

module.exports = { searchArtist, getArtistTopTracks };
