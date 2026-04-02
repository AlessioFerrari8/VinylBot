// punteggi temporanei della partita in corso
let scores = {};

/**
 * 
 * @param {*} userId 
 */
function addPoint(userId) {
    // se valido
    if (!scores[userId]) scores[userId] = 0;
    // +1
    scores[userId] += 1;
}

/**
 * 
 * @returns 
 */
function getScores() {
    return scores;
}

/**
 * 
 */
function getWinner() {
    let winner = null;
    let higher = 0;
  
    for (const [userId, score] of Object.entries(scores)) {
        if (score > higher) {
        higher = score;
        winner = userId;
        }
    }
  
    return winner;
}

function reset() {
    scores = {};
}


module.exports = { addPoint, getScores, getWinner, reset }