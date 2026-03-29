// salva e legge i token Spotify di ogni utente in un file tokens.json

const fs = require('fs');

/**
 * leggo il file tokens.json, se non esiste restituisco
 */
function load() {
  try {
    return JSON.parse(fs.readFileSync('./tokens.json', 'utf8'));
  } catch {
    return {};
  }
}

/**
 * scrivo nel file
 */
function save(tokens) {
  fs.writeFileSync('./tokens.json', JSON.stringify(tokens, null, 2));
}


/**
 * salva i token di un utente
 */
function setTokens(userId, accessToken, refreshToken, expiresIn) {
    const tokens = load()
    tokens[userId] = { accessToken, refreshToken, expiresAt: Date.now() + expiresIn * 1000}
    save(tokens)
}

/**
 * restituisce i token di un utente (o null se non esiste)
 */
function getTokens(userId) {
    const tokens = load()
    return tokens[userId] || null;
}

/**
 * aggiorna solo l'accessToken dopo un refresh
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
 * cancella i token di un utente (logout)
 */
function removeTokens(userId) {
    const tokens = load()
    delete tokens[userId];
    save(tokens)
}



module.exports = { setTokens, getTokens, updateAccessToken, removeTokens };
