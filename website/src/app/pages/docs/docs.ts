import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-docs',
  imports: [RouterLink],
  templateUrl: './docs.html',
})
export class Docs {
  readonly inviteUrl =
    'https://discord.com/oauth2/authorize?client_id=1487848371137024222&scope=bot&permissions=3148800';

  readonly sections = [
    { id: 'getting-started', label: 'Getting started' },
    { id: 'discord-bot', label: 'Discord bot' },
    { id: 'commands', label: 'Commands' },
    { id: 'slack-bot', label: 'Slack bot' },
    { id: 'self-hosting', label: 'Self-hosting' },
    { id: 'troubleshooting', label: 'Troubleshooting' },
  ];

  readonly gameCommands = [
    { cmd: '/quiz_start <artist>', desc: 'Start a new guessing game with an artist' },
    { cmd: '/quiz_skip', desc: 'Skip to the next song in the game' },
    { cmd: '/quiz_stop', desc: 'Stop the current game session' },
    { cmd: '/leaderboard', desc: 'View server rankings with badges' },
    { cmd: '/stats', desc: 'Show your personal statistics & streaks' },
    { cmd: '/streak', desc: 'Show your current win streak' },
  ];

  readonly spotifyCommands = [
    { cmd: '/auth', desc: 'Link your Spotify account (required for the game)' },
    { cmd: '/logout', desc: 'Unlink your Spotify account' },
    { cmd: '/play <song>', desc: 'Search and play a song on your device' },
    { cmd: '/pause', desc: 'Pause Spotify playback' },
    { cmd: '/resume', desc: 'Resume Spotify playback' },
    { cmd: '/skip', desc: 'Skip to the next track' },
    { cmd: '/previous', desc: 'Go back to the previous track' },
    { cmd: '/volume <level>', desc: 'Set Spotify volume (0-100)' },
    { cmd: '/nowplaying', desc: 'Show currently playing song info' },
  ];

  readonly slackCommands = [
    { cmd: '/vinylbot-quiz_start <artist>', desc: 'Start a new guessing game with an artist' },
    { cmd: '/vinylbot-quiz_skip', desc: 'Skip to the next round' },
    { cmd: '/vinylbot-quiz_stop', desc: 'Stop the current game' },
    { cmd: '/vinylbot-leaderboard [global]', desc: 'Workspace leaderboard with badges (add global to aggregate across workspaces)' },
    { cmd: '/vinylbot-stats', desc: 'Show your personal statistics & streak' },
    { cmd: '/vinylbot-streak', desc: 'Show your current and best streak' },
    { cmd: '/vinylbot-ping', desc: 'Check if the bot is alive' },
  ];

  readonly authFlow = [
    'Run /auth in your server',
    'The bot replies with a Spotify login link',
    'Authorize the app on Spotify',
    'Spotify redirects back to the bot with an auth code',
    'The bot exchanges it for access & refresh tokens',
    'Tokens are stored securely and refreshed automatically',
  ];

  readonly permissions = ['Send Messages', 'Read Message History', 'Speak', 'Connect (voice channels)'];

  readonly cloneSnippet = `git clone https://github.com/AlessioFerrari8/VinylBot.git
cd VinylBot
npm install`;

  readonly envSnippet = `# Discord
DISCORD_TOKEN=your_discord_token
DISCORD_CLIENT_ID=your_client_id

# Spotify
SPOTIFY_CLIENT_ID=your_spotify_id
SPOTIFY_CLIENT_SECRET=your_spotify_secret
SPOTIFY_REDIRECT_URI=http://localhost:8888/callback

# Firebase (optional, falls back to local JSON storage)
FIREBASE_CREDENTIALS={"type":"service_account",...}

# Server
PORT=8888`;

  readonly runSnippet = `npm start`;

  readonly dockerSnippet = `# build and run
docker-compose up -d

# view logs
docker-compose logs -f vinylbot

# stop the bot
docker-compose down

# rebuild after code changes
docker-compose up -d --build`;

  readonly ngrokSnippet = `# start a tunnel
ngrok http 8888
# Forwarding: https://abc123.ngrok.io -> http://localhost:8888

# update .env
SPOTIFY_REDIRECT_URI=https://abc123.ngrok.io/callback

# add the same URL to the Spotify Developer Dashboard, then restart the bot`;

  readonly troubleshooting = [
    {
      title: "Bot won't start",
      items: [
        'Check DISCORD_TOKEN in your .env',
        'Verify your Node.js version (18+)',
        'Run npm install again',
      ],
    },
    {
      title: '/auth not working',
      items: [
        'Ensure SPOTIFY_REDIRECT_URI matches the Spotify Developer Dashboard exactly',
        'Use HTTPS in production',
        'Check your Spotify app settings under "Redirect URIs"',
      ],
    },
    {
      title: 'No audio in the voice channel',
      items: [
        'Verify the bot has "Connect" and "Speak" permissions',
        'Check that FFmpeg is installed (the Docker image includes it)',
        'YouTube may be blocking the host — see the disclaimer above',
      ],
    },
    {
      title: 'Firestore connection issues',
      items: [
        'Ensure FIREBASE_CREDENTIALS (or a credentials file) exists',
        'Check your Firebase project permissions',
        'Without Firebase, data falls back to local JSON storage',
      ],
    },
  ];
}
