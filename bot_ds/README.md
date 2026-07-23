# VinylBot — Discord

A Discord "guess the song" music quiz bot with Spotify-powered search: the bot joins your voice channel and plays a ~20s song preview, first to type the right title in chat wins the point. Per-server leaderboard, streaks, and badges — plus optional personal Spotify remote control from Discord.

Live health check: [vinylbot-ds.alessio.hackclub.app/health](https://vinylbot-ds.alessio.hackclub.app/health) — this is the URL the website's `/status` page polls (`website/src/app/pages/status/status.ts`).

## How it works

- `/quiz_start <artist>` picks a random track by that artist, joins your current voice channel, and plays a preview to start a round (a hint drops after 15s).
- Type the title in chat — first correct guess wins the point (and streak), then the next round starts automatically. 10 rounds per game, then the final leaderboard.
- Separately, `/auth` links your own Spotify account so you can control your personal playback from Discord (`/play`, `/pause`, `/resume`, `/skip`, `/previous`, `/volume`, `/nowplaying`) — unrelated to the quiz game, no auth needed just to play.

## Commands

### Game

| Command | Description |
|---|---|
| `/quiz_start <artist>` | Start a game with an artist (requires `/auth` first) |
| `/quiz_skip` | Skip to the next round |
| `/quiz_stop` | Stop the current game |
| `/leaderboard [global]` | Server leaderboard (add `global` to aggregate across servers) |
| `/stats` | Your points, badge, rank and streak |
| `/streak` | Your current and best streak |

### Spotify (personal playback control)

| Command | Description |
|---|---|
| `/auth` | Link your Spotify account |
| `/logout` | Unlink your Spotify account |
| `/play <song>` | Search and play a song on your active device |
| `/pause` / `/resume` | Pause / resume playback |
| `/skip` / `/previous` | Next / previous track |
| `/volume <level>` | Set volume (0-100) |
| `/nowplaying` | Show the currently playing track |

## Setup

### Prerequisites

- Node.js 20+ (the Docker image uses `node:20-alpine`)
- A Discord application (Discord Developer Portal) with a bot user — Token + Client ID, invited to your server with `Send Messages`, `Read Message History`, `Connect` and `Speak` permissions:
  [invite link](https://discord.com/oauth2/authorize?client_id=1487848371137024222&scope=bot%20applications.commands&permissions=3148800) (VinylBot's own app — swap the `client_id` for yours if self-hosting a separate bot)
- A Spotify Developer app — Client ID/Secret, plus a Redirect URI matching `SPOTIFY_REDIRECT_URI` (only needed for the personal `/auth` flow; the quiz itself only uses Client Credentials, no redirect involved)
- A Firebase project with Firestore (can be the same one used by `bot_slack` — different collection, no collisions)

### Local

```bash
cd bot_ds
npm install
cp .env.example .env   # fill in the values, see below
```

Also drop the Firebase service-account JSON in this folder.

```bash
npm run dev
```

Server (Spotify OAuth callback + `/health`) starts on `http://localhost:8888`.

### `.env`

```env
DISCORD_TOKEN=your_discord_token
DISCORD_CLIENT_ID=your_client_id
GUILD_ID=your_test_guild_id     # optional: registers commands to one guild instantly instead
                                 # of globally (global registration takes up to ~1h to propagate)
SPOTIFY_CLIENT_ID=...
SPOTIFY_CLIENT_SECRET=...
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback
PORT=8888
DEPLOY_ENV=local_or_vps         # "vps" skips YouTube (blocked from datacenters) - Spotify/iTunes/Deezer preview + local files only
# FIREBASE_CREDENTIALS=...      # deploy only; locally use the JSON file instead
```

### Docker

```bash
docker-compose up -d --build
```

### Deploying to the VPS (build locally, ship the image)

Building on the VPS itself needs more RAM than it has to spare. Instead, build the image here and ship it as a tar — the VPS only ever runs `docker load` + `docker run`, no `npm install`, no compiling.

```bash
# 1. Build & save locally
docker build -t vinylbot:latest .
docker save vinylbot:latest | gzip > vinylbot.tar.gz

# 2. Prepare a production .env (same as .env.example but DEPLOY_ENV=vps, and
#    FIREBASE_CREDENTIALS as a one-line compact JSON instead of the file —
#    docker's --env-file breaks on multi-line/pretty-printed values)
#    FIREBASE_CREDENTIALS=$(jq -c . vinylbot-55b21-firebase-adminsdk-fbsvc-3742d0f090.json)

# 3. Ship both to the VPS
scp vinylbot.tar.gz vinylbot.env alessio@hackclub.app:~

# 4. On the VPS: load and (re)run
ssh alessio@hackclub.app '
  docker load -i ~/vinylbot.tar.gz
  docker rm -f vinylbot 2>/dev/null
  docker run -d --name vinylbot -p 8888:8888 \
    --dns 8.8.8.8 --dns 8.8.4.4 \
    --env-file ~/vinylbot.env \
    --restart unless-stopped \
    vinylbot:latest
'
```

Check it's actually up: `ssh alessio@hackclub.app "docker logs vinylbot --tail 30 && curl -s localhost:8888/health"`.

If the domain/port is fronted by the Nest ingress, remember to open a matching varco in `/usr/local/sbin/docker-firewall.sh` for the port you publish — otherwise the container is up and healthy locally but unreachable from outside (same gotcha hit with `bot_slack`, see its README/vault history).

## Notes

### Where the quiz audio comes from — `DEPLOY_ENV=local` vs `vps`

For each round the bot needs a short preview of the chosen song, tried in this order:

1. **Spotify preview** — tried first always, works from anywhere including a datacenter, but not every track has one (Spotify stopped guaranteeing `preview_url` for a lot of the catalog).
2. **iTunes** and **Deezer** search previews — free, no auth, no bot detection, also work from any IP. Cover a lot of what Spotify misses.
3. **YouTube** (`play-dl` → Invidious → `yt-dlp` with cookies) — only attempted when `DEPLOY_ENV=local`. YouTube actively blocks/rate-limits datacenter IPs, so this whole chain is skipped on `DEPLOY_ENV=vps` — trying it there would just fail slowly.
4. **Local files** in `music/` — last resort, works everywhere, but only if you've actually put mp3s in there (the folder is empty by default).

So use `DEPLOY_ENV=local` on your own machine (full fallback chain) and `DEPLOY_ENV=vps` on a server (Spotify/iTunes/Deezer preview + local files only). If an artist's tracks mostly lack previews on all three services, drop a handful of mp3s into `music/` as a safety net so rounds don't run out of songs.

### Scores and leaderboard

Points/streaks are stored per-server in Firestore (`${guildId}_${userId}`). `/leaderboard` shows the current server by default; pass the `global` option to aggregate across every server the bot is in.

### Known limitations

- No automated tests or linter — plain `npm start` / `npm run dev`.
- A single user can technically "cheat" by playing solo with nobody competing — a game-design question, not a bug, left as-is for now.

## License

MIT License — feel free to fork and modify!
