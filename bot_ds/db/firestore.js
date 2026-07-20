// db/firestore.js
const admin = require('firebase-admin');


// Leggi le credenziali da variabile d'ambiente (per Railway) o da file (per locale)
let serviceAccount;
if (process.env.FIREBASE_CREDENTIALS) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    } catch (e) {
        console.error("Error while parsing FIREBASE_CREDENTIALS:", e);
    }
} else {
    // Caricamento locale 
    serviceAccount = require('../vinylbot-55b21-firebase-adminsdk-fbsvc-3742d0f090.json');
}


if (!admin.apps.length) { // Controllo per evitare doppie inizializzazioni
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const scoresCollection = db.collection('scores');


/**
 * Metodo che ritorna l'id del documento combinando server e utente
 */
function scoreDocId(guildId, userId) {
    return `${guildId}_${userId}`
}

/**
 * Aggiunge un punto al punteggio di un utente
 */
async function addPoint(userId, guildId) {
    const userRef = scoresCollection.doc(scoreDocId(guildId, userId));

    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);

        if (!doc.exists) {
            transaction.set(userRef, {
                userId, guildId,
                points: 1, streak: 1, maxStreak: 1
            });
        } else {
            const data = doc.data();
            const newStreak = (data.streak || 0) + 1;
            const newMaxStreak = Math.max(newStreak, data.maxStreak || 0);
            
            transaction.update(userRef, {
                points: (data.points || 0) + 1,
                streak: newStreak,
                maxStreak: newMaxStreak
            });
        }
    });
}


/**
 * Recupera il punteggio di un utente in un server
 */
async function getScore(userId, guildId) {
    const doc = await scoresCollection.doc(scoreDocId(guildId, userId)).get();
    return doc.exists ? (doc.data().points || 0) : 0;
}

/**
 * Recupera la leaderboard di un singolo server, ordinata per punti
 */
async function getLeaderboard(guildId) {
    const snapshot = await scoresCollection
        .where('guildId', '==', guildId)
        .orderBy('points', 'desc')
        .get();
    const leaderboard = [];
    snapshot.forEach(doc => {
        leaderboard.push([doc.data().userId, doc.data().points || 0]);
    });
    return leaderboard;
}

/**
 * Recupera la leaderboard globale: somma i punti per utente su tutti i server
 */
async function getGlobalLeaderboard() {
    const snapshot = await scoresCollection.get();
    const totals = new Map();
    snapshot.forEach(doc => {
        const { userId, points } = doc.data();
        totals.set(userId, (totals.get(userId) || 0) + (points || 0));
    });
    return [...totals.entries()].sort((a, b) => b[1] - a[1]);
}

/**
 * Azzera tutti i punteggi
 */
async function resetScores() {
    const snapshot = await scoresCollection.get();
    const batch = db.batch();
    snapshot.forEach(doc => {
        batch.delete(doc.ref);
    });
    await batch.commit();
}

/**
 * Get badge based on points
 */
function getBadge(points) {
    if (points < 5) return { emoji: '🌑', name: 'Novice', tier: 1 };
    if (points < 10) return { emoji: '💿', name: 'Scout', tier: 2 };
    if (points < 20) return { emoji: '📀', name: 'Guitarist', tier: 3 };
    if (points < 50) return { emoji: '🔥', name: 'Maestro', tier: 4 };
    if (points < 100) return { emoji: '💎', name: 'Legend', tier: 5 };
    return { emoji: '🏆', name: 'Immortal', tier: 6 };
}

/**
 * Recupera lo streak di un utente in un server
 */
async function getStreak(userId, guildId) {
    const doc = await scoresCollection.doc(scoreDocId(guildId, userId)).get();
    return doc.exists ? (doc.data().streak || 0) : 0;
}

/**
 * Recupera il max streak di un utente in un server
 */
async function getMaxStreak(userId, guildId) {
    const doc = await scoresCollection.doc(scoreDocId(guildId, userId)).get();
    return doc.exists ? (doc.data().maxStreak || 0) : 0;
}

/**
 * Azzera lo streak di un utente in un server
 */
async function resetStreak(userId, guildId) {
    await scoresCollection.doc(scoreDocId(guildId, userId)).update({ streak: 0 });
}

/**
 * 
 * @param {*} userId 
 * @param {*} data 
 * @returns 
 */
async function saveTokens(userId, data) {
    console.log(`[Firestore] Saving tokens for user ${userId}`);
    await db.collection('spotify_tokens').doc(userId).set(data);
}

/**
 * @param {*} userId 
 * @returns
 */
async function getTokens(userId) {
    const doc = await db.collection('spotify_tokens').doc(userId).get();
    if (doc.exists) {
        return doc.data(); // ritorno i token
    }
    return null;
}

/**
 * 
 * @param {*} userId 
 */
async function deleteTokens(userId) {
    await db.collection('spotify_tokens').doc(userId).delete();
}

/**
 * 
 * @param {*} userId 
 * @param {*} newAccessToken 
 * @param {*} expiresIn 
 */
async function updateAccessToken(userId, newAccessToken, expiresIn) {
    const expiresAt = Date.now() + (expiresIn * 1000);
    await db.collection('spotify_tokens').doc(userId).update({
        accessToken: newAccessToken,
        expiresAt: expiresAt
    });
}

module.exports = {
    addPoint,
    getScore,
    getLeaderboard,
    getGlobalLeaderboard,
    resetScores,
    getBadge,
    getStreak,
    getMaxStreak,
    resetStreak,
    saveTokens,
    getTokens,
    deleteTokens,
    updateAccessToken,
};