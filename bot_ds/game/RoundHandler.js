const database = require('../db/firestore');
const { EmbedBuilder } = require('discord.js');


/** @type {*} Memorizza il collector di messaggi corrente per questo round */
const activeCollectors = new Map();
/**
 * Avvia un nuovo round raccogliendo le risposte dei giocatori per 30 secondi
 * @param {Object} interaction - Oggetto interaction di Discord
 * @param {Object} gameManager - Istanza di GameManager per controllare le risposte e gestire il prossimo round
 */
async function startRound(interaction, gameManager, gameState) {
    const guildId = interaction.guildId;

    // Se c'è già un collector per questo server, fermalo prima di iniziarne uno nuovo
    if (activeCollectors.has(guildId)) {
        activeCollectors.get(guildId).stop('new_round_started');
    }
    // aspetto che qualcuno scriva in chat per 30 sec
    const collector = interaction.channel.createMessageCollector({ time: 30000 })

    // HINT
    const hintTimeout = setTimeout(() => {
        const currentSong = gameManager.getCurrentSong(guildId)
        if (currentSong) {
            const title = currentSong.title;
            const hint = title
                .split(' ')
                .map(w => w[0] + '\\_'.repeat(w.length - 1))
                .join(' ');
            
            interaction.channel.send(`💡 **Hint:** ${hint}`);
        }
    }, 15000); // 15 secondi

    // messaggi ricevuti
    collector.on('collect', async message => {
        if (message.author.bot) return // ignoro bot

        // id utente e la sua guess
        const userId = message.author.id
        const guess = message.content

        console.log(`[RoundHandler] Collected message from ${userId}: "${guess}"`);

        // controllo se ha indovinato
        const correct = await gameManager.checkGuess(userId, guess, guildId);

        // indovinato
        if (correct) {
            console.log(`[RoundHandler] CORRECT answer from ${userId}!`);
            // fermo il collector e mando ack
            collector.stop('correct');
            const currentSong = gameManager.getCurrentSong(guildId);
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
        // spengo il timeout
        clearTimeout(hintTimeout);

        // Rimuoviamo il collector dalla Map quando finisce
        activeCollectors.delete(guildId);

        console.log(`[RoundHandler] Collector ended - reason: ${reason}`);
        
        if (reason !== 'correct' && reason !== 'stopped' && reason !== 'new_round_started') {
            const losers = [...new Set(collected.map(m => m.author.id))];
            for (const id of losers) {
                await database.resetStreak(id);
            }
            
            const toGuess = gameManager.getToGuess(guildId);
            if (toGuess) {
                interaction.channel.send(`Time's up! The song was **${toGuess}**`);
            }
            await gameManager.nextRound(interaction);
        }
    })

    // aggioro il collector
    activeCollectors.set(guildId, collector);
}

/**
 * Ferma il round corrente e libera il message collector
 */
function stopRound(guildId) {
    const collector = activeCollectors.get(guildId);
    if (collector) {
        collector.stop('stopped');
        activeCollectors.delete(guildId);
    }
}

module.exports = { startRound, stopRound }