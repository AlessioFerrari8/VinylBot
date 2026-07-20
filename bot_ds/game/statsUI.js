const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder, SeparatorSpacingSize } = require('discord.js');

// application emoji 
const EMOJI_ID = {
    user:   '1528693992345305168',
    trophy: '1528693991191609404',
    target: '1528693989807620156',
    star:   '1528693988394143825',
    flame:  '1528693986867286026',
    chart:  '1528693985298878474',
};

// per usare le emoji custom
const e = name => `<:${name}:${EMOJI_ID[name]}>`;

const TIER_COLORS = {
    1: 0x95a5a6, // Novice - grigio
    2: 0x3498db, // Scout - blu
    3: 0x9b59b6, // Guitarist - viola
    4: 0xe67e22, // Maestro - arancio
    5: 0x1abc9c, // Legend - turchese
    6: 0xf1c40f, // Immortal - oro
};

function progressBar(points, nextTier) {
    if (!Number.isFinite(nextTier)) return null; // tier massimo, niente barra
    const size = 15; // lunghezza in caratteri, si allarga su una riga di testo normale
    const filled = Math.max(0, Math.min(size, Math.round((points / nextTier) * size)));
    const bar = '🟩'.repeat(filled) + '⬛'.repeat(size - filled);
    const percent = Math.round((points / nextTier) * 100);
    return `${bar} ${percent}%`;
}

/**
 * Card della leaderboard: medaglie per il podio, lista numerata per il resto.
 * @param {Array<{userId: string, points: number, badge: {emoji, name, tier}}>} entries
 */
function buildLeaderboardCard(entries) {
    const container = new ContainerBuilder()
        .setAccentColor(0xf1c40f)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e('trophy')} **Leaderboard**`))
        .addSeparatorComponents(new SeparatorBuilder());

    entries.forEach(({ userId, points, badge }, i) => {
        const rank = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `**${i + 1}.**`;
        container.addTextDisplayComponents(
            new TextDisplayBuilder().setContent(`${rank} <@${userId}> — ${e('star')} **${points}** pts ${badge.emoji} ${badge.name}`)
        );

        if (i < entries.length - 1) {
            container.addSeparatorComponents(
                new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false)
            );
        }
    });

    return container;
}

/**
 * Card delle stats personali: avatar, badge, rank, punti, streak, progresso al prossimo tier.
 */
function buildStatsCard({ userId, avatarURL, points, badge, rank, total, streak, maxStreak, nextTier, pointsToNext }) {
    const bar = progressBar(points, nextTier);

    let info = `${e('trophy')} Rank **#${rank}** of ${total}   ·   ${e('star')} **${points}** pts\n`;
    info += `${e('flame')} Streak **${streak}**   ·   Best **${maxStreak}**`;
    if (bar) {
        info += `\n${e('target')} Next tier: **${points}/${nextTier}** pts`;
    }

    const container = new ContainerBuilder()
        .setAccentColor(TIER_COLORS[badge.tier] ?? 0x1DB954)
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `${e('chart')} **Stats**\n## <@${userId}>\n${badge.emoji} *${badge.name}* (Tier ${badge.tier})`
                    ),
                )
                .setThumbnailAccessory(new ThumbnailBuilder().setURL(avatarURL))
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(info));

    if (bar) {
        container
            .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(false))
            .addTextDisplayComponents(new TextDisplayBuilder().setContent(bar));
    }

    return container;
}

/**
 * Card dello streak: numero corrente + record personale.
 */
function buildStreakCard({ userId, streak, maxStreak }) {
    return new ContainerBuilder()
        .setAccentColor(0xe67e22)
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(`${e('flame')} **Streak** — <@${userId}>`))
        .addSeparatorComponents(new SeparatorBuilder())
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `Current: **${streak}**\nBest: **${maxStreak}**`
        ));
}

module.exports = { buildLeaderboardCard, buildStatsCard, buildStreakCard };
