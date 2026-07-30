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

// Il pool deve essere molto più grande dei round di una partita (10), altrimenti ogni
// partita consuma tutte le tracce disponibili e lo stesso artista propone sempre le
// stesse canzoni. 50 è il massimo per pagina della search Spotify.
const TRACK_POOL_LIMIT = 50;

/**
 * Recupera il pool di tracce da cui pescare le canzoni da indovinare.
 * @param {Object} artist - Artista Spotify restituito da searchArtist (serve l'id per il filtro)
 * @returns {Promise<Array>}
 */
async function getArtistTracks(artist) {
    const api = makeApi();
    const auth = await api.clientCredentialsGrant();
    api.setAccessToken(auth.body.access_token);

    const result = await api.searchTracks(`artist:"${artist.name}"`, { limit: TRACK_POOL_LIMIT });
    const items = result.body.tracks.items;

    // La search è testuale: restituisce anche cover e omonimi. Tengo solo le tracce
    // davvero attribuite all'artista trovato, ma se il filtro svuota tutto ripiego sui
    // risultati grezzi piuttosto che far fallire la partita.
    const own = items.filter(track => track.artists.some(a => a.id === artist.id));
    return own.length ? own : items;
}

module.exports = { searchArtist, getArtistTracks };
