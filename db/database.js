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
    // se utente non esiste, lo creo
    if (scores[userId] == null) {
        scores[userId] = {
            points: 0,
            streak: 0,
            maxStreak: 0
        };
    }
    // incremento punti e streak
    scores[userId].points += 1
    scores[userId].streak += 1

    // aggiorno max streak
    if (scores[userId].streak > scores[userId].maxStreak) {
        scores[userId].maxStreak = scores[userId].streak;
    }
    save(scores)
}

/**
 * Recupera il punteggio di un utente specifico
 * @param {string} userId - ID utente Discord
 * @returns {number} Il punteggio dell'utente, o 0 se l'utente non è trovato
 */
function getScore(userId) {
    const scores = load()

    if (typeof scores[userId] === 'number') {
        return scores[userId];
    }
    
    return scores[userId]?.points || 0;
}

/**
 * Recupera tutti i punteggi ordinati in ordine decrescente
 * @returns {Array} Array di coppie [userId, score] ordinato per punteggio
 */
function getLeaderboard() {
    const scores = load();
    // trasforma in array e ordina 
        return Object.entries(scores)
        .map(([userId, data]) => {
            // Compatibilità con vecchia struttura
            const points = typeof data === 'number' ? data : data.points;
            return [userId, points];
        })
        .sort((a, b) => b[1] - a[1]);
}

/**
 * Azzera tutti i punteggi a zero
 */
function resetScores() {
    // semplicemente salvo con tutti i punteggi vuoti (AURA)
    // aggiorno ovviamente anche streak e tutto
    save({})
}

/**
 * Get's the badge based on the points
 * @param {*} points // points of user
 * @returns // Object with emoji, name and tier
 */
function getBadge(points) {
    if (points < 5) return { emoji: '🌑', name: 'Novice', tier: 1 };
    if (points < 10) return { emoji: '💿', name: 'Scout', tier: 2 };
    if (points < 20) return { emoji: '📀', name: 'Guitarist', tier: 3 };
    if (points < 50) return { emoji: '🔥', name: 'Maestro', tier: 4 };
    if (points < 100) return { emoji: '💎', name: 'Legend', tier: 5 };
    return { emoji: '🏆', name: 'Immortal', tier: 6};
}


/**
 * Gets the streak of the user
 * @param {*} userId user
 * @returns the streak
 */
function getStreak(userId) {
    // carico score e userData
    const scores = load()
    const userData = scores[userId]

    if (!userData) return 0; // vuoto
    if (typeof userData === 'number') return 0; // struttura vecchia

    return userData.streak || 0;
}

/**
 * Gets the max streak of the user
 * @param {*} userId user
 * @returns the max streak
 */
function getMaxStreak(userId) {
    // stessa procedura `getStreak()`
    const scores = load()
    const userData = scores[userId]

    if (!userData) return 0;
    if (typeof userData === 'number') return 0; // gestisco sempre anche vecchia struttura

    return userData.maxStreak || 0;
}

/**
 * Resets the streak of a user if he doesn't win this round
 * @param {*} userId discord user
 */
function resetStreak(userId) {
    const scores = load()

    // aggiorno streak
    if (scores[userId] && typeof scores[userId] === 'object') {
        scores[userId].streak = 0;
        save(scores)
    }
}


module.exports = { addPoint, getScore, getLeaderboard, resetScores, getBadge, getStreak, getMaxStreak, resetStreak }