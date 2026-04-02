/**
 * Modulo Database - Gestisce la persistenza dei punteggi utente
 * Memorizza i punteggi nel file scores.json
 */

const fs = require('fs');

/**
 * Carica i punteggi dal file scores.json
 * @returns {Object} Oggetto con gli ID utente come chiavi e i punteggi come valori
 * @private
 */
function load() {
    try {
        return JSON.parse(fs.readFileSync('./scores.json', 'utf8'));
    } catch {
        return {};
    }
}

/**
 * Salva i punteggi nel file scores.json
 * @param {Object} scores - Oggetto dei punteggi da salvare
 * @private
 */
function save(scores) {
    fs.writeFileSync('./scores.json', JSON.stringify(scores, null, 2));
}

/**
 * Aggiunge un punto al punteggio di un utente
 * @param {string} userId - ID utente Discord
 */
function addPoint(userId) {
    const scores = load()
    if (scores[userId] == null) {
        scores[userId] = 0 
    }
    scores[userId] += 1
    save(scores)
}

/**
 * Recupera il punteggio di un utente specifico
 * @param {string} userId - ID utente Discord
 * @returns {number} Il punteggio dell'utente, o 0 se l'utente non è trovato
 */
function getScore(userId) {
    const scores = load()
    return scores[userId] || 0;
}

/**
 * Recupera tutti i punteggi ordinati in ordine decrescente
 * @returns {Array} Array di coppie [userId, score] ordinato per punteggio
 */
function getLeaderboard() {
    const scores = load();
    // trasforma in array e ordina 
    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1]);
}

/**
 * Azzera tutti i punteggi a zero
 */
function resetScores() {
    // semplicemente salvo con tutti i punteggi vuoti (AURA)
    save({})
}


module.exports = { addPoint, getScore, getLeaderboard, resetScores }