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
// stesse canzoni. Non si può però chiedere una pagina grande: la search rifiuta con
// 400 "Invalid limit" qualsiasi limit sopra 10, e anche con limit 10 restituisce 5
// risultati per pagina. L'endpoint artist top-tracks non è un'alternativa, risponde
// Forbidden con le credenziali client (deprecato per le app registrate di recente).
// Quindi il pool si costruisce paginando la search con l'offset: 8 pagine da 5 danno
// 18-42 brani unici a seconda dell'artista, abbondanti per 10 round.
const SEARCH_PAGE_LIMIT = 10;
const SEARCH_PAGE_SIZE = 5;
const SEARCH_PAGES = 8;

/**
 * Recupera il pool di tracce da cui pescare le canzoni da indovinare.
 * Le pagine si sovrappongono e contengono doppioni: la deduplica è a carico del chiamante.
 * @param {Object} artist - Artista Spotify restituito da searchArtist (serve l'id per il filtro)
 * @returns {Promise<Array>}
 */
async function getArtistTracks(artist) {
    const api = makeApi();
    const auth = await api.clientCredentialsGrant();
    api.setAccessToken(auth.body.access_token);

    const query = `artist:"${artist.name}"`;
    const offsets = Array.from({ length: SEARCH_PAGES }, (_, i) => i * SEARCH_PAGE_SIZE);

    const pages = await Promise.all(offsets.map(offset =>
        api.searchTracks(query, { limit: SEARCH_PAGE_LIMIT, offset })
            .then(res => res.body.tracks.items)
            // Una pagina persa (offset oltre i risultati dell'artista, rate limit) non deve
            // far fallire l'intero pool: si tiene quello che è arrivato dalle altre.
            .catch(err => {
                // statusCode esplicito: la libreria a volte lascia message vuoto e senza
                // questo il log non direbbe se è un 429 (rate limit) o altro.
                console.warn(`[Spotify] pagina offset=${offset} scartata: status=${err.statusCode} ${err.message || ''}`);
                return [];
            })
    ));

    const items = pages.flat();

    // La search è testuale: restituisce anche cover e omonimi. Tengo solo le tracce
    // davvero attribuite all'artista trovato, ma se il filtro svuota tutto ripiego sui
    // risultati grezzi piuttosto che far fallire la partita.
    const own = items.filter(track => track.artists.some(a => a.id === artist.id));
    return own.length ? own : items;
}

module.exports = { searchArtist, getArtistTracks };
