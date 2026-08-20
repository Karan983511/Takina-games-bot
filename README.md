# 🎮 Takina Games Bot

A Discord bot with two modules:

- **🎲 Games** — automatically drops fun mini-games into active channels every few minutes, with a reward-role loot system.
- **🚀 Booster Manager** — lets server boosters create custom roles (and voice channels), with admin controls for eligibility, boundaries, rotation, and logging.

---

## 🎲 Games

| Game | Type | How to Win |
|------|------|------------|
| 🏳️ Flag Guess | Chat | Type the country name first |
| 🔤 Word Backwards | Chat | Type the word in reverse first |
| 🧮 Math Quiz | Chat | Type the correct answer first |
| 🔢 Number Sequence | Chat | Type the next number in the pattern first |
| ⚡ Button Race | Button | Click the button before anyone else |
| 🎨 Color Picker | Button | Click the button matching the shown color |
| 🧠 Trivia | Button | Click the correct multiple-choice answer |
| 🤔 Would You Rather | Button | Everyone votes A or B — results shown after 20s |

> 🎁 **Reward Roles:** Winners have a **1 in 5 (20%)** chance to unlock a role from the server's reward pool. Unlocked roles can be equipped/unequipped anytime with `.loot`. Admins manage the pool from `/setup` → **Reward Roles**.

---

## 🚀 Booster Manager

Eligible members (boosters, or a custom eligibility role) can create their own custom role — and optionally a personal voice channel — with a guided setup wizard. Admins control the whole system from `/bsetup`.

**Member commands** (message-based, `.` prefix):

| Command | Description |
|---------|-------------|
| `.help` | Full command list |
| `.role setup` | Create or edit your custom role (name, color, icon) |
| `.role info` | View your role's details and who it's shared with |
| `.role overview` | See all active custom roles and the next rotation time |
| `.role give @user` | Share your role with another member |
| `.role remove @user` | Remove a member from your role |
| `.role manage` | Manage a role shared with you (hide, unhide, or remove yourself) |
| `.role reset` | Reset your role to default name/color/icon (keeps the role) |
| `.role delete` | Permanently delete your custom role |
| `.loot` | View and equip/unequip your unlocked reward roles |

**Admin command:** `/bsetup` — a section-based dashboard covering:
- **Overview** — active/inactive role counts, current config at a glance
- **Features** — toggle custom roles / custom VCs on or off
- **Eligibility Role** — restrict role creation to a specific role instead of "must be boosting"
- **Boundaries** — set the upper/lower role position custom roles are created between
- **Rotation** — featured-role voting and auto-rotation schedule (hourly/daily/weekly/monthly/custom)
- **Logging** — audit log channel for role/VC actions
- **Data Retention** — how long inactive roles are kept before cleanup
- **Link Role** — manually link an existing Discord role to a member as their "custom role"
- **System** — general status info

Custom roles automatically deactivate (and can be restored) if a member stops boosting or loses eligibility, and are cleaned up permanently after the configured retention window.

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
- Manage Roles *(needed for reward roles and custom booster roles)*
- Manage Channels *(needed for custom booster voice channels)*
- Connect / Move Members *(needed for custom booster voice channels)*

Or use the OAuth2 URL Generator in the Dev Portal with scopes: `bot` + `applications.commands`

### 3. Set Up a MongoDB Database

The bot requires MongoDB — it's no longer optional. All guild config, booster roles/VCs, votes, and audit logs are stored there. A free [MongoDB Atlas](https://www.mongodb.com/atlas) cluster works fine.

### 4. Install & Run

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
MONGODB_URI=your_mongodb_connection_string_here

# Optional: set your server ID for instant command registration during development
GUILD_ID=your_server_id_here

# Optional: error | warn | info | debug
LOG_LEVEL=info
```

```bash
# Start the bot
npm start
```

The bot will refuse to start if `DISCORD_TOKEN`, `CLIENT_ID`, or `MONGODB_URI` are missing.

---

## ⚙️ Games Configuration (`/setup`)

`/setup` opens a button/panel-based dashboard (no subcommands to memorize). You need **Manage Server** permission to use it. From the panel you can:

- Enable/disable auto-games
- Set the game interval (min/max minutes between drops)
- Restrict games to specific channels, or allow any active channel
- Manage the reward role pool
- Toggle individual games on/off

---

## 📁 Project Structure

```
takina-games/
├── src/
│   ├── app.js                       # Entry point / Discord client / MongoDB connect
│   ├── commands/
│   │   ├── setup.js                 # /setup — games dashboard
│   │   └── bsetup.js                # /bsetup — booster manager dashboard
│   ├── events/
│   │   ├── ready.js
│   │   ├── messageCreate.js         # Routes .help / .role / .loot + forwards to game scheduler
│   │   ├── interactionCreate.js
│   │   ├── guildCreate.js
│   │   ├── guildDelete.js
│   │   ├── guildBanAdd.js           # Booster cleanup on ban
│   │   ├── guildMemberAdd.js        # Restores inactive booster role on rejoin
│   │   ├── guildMemberRemove.js     # Booster cleanup on leave
│   │   └── guildMemberUpdate.js     # Booster/eligibility changes
│   ├── games/
│   │   ├── index.js                 # Game registry + helpers
│   │   ├── flagGuess.js             # 🏳️ Flag game
│   │   ├── wordBackwards.js         # 🔤 Backwards word
│   │   ├── buttonRace.js            # ⚡ Button race
│   │   ├── colorPicker.js           # 🎨 Color picker
│   │   ├── mathQuiz.js              # 🧮 Math
│   │   ├── numberSequence.js        # 🔢 Number pattern
│   │   ├── trivia.js                # 🧠 Trivia
│   │   └── wouldYouRather.js        # 🤔 WYR
│   ├── handlers/
│   │   ├── commandLoader.js
│   │   ├── eventLoader.js
│   │   └── gameScheduler.js         # Auto-game timer + channel picker
│   ├── services/
│   │   └── configService.js         # MongoDB-backed guild config storage
│   └── booster/                     # Booster Manager module
│       ├── index.js                 # Module init — starts cleanup + rotation services
│       ├── commands/
│       │   ├── booster.js           # Booster-facing message commands
│       │   ├── roleSetup.js         # `.role setup` wizard
│       │   ├── roleManage.js        # `.role manage` (shared members)
│       │   ├── settings.js          # `.settings` message commands
│       │   └── help.js              # `.help` panel
│       ├── handlers/
│       │   ├── memberUpdate.js      # Boost/eligibility change handling
│       │   └── interactions.js      # Buttons/selects for the booster module
│       ├── services/
│       │   ├── roleService.js
│       │   ├── vcService.js
│       │   ├── rotationService.js   # Featured-role voting + auto-rotation
│       │   ├── voteService.js
│       │   ├── cleanupService.js    # Retention-based cleanup
│       │   ├── emojiCleanupService.js
│       │   ├── backupService.js
│       │   ├── settingsService.js
│       │   └── discordRoleColorApi.js
│       ├── models/                  # Mongoose schemas (BoosterRole, BoosterVC, BoosterSettings, etc.)
│       └── utils/
├── data/
│   └── config.json                  # Legacy/local fallback — primary storage is MongoDB
├── .env.example
├── package.json
└── README.md
```

---

## 🔧 Adding New Games

1. Create `src/games/yourGame.js` — export `buildYourGame()`, `buildYourEmbed()`, etc.
2. Register it in `src/games/index.js` under `TEXT_GAMES` or `BUTTON_GAMES`.
3. Add it to the toggle choices in `src/commands/setup.js`.
4. Add its label to `GAME_LABELS` in `setup.js`.

---

## 📝 Notes

- **MongoDB required** — used for guild config, games data, and everything in the booster module. The bot won't start without `MONGODB_URI`.
- The bot tracks recent channel activity. If no channels have been active in 30 minutes, it picks any text channel at random.
- Games time out after 20–30 seconds if nobody answers.
- The WYR game is the only non-competitive one — everyone can vote and results are shown after 20 seconds.
- Only one game runs at a time per server.
- Custom booster roles/VCs are automatically deactivated (not deleted) when a member stops boosting or loses eligibility, and permanently cleaned up after the configured retention period.
- Booster module commands use a `.` prefix (e.g. `.role setup`, `.loot`) rather than slash commands, except for admin config (`/bsetup`).
