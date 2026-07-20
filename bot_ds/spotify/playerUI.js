const { ContainerBuilder, SectionBuilder, TextDisplayBuilder, ThumbnailBuilder, SeparatorBuilder } = require('discord.js');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const FALLBACK_IMAGE = 'https://raw.githubusercontent.com/AlessioFerrari8/VinylBot/main/bot_ds/public/VinylBot_icon_small.png';

// application emoji dell'app (Developer Portal → Emojis), sorgenti in public/icons/
const EMOJI = {
    play:         { id: '1528428615669383249', name: 'play' },
    pause:        { id: '1528428614473744454', name: 'pause' },
    skip_back:    { id: '1528428617082605578', name: 'skip_back' },
    skip_forward: { id: '1528428618370519072', name: 'skip_forward' },
    volume_up:    { id: '1528428621403000842', name: 'volume_up' },
    volume_down:  { id: '1528428619943252090', name: 'volume_down' },
};

// helper
function formatTime(ms) {
    const totalSec = Math.floor(ms / 1000)
    const min = Math.floor(totalSec / 60);
    const sec = totalSec % 60; // ciò che rimane
    return `${min}:${String(sec).padStart(2, '0')}` // i secondi aggiungo lo 0, quindi 1:07 e non 1:7
}

function buildPlayerCard(track, { isPlaying, requestedBy }) {

    // riga info: album + richiedente, tempi in piccolo sotto (-# = subtext)
    let info = `**Album:** ${track.album} · **Requested by:** <@${requestedBy}>`;
    if (track.duration) {
        info += `\n-# ${formatTime(track.progress || 0)} / ${formatTime(track.duration)}`;
    }

    return new ContainerBuilder()
        .setAccentColor(isPlaying ? 0x1DB954 : 0x95a5a6) // verde spotify in play, grigio in pausa
        .addSectionComponents(
            new SectionBuilder()
                .addTextDisplayComponents(
                    new TextDisplayBuilder().setContent(
                        `**${isPlaying ? 'Now Playing' : 'Paused'}**\n## ${track.name}\n*${track.artist}*`
                    ),
                )
                .setThumbnailAccessory(
                    new ThumbnailBuilder().setURL(track.image ?? FALLBACK_IMAGE)
                )
        )
        .addTextDisplayComponents(new TextDisplayBuilder().setContent(info))
        .addSeparatorComponents(new SeparatorBuilder())
        .addActionRowComponents(buildPlayerButtons(requestedBy, isPlaying));
}

function buildPlayerButtons(ownerId, isPlaying) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`player:previous:${ownerId}`).setEmoji(EMOJI.skip_back).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`player:toggle:${ownerId}`)
            .setEmoji(isPlaying ? EMOJI.pause : EMOJI.play)
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`player:skip:${ownerId}`).setEmoji(EMOJI.skip_forward).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`player:voldown:${ownerId}`).setEmoji(EMOJI.volume_down).setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`player:volup:${ownerId}`).setEmoji(EMOJI.volume_up).setStyle(ButtonStyle.Secondary),
    )
}


module.exports = { buildPlayerCard, buildPlayerButtons };
