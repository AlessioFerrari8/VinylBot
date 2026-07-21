# VinylBot — Slack

A Slack "guess the song" quiz bot with Spotify-powered search. The bot posts a ~15s audio clip in the channel; whoever's first to type the correct title in chat wins the point. Per-workspace leaderboard, streaks, and badges.

Live health check: [vinylbot-slack.alessio.hackclub.app/health](https://vinylbot-slack.alessio.hackclub.app/health) — this is the URL the website's `/status` page polls (`website/src/app/pages/status/status.ts`).

## How it works

- `/vinylbot-quiz_start <artist>` picks a random track by that artist, uploads a 15s mp3 clip to the channel, and starts a 30s guessing round (a hint drops after 15s).
- Anyone types the title in chat — first correct guess wins the point (and streak), then the next round starts automatically. 10 rounds per game, then the final leaderboard.
- No personal Spotify login needed: artist/track search only uses Spotify's app-level API (Client Credentials), no per-user OAuth.

## Commands

| Command | Description |
|---|---|
| `/vinylbot-quiz_start <artist>` | Start a game with an artist |
| `/vinylbot-quiz_skip` | Skip to the next round |
| `/vinylbot-quiz_stop` | Stop the current game |
| `/vinylbot-leaderboard [global]` | Workspace leaderboard (add `global` to aggregate across workspaces) |
| `/vinylbot-stats` | Your points, badge, rank and streak |
| `/vinylbot-streak` | Your current and best streak |
| `/vinylbot-ping` | Check if the bot is alive |

## Setup

### Prerequisites
- Node.js 18+
- A Slack app with **Socket Mode** enabled:
  - Bot Token Scopes: `chat:write`, `commands`, `files:write`, `groups:history` (only if you'll play in private channels, see note below)
  - Event Subscriptions → bot events `message.channels` (public channels) and `message.groups` (private channels) — add both unless you're sure you'll only ever play in public ones
  - Slash Commands: the 7 listed above, created under "Slash Commands"
  - App-Level Token with scope `connections:write`
  - Reinstall the app to the workspace after any scope/event change — nothing takes effect until you do
- A Spotify Developer app (Client Credentials only — no redirect URI needed)
- A Firebase project with Firestore (can be the same one used by `bot_ds` — different ID namespace, no collisions)

### Local

```bash
cd bot_slack
npm install
cp .env.example .env   # fill in the values, see below
```

Also drop the Firebase service-account JSON in this folder — the same file `bot_ds` uses works as-is, just copy it over.

```bash
npm run dev
```

### `.env`

```env
SLACK_BOT_TOKEN=xoxb-...      # OAuth & Permissions -> OAuth Tokens (reinstall the app after adding scopes)
SLACK_APP_TOKEN=xapp-...      # Basic Information -> App-Level Tokens
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
PORT=8889
DEPLOY_ENV=local_or_vps       # "vps" skips YouTube (blocked from datacenters) - Spotify preview + local files only
# FIREBASE_CREDENTIALS=...    # deploy only; locally use the JSON file instead
```

### Docker

```bash
docker-compose up -d --build
```

### Deploying to the VPS (build locally, ship the image)

Building on the VPS itself needs more RAM than it has to spare. Instead, build the image here and ship it as a tar — the VPS only ever runs `docker load` + `docker run`, no `npm install`, no compiling.

```bash
# 1. Build & save locally
docker build -t vinylbot-slack:latest .
docker save vinylbot-slack:latest | gzip > vinylbot-slack.tar.gz

# 2. Prepare a production .env (same as .env.example but DEPLOY_ENV=vps, and
#    FIREBASE_CREDENTIALS as a one-line compact JSON instead of the file —
#    docker's --env-file breaks on multi-line/pretty-printed values)
#    FIREBASE_CREDENTIALS=$(jq -c . vinylbot-55b21-firebase-adminsdk-fbsvc-3742d0f090.json)

# 3. Ship both to the VPS
scp vinylbot-slack.tar.gz vinylbot-slack.env alessio@hackclub.app:~

# 4. On the VPS: load and (re)run
ssh alessio@hackclub.app '
  docker load -i ~/vinylbot-slack.tar.gz
  docker rm -f vinylbot-slack 2>/dev/null
  docker run -d --name vinylbot-slack --network host \
    --dns 8.8.8.8 --dns 8.8.4.4 \
    --env-file ~/vinylbot-slack.env \
    --restart unless-stopped \
    vinylbot-slack:latest
'
```

Check it's actually up: `ssh alessio@hackclub.app "docker logs vinylbot-slack --tail 30 && curl -s localhost:8889/health"` — look for `Now connected to Slack` and `{"status":"online"}`.

## Notes

- `message.channels` only covers **public** channels; a **private** channel needs `message.groups` instead (Slack's two event types don't overlap — a game started in a private channel gets zero guess events without it, and the round will just keep timing out with no visible error). Add both if you're not sure where people will play.
- `message.channels` delivers messages from **every public channel in the workspace**, not just the ones the bot was invited to — that's how that event works on Slack, not something you can scope down from the app config. The bot still needs `/invite @VinylBot` in a channel to *post* there (start a game), but once a round is running it'll see the guess regardless of membership. The code filters by channel on every message (a cheap Map lookup) and only acts if that channel has an active round — nothing is logged or stored for channels without a game running.
- Personal Spotify playback control (`/play`, `/pause`, `/auth`, …) isn't implemented here — this is the guessing-game bot only.

### Where the audio clip comes from — `DEPLOY_ENV=local` vs `vps`

For each round the bot needs a ~15s mp3 of the chosen song, and tries these sources in order:

1. **Spotify preview** — tried first always, works from anywhere (including a datacenter), but not every track has one: Spotify stopped guaranteeing a `preview_url` for a lot of catalog, so this alone won't cover every artist.
2. **YouTube** (`play-dl`/`yt-dlp`) — only attempted when `DEPLOY_ENV=local`. YouTube actively blocks/rate-limits requests coming from datacenter/hosting-provider IPs (the kind almost every VPS uses), so this step is **skipped entirely** when `DEPLOY_ENV=vps` — trying it there would just fail slowly and waste time before falling through anyway.
3. **Local files** in `music/` — last resort, works everywhere, but only if you've actually put mp3s in there (the folder is empty by default).

So set `DEPLOY_ENV=local` when running on your own machine (full fallback chain, YouTube fills in whatever Spotify is missing) and `DEPLOY_ENV=vps` when deployed on a server (Spotify preview + local files only — YouTube would just be dead weight there). Practical effect: on a VPS, an artist whose tracks mostly lack Spotify previews will fail more often and shorten the game (falls back to `music/`, and if that's empty too, the round — and eventually the game — ends early). If that happens a lot, drop a handful of mp3s into `music/` as a safety net.
