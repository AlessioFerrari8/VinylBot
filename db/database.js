// addPoint(userId) — aggiunge un punto
// getScore(userId) — restituisce il punteggio
// getLeaderboard() — restituisce tutti i punteggi ordinati
// resetScores() — azzera tutto

const fs = require('fs');

function load() {
    try {
        return JSON.parse(fs.readFileSync('./scores.json', 'utf8'));
    } catch {
        return {};
    }
}

function save(scores) {
    fs.writeFileSync('./scores.json', JSON.stringify(scores, null, 2));
}


function addPoint(userId) {
    const scores = load()
    if (scores[userId] == null) {
        scores[userId] = 0 
    }
    scores[userId] += 1
    save(scores)
}

function getScore(userId) {
    const scores = load()
    return scores[userId] || 0;
}

function getLeaderboard() {
    const scores = load();
    // trasforma in array e ordina 
    return Object.entries(scores)
        .sort((a, b) => b[1] - a[1]);
}

function resetScores() {
    // semplicemente salvo con tutti i punteggi vuoti (AURA)
    save({})
}


module.exports = { addPoint, getScore, getLeaderboard, resetScores }