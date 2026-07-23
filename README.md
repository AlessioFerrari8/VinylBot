# VinylBot

A "guess the song" music quiz bot with Spotify-powered search: the bot posts a short audio clip, first to type the right title in chat wins the point. Per-workspace/server leaderboard, streaks, and badges.

This repo hosts three sibling projects — same product, different surfaces:

```
bot_ds/     # Discord: quiz in a voice channel + optional personal Spotify remote control
bot_slack/  # Slack: separate project by design (no voice channels on Slack, so the
            # game works differently — see its own README)
website/    # Landing page: bot info, install/download links, docs
```

## Bots

- **Discord** — [`bot_ds/README.md`](bot_ds/README.md): setup, commands, deploy.
- **Slack** — [`bot_slack/README.md`](bot_slack/README.md): setup, commands, deploy.

Both are documented and deployable; pick whichever platform you actually use. Live health checks: [Discord](https://vinylbot.alessio.hackclub.app/health) · [Slack](https://vinylbot-slack.alessio.hackclub.app/health) — same URLs the website's `/status` page polls.

## Website

`website/` is the landing page (Angular) — bot info, install links, docs, status page. See [`website/README.md`](website/README.md) for the standard Angular CLI commands (`ng serve`, `ng build`, ...).

## Clone

```bash
git clone https://github.com/AlessioFerrari8/VinylBot.git
```

Then follow the setup section in whichever sub-project's README you need.
