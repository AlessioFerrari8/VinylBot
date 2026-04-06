/** @type {*} Memorizza il collector di messaggi corrente per questo round */
let currentCollector = null;

/**
 * Avvia un nuovo round raccogliendo le risposte dei giocatori per 30 secondi
 * @param {Object} interaction - Oggetto interaction di Discord
 * @param {Object} gameManager - Istanza di GameManager per controllare le risposte e gestire il prossimo round
 */
async function startRound(interaction, gameManager) {

    // aspetto che qualcuno scriva in chat per 30 sec
    const collector = interaction.channel.createMessageCollector({ time: 30000 })

    // messaggi ricevuti
    collector.on('collect', async message => {
        // id utente e la sua guess
        const userId = message.author.id
        const guess = message.content

        console.log(`[RoundHandler] Collected message from ${userId}: "${guess}"`);

        // controllo se ha indovinato
        const correct = gameManager.checkGuess(userId, guess);

        // indovinato
        if (correct) {
            console.log(`[RoundHandler] CORRECT answer from ${userId}!`);
            // fermo il collector e mando ack
            collector.stop('correct');
            const currentSong = gameManager.getCurrentSong();
            if (currentSong) {
                interaction.channel.send(`The song was guessed by <@${userId}> **${currentSong.title}** by *${currentSong.artist}*`);
            }
            // vado al prossimo round
            await gameManager.nextRound(interaction); 
        } else {
            console.log(`[RoundHandler] INCORRECT answer from ${userId}: "${guess}"`);
        }
    });

    collector.on('end', async (collected, reason) => {
        console.log(`[RoundHandler] Collector ended - reason: ${reason}`);
        if (reason != 'correct') {
            // vuol dire che è scaduto il tempo
            const toGuess = gameManager.getToGuess();
            if (toGuess) {
                interaction.channel.send(`Time ended! The song was **${toGuess}**`);
            }
            await gameManager.nextRound(interaction);

        }
    })

    // aggioro il collector
    currentCollector = collector;
}

/**
 * Ferma il round corrente e libera il message collector
 */
function stopRound() {
    if (currentCollector) {
        currentCollector.stop('stopped');
        currentCollector = null;
    }
}

module.exports = { startRound, stopRound }