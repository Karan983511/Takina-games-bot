# 🎮 Takina Games Bot

A Discord bot that **automatically drops fun mini-games** into random active channels every 10–20 minutes. No commands to run — just set it up and watch the fun begin!

---

## 🎲 Games

| Game | Type | How to Win |
|------|------|------------|
| 🏳️ Flag Guess | Chat | Type the country name first |
| 🔤 Word Backwards | Chat | Type the word in reverse first |
| 🧮 Math Quiz | Chat | Type the correct answer first |
| ⚡ Button Race | Button | Click the button before anyone else |
| 🎨 Color Picker | Button | Click the button matching the shown color |
| 🧠 Trivia | Button | Click the correct multiple-choice answer |
| 🤔 Would You Rather | Button | Everyone votes A or B — results shown after 20s |

> 🎁 **Reward Role:** Winners have a **1 in 5 (20%)** chance to earn a special role. You can set this role with `/setup role`.

---

## 🚀 Setup

### 1. Create a Discord Application

1. Go to [discord.com/developers/applications](https://discord.com/developers/applications)
2. Click **New Application** → name it "Takina Games"
3. Go to **Bot** → Click **Add Bot**
4. Under **Privileged Gateway Intents**, enable:
   - **Server Members Intent**
   - **Message Content Intent**
5. Copy your **Bot Token**

### 2. Invite the Bot

Build an invite URL with these permissions:
- Send Messages
- Embed Links
- Read Message History
- Use Application Commands
- Manage Roles *(needed to give reward roles)*

Or use the OAuth2 URL Generator in the Dev Portal with scopes: `bot` + `applications.commands`

### 3. Install & Run

```bash
# Clone / download this project
cd takina-games

# Install dependencies
npm install

# Copy .env.example and fill in your values
cp .env.example .env
```

Edit `.env`:
```env
DISCORD_TOKEN=your_bot_token_here
CLIENT_ID=your_application_id_here

# Optional: set your server ID for instant command registration during development
GUILD_ID=your_server_id_here
```

```bash
# Start the bot
npm start
```

---

## ⚙️ Server Configuration (`/setup`)

All configuration is done with the `/setup` command. You need **Manage Server** permission to use it.

| Subcommand | Description |
|------------|-------------|
| `/setup view` | See current settings |
| `/setup enable` | Turn auto-games on |
| `/setup disable` | Turn auto-games off |
| `/setup role [role]` | Set the 1-in-5 reward role (omit to remove) |
| `/setup channels-add #channel` | Restrict games to specific channels |
| `/setup channels-remove #channel` | Remove a channel from the list |
| `/setup channels-clear` | Allow games in any active channel |
| `/setup interval min max` | Set game frequency in minutes (e.g. `10 20`) |
| `/setup game-toggle [game] [true/false]` | Enable or disable individual games |

### Example First-Time Setup

```
/setup role @Game Winner
/setup channels-add #games
/setup channels-add #general
/setup interval 10 20
/setup view
```

---

## 📁 Project Structure

```
takina-games/
├── src/
│   ├── app.js                  # Entry point / Discord client
│   ├── commands/
│   │   └── setup.js            # /setup command
│   ├── events/
│   │   ├── ready.js
│   │   ├── messageCreate.js
│   │   ├── interactionCreate.js
│   │   ├── guildCreate.js
│   │   └── guildDelete.js
│   ├── games/
│   │   ├── index.js            # Game registry + helpers
│   │   ├── flagGuess.js        # 🏳️ Flag game
│   │   ├── wordBackwards.js    # 🔤 Backwards word
│   │   ├── buttonRace.js       # ⚡ Button race
│   │   ├── colorPicker.js      # 🎨 Color picker
│   │   ├── mathQuiz.js         # 🧮 Math
│   │   ├── trivia.js           # 🧠 Trivia (50+ questions)
│   │   └── wouldYouRather.js   # 🤔 WYR (30+ questions)
│   ├── handlers/
│   │   ├── commandLoader.js
│   │   ├── eventLoader.js
│   │   └── gameScheduler.js    # Auto-game timer + channel picker
│   └── services/
│       └── configService.js    # JSON-based guild config storage
├── data/
│   └── config.json             # Auto-created, stores guild configs
├── .env.example
├── package.json
└── README.md
```

---

## 🔧 Adding New Games

1. Create `src/games/yourGame.js` — export `buildYourGame()`, `buildYourEmbed()`, etc.
2. Register it in `src/games/index.js` under `TEXT_GAMES` or `BUTTON_GAMES`.
3. Add it to the toggle choices in `src/commands/setup.js`.
4. Add its label to `GAME_LABELS` in setup.js.

---

## 📝 Notes

- **No database required** — configs are stored in `data/config.json`
- The bot tracks recent channel activity. If no channels have been active in 30 minutes, it picks any text channel at random.
- Games time out after 20–30 seconds if nobody answers.
- The WYR game is the only non-competitive one — everyone can vote and results are shown after 20 seconds.
- Only one game runs at a time per server.
