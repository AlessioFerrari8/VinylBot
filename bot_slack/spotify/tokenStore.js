/**
 * Modulo Token Store - Gestisce la memorizzazione persistente dei token OAuth di Spotify
 * Memorizza i token utente, token di accesso, token di refresh e tempi di scadenza in tokens.json
 */

const fs = require('fs');

/**
 * Carica tutti i token memorizzati dal file tokens.json
 * @returns {Object} Oggetto che mappa gli ID utente ai loro token memorizzati, o oggetto vuoto se il file non esiste
 * @private
 */
function load() {
  try {
    return JSON.parse(fs.readFileSync('./tokens.json', 'utf8'));
  } catch {
    return {};
  }
}

/**
 * Salva l'oggetto dei token nel file tokens.json
 * @param {Object} tokens - Oggetto con ID utente come chiavi e dati token come valori
 * @private
 */
function save(tokens) {
  fs.writeFileSync('./tokens.json', JSON.stringify(tokens, null, 2));
}

/**
 * Memorizza i token OAuth di Spotify per un utente
 * @param {string} userId - ID utente Discord
 * @param {string} accessToken - Token di accesso Spotify
 * @param {string} refreshToken - Token di refresh Spotify
 * @param {number} expiresIn - Tempo di scadenza del token in secondi
 */
function setTokens(userId, accessToken, refreshToken, expiresIn) {
    const tokens = load()
    tokens[userId] = { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000}
    save(tokens)
}

/**
 * Recupera i token memorizzati per un utente
 * @param {string} userId - ID utente Discord
 * @returns {Object|null} Oggetto token con accessToken, refreshToken e expiresAt, o null se non trovato
 */
function getTokens(userId) {
    const tokens = load()
    return tokens[userId] || null;
}

/**
 * Aggiorna il token di accesso per un utente dopo l'aggiornamento del token
 * @param {string} userId - ID utente Discord
 * @param {string} newAccessToken - Nuovo token di accesso Spotify
 * @param {number} expiresIn - Tempo di scadenza del token in secondi
 */
function updateAccessToken(userId, newAccessToken, expiresIn) {
    const tokens = load()
    if (tokens[userId]) {
        tokens[userId].accessToken = newAccessToken;
        tokens[userId].expiresAt = Date.now() + expiresIn * 1000;
    }    
    save(tokens)
}

/**
 * Rimuove i token memorizzati per un utente (logout)
 * @param {string} userId - ID utente Discord
 */
function removeTokens(userId) {
    const tokens = load()
    delete tokens[userId];
    save(tokens)
}

module.exports = { setTokens, getTokens, updateAccessToken, removeTokens };
