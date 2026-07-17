# 🎵 VinylBot - Discord Music Quiz Bot

A Discord bot that combines Spotify control with an interactive music guessing game. Play 30-second song previews and challenge your server to guess the titles!

## ✨ Features

### 🎮 Music Guessing Game
- Start a game with any Spotify artist: `/quiz_start <artist>`
- Listen to 30-second song previews
- Guess the song title in chat
- First correct answer earns points
- **Leaderboard system** with badges and win streak tracking

### 🎵 Spotify Control
- Control Spotify directly from Discord
- `/play <song>` - Search and play songs
- `/pause` - Pause playback
- `/resume` - Resume playback
- `/skip` - Skip to next track
- Management commands: `/auth`, `/logout`

---

### 🚀 Quick start

### Installation
[Install the bot](https://discord.com/oauth2/authorize?client_id=1487848371137024222&scope=bot&permissions=3148800)

### Deploy
I use #nest vps for deploy.

## Disclaimer
For now, in the music game there are just a few beatles songs.
That's because yt blocks anything that comes from bots, so I can't stream music.
If you want to use it completely, you just have to host it yourself, with the instructions below.

## Complete Start

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (for deployment)
- Discord Bot Token
- Spotify Developer Credentials

### How to use it
1. **Install**
[Install](https://discord.com/oauth2/authorize?client_id=1487848371137024222&scope=bot&permissions=3148800) the bot on a server
2. **Clone and install:**
```bash
git clone <repo>
cd VinylBot
npm install
```
3. **Create `.env` file:**
```env
# Discord
DISCORD_TOKEN=your_discord_token
DISCORD_CLIENT_ID=your_client_id

# Spotify
SPOTIFY_CLIENT_ID=your_spotify_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback

# Firebase (optional, fallback to local JSON storage)
FIREBASE_CREDENTIALS={"type":"service_account",...}

# Server
PORT=8888
```
4. **Spotify OAuth Setup:**
   - Go to [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   - Create/Edit your app
   - Add Redirect URI: `http://localhost:8888/callback`
   - Copy Client ID and Secret to `.env`

5. **Run locally:**
```bash
npm install
npm start
```

Server will start on `http://localhost:8888`

---

### 🐳 Docker Compose Setup (Recommended)

Run the bot inside Docker without installing Node.js locally.

1. **Prepare `.env` file** (same as above, but with localhost):
```env
DISCORD_TOKEN=your_token
DISCORD_CLIENT_ID=your_client_id
SPOTIFY_CLIENT_ID=your_id
SPOTIFY_CLIENT_SECRET=your_secret
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback
PORT=8888
FIREBASE_CREDENTIALS=...  # optional
```

2. **Build and run with Docker Compose:**
```bash
docker-compose up -d
```

3. **View logs:**
```bash
docker-compose logs -f vinylbot
```

4. **Stop the bot:**
```bash
docker-compose down
```

5. **Rebuild the image** (after code changes):
```bash
docker-compose up -d --build
```

---

### 🌐 Using ngrok for Spotify OAuth (If needed)

If you want to test with HTTPS locally (some setups require it):

```bash
# Install ngrok: https://ngrok.com/download

# Start ngrok tunnel
ngrok http 8888
# Output: Forwarding https://abc123.ngrok.io -> http://localhost:8888

# Update .env
SPOTIFY_REDIRECT_URI=https://abc123.ngrok.io/callback

# Add to Spotify Developer Dashboard:
# https://abc123.ngrok.io/callback

# Restart bot
npm run dev  # or docker-compose restart
```

---

## 📋 Commands

### 🎮 Game Commands
| Command | Description |
|---------|-------------|
| `/quiz_start <artist>` | Start a new guessing game with an artist |
| `/quiz_skip` | Skip to the next song in the game |
| `/quiz_stop` | Stop the current game session |
| `/leaderboard` | View server rankings with badges 🏆 |
| `/stats` | Show your personal statistics & streaks |
| `/streak` | Show your current win streak |

### 🎵 Spotify Commands
| Command | Description |
|---------|-------------|
| `/auth` | Link your Spotify account (required for game) |
| `/logout` | Unlink Spotify account |
| `/play <song>` | Search and play a song on your device |
| `/pause` | Pause Spotify playback |
| `/resume` | Resume Spotify playback |
| `/skip` | Skip to next track |
| `/previous` | Go back to previous track |
| `/volume <level>` | Set Spotify volume (0-100) |
| `/nowplaying` | Show currently playing song info |

---

## 📁 Project Structure

```
VinylBot/
├── commands/          # Slash command implementations
│   ├── quiz.js       # Quiz game commands
│   └── spotify.js    # Spotify control commands
├── game/             # Game logic
│   ├── GameManager.js        # Main game orchestration
│   ├── RoundHandler.js       # Round management
│   ├── Scorer.js             # Point tracking
│   └── YouTubeSearch.js      # Audio streaming
├── db/               # Database utilities
│   ├── firestore.js  # Firestore integration
│   └── database.js   # Fallback JSON storage
├── spotify/          # Spotify API integration
│   ├── client.js     # Spotify API wrapper
│   └── tokenStore.js # Token management
├── public/           # Static files
├── index.js          # Bot entry point
├── Dockerfile        # Docker configuration
└── docker-compose.yml # Local Docker setup
```

---

## 🔐 Authentication Flow

### Spotify OAuth2
1. User runs `/auth`
2. Bot returns Spotify login link
3. User authorizes the bot
4. Spotify redirects to `/callback` with auth code
5. Bot exchanges code for access/refresh tokens
6. Tokens stored in Firestore

---

## 🛠 Tech Stack

- **Discord.js** - Discord bot framework
- **Spotify Web API** - Music data & control
- **@discordjs/voice** - Voice channel management
- **Firebase Admin** - Token & score storage
- **Express.js** - OAuth callback server
- **@distube/ytdl-core** - YouTube audio streaming
- **play-dl** - Song search & streaming fallback

---

## 🐛 Troubleshooting

### Bot won't start
- Check `DISCORD_TOKEN` in `.env`
- Verify Node.js version (18+)
- Run `npm install` again

### `/auth` not working
- Ensure `SPOTIFY_REDIRECT_URI` matches Spotify Developer Dashboard
- Use HTTPS in production (Railway provides this)
- Check Spotify Developer App settings under "Redirect URIs"

### No audio in voice channel
- Verify bot has "Connect" and "Speak" permissions
- Check if FFmpeg is installed (Docker has it)
- Review YouTube blocking (use delays between requests)

### Firestore connection issues
- Ensure `FIREBASE_CREDENTIALS` or credentials file exists
- Check Firebase project permissions
- Tokens will fallback to local JSON storage

---

## 🤖 Add Bot to Server

[Click here to authorize the bot](https://discord.com/oauth2/authorize?client_id=1487848371137024222&scope=bot&permissions=3148800)

Required permissions:
- Send Messages
- Read Message History
- Speak
- Connect (voice channels)

---

## 📝 License

MIT License - Feel free to fork and modify!

---
