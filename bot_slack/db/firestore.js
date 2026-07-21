// db/firestore.js
// Stesso progetto Firebase del bot Discord: i doc id sono namespaced per workspace/utente
// (teamId Slack vs guildId Discord non collidono mai), quindi condividere la collection è sicuro.
const admin = require('firebase-admin');

let serviceAccount;
if (process.env.FIREBASE_CREDENTIALS) {
    try {
        serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
    } catch (e) {
        console.error("Error while parsing FIREBASE_CREDENTIALS:", e);
    }
} else {
    serviceAccount = require('../vinylbot-55b21-firebase-adminsdk-fbsvc-3742d0f090.json');
}

if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
}

const db = admin.firestore();
const scoresCollection = db.collection('slack_scores');

/**
 * Id documento combinando workspace (teamId) e utente
 */
function scoreDocId(teamId, userId) {
    return `${teamId}_${userId}`;
}

/**
 * Aggiunge un punto al punteggio di un utente in un workspace (transazione atomica)
 */
async function addPoint(userId, teamId) {
    const userRef = scoresCollection.doc(scoreDocId(teamId, userId));

    await db.runTransaction(async (transaction) => {
        const doc = await transaction.get(userRef);

        if (!doc.exists) {
            transaction.set(userRef, {
                userId, teamId,
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
 * Recupera il punteggio di un utente in un workspace
 */
async function getScore(userId, teamId) {
    const doc = await scoresCollection.doc(scoreDocId(teamId, userId)).get();
    return doc.exists ? (doc.data().points || 0) : 0;
}

/**
 * Recupera la leaderboard di un singolo workspace, ordinata per punti
 */
async function getLeaderboard(teamId) {
    const snapshot = await scoresCollection
        .where('teamId', '==', teamId)
        .orderBy('points', 'desc')
        .get();
    const leaderboard = [];
    snapshot.forEach(doc => {
        leaderboard.push([doc.data().userId, doc.data().points || 0]);
    });
    return leaderboard;
}

/**
 * Recupera la leaderboard globale: somma i punti per utente su tutti i workspace
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
 * Recupera lo streak di un utente in un workspace
 */
async function getStreak(userId, teamId) {
    const doc = await scoresCollection.doc(scoreDocId(teamId, userId)).get();
    return doc.exists ? (doc.data().streak || 0) : 0;
}

/**
 * Recupera il max streak di un utente in un workspace
 */
async function getMaxStreak(userId, teamId) {
    const doc = await scoresCollection.doc(scoreDocId(teamId, userId)).get();
    return doc.exists ? (doc.data().maxStreak || 0) : 0;
}

/**
 * Azzera lo streak di un utente in un workspace
 */
async function resetStreak(userId, teamId) {
    // set+merge invece di update: un utente che sbaglia la primissima risposta
    // non ha ancora un documento, update() fallirebbe con NOT_FOUND
    await scoresCollection.doc(scoreDocId(teamId, userId)).set({ userId, teamId, streak: 0 }, { merge: true });
}

module.exports = {
    addPoint,
    getScore,
    getLeaderboard,
    getGlobalLeaderboard,
    getBadge,
    getStreak,
    getMaxStreak,
    resetStreak,
};
