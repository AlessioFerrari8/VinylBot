# VinylBot
The bot plays 15 seconds of a song, and whoever writes the title first in chat wins points. Server leaderboard, streak, and badges.

# How does it work
The bot plays 15-30 seconds of a song

Players writes the title or artist in chat

The first to answer correctly will gain points

At the end there will be a leaderboard

music-quiz-bot/
├── index.js
├── commands/
│   ├── quiz.js         # avvia partita
│   ├── leaderboard.js  # classifica
│   └── stats.js        # statistiche personali
├── game/
│   ├── GameManager.js  # logica partita
│   ├── RoundHandler.js # gestione round
│   └── Scorer.js       # punteggi e fuzzy match
├── db/
│   └── database.js     # SQLite
└── spotify/
    └── client.js       # Spotify API wrapper


# Deployment
https://railway.com/

# Scheme - CLAUDE generated
![alt text](discord_spotify_bot_flow.svg)


https://open.spotify.com/playlist/7mQliCHTzzjXXMxa6bTUQT?si=9a423aef2a234f2f