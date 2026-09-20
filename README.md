# JIJI — Personal AI Agent

Terminal + Telegram se kaam karne wala personal AI agent.
OpenRouter ke free models use karta hai — koi billing nahi.

---

## What JIJI can do

- Web search
- Build websites and projects, push to GitHub
- Create/read/delete files
- Set reminders and scheduled tasks (daily jokes, news, etc.)
- Read any URL and analyze it
- Answer any question in Hindi, English, or Hinglish
- Voice messages on Telegram

---

## Quick Start (PC or Termux)

### Step 1 — Clone the repo

```bash
git clone https://github.com/DrigoonCode/jiji-agent
cd jiji-agent
```

### Step 2 — Install dependencies

```bash
npm install
```

### Step 3 — Setup keys

```bash
cp .env.example .env
```

Open `.env` and fill in your keys (see Keys section below).

### Step 4 — Run

```bash
node jiji.js
```

This opens the terminal interface AND starts the Telegram bot at the same time.

---

## Keys Required

Edit `.env` file:

```env
# Required
TELEGRAM_TOKEN=     # From @BotFather on Telegram
OPENROUTER_KEY=     # From openrouter.ai/settings/keys
MY_CHAT_ID=         # Your Telegram user ID (from @userinfobot)

# Optional but recommended
GITHUB_TOKEN=       # From github.com/settings/tokens
GITHUB_USERNAME=    # Your GitHub username
BRAVE_SEARCH_KEY=   # From api.search.brave.com (free, no card)
```

### How to get each key

**Telegram Token**
1. Open Telegram, search `@BotFather`
2. Send `/newbot`
3. Give it a name and username
4. Copy the token it gives you

**Telegram Chat ID**
1. Search `@userinfobot` on Telegram
2. Send `/start`
3. Copy the ID number it shows

**OpenRouter Key**
1. Go to openrouter.ai
2. Sign up free
3. Settings > Keys > Create key

**GitHub Token**
1. Go to github.com/settings/tokens
2. Generate new token (classic)
3. Select: `repo`, `workflow`, `delete_repo`
4. Copy the token (shown only once)

**Brave Search Key (free web search)**
1. Go to api.search.brave.com
2. Sign up free — no credit card needed
3. Create application, copy API key

---

## How to use in terminal

When you run `node jiji.js`, you get an interactive prompt:

```
  You > Website banao dark theme mein portfolio
  JIJI : ...creates GitHub repo and pushes files...

  You > Aaj ka IPL score kya hai?
  JIJI : ...searches and replies...

  You > Roz subah 8 baje good morning bhejo
  JIJI : ...sets up scheduled task...
```

Available commands:
```
/clear    — Clear chat history
/history  — Show recent messages
/tasks    — Show scheduled tasks
/exit     — Quit
```

If Telegram is configured, messages from there appear in the same console window.

---

## Termux Setup (Android)

```bash
pkg install nodejs git
git clone https://github.com/DrigoonCode/jiji-agent
cd jiji-agent
npm install
cp .env.example .env
nano .env
node jiji.js
```

To keep it running after closing Termux:
```bash
pkg install termux-services
# Or use nohup:
nohup node jiji.js &
```

---

## Deploy to Railway (24/7 cloud)

1. Push this repo to your GitHub (without `.env`)
2. Go to railway.app, sign up with GitHub
3. New Project > Deploy from GitHub repo
4. Add environment variables (same as `.env` contents)
5. Deploy

After deploy, Telegram bot runs 24/7. Terminal access via Railway shell.

---

## GitHub Deploy — Push your code

```bash
cd jiji-agent
git init
git add .
git commit -m "JIJI initial setup"
git remote add origin https://github.com/DrigoonCode/jiji-agent.git
git push -u origin main
```

The `.gitignore` already excludes `.env` so your keys stay safe.

---

## File Access

JIJI creates files in `./jiji-workspace/` folder by default.

To give JIJI access to a specific folder, mention it in your message:
```
"C:\Users\Piyush\Documents folder mein resume banao"
"~/projects mein new React app setup karo"
```

JIJI will read, write, and list files in any path you mention.

---

## Model Routing

JIJI automatically selects model based on task:

| Task type | Model | Tokens |
|-----------|-------|--------|
| Complex (code, website, analysis) | openrouter/free heavy | 8192 |
| Simple (questions, chat, jokes) | openrouter/free light | 2048 |

To override with a specific model, add to `.env`:
```env
JIJI_HEAVY_MODEL=google/gemma-4-31b-it:free
JIJI_LIGHT_MODEL=liquid/lfm-2.5-2.6b:free
```

---

## Free Model Limits

OpenRouter free tier allows:
- ~50 requests/day with no credits purchased
- ~1000 requests/day after adding $10 credits once (credits last forever)

---

## Files in this repo

```
jiji-agent/
├── jiji.js        — Main: run this (terminal + telegram combined)
├── agent.js       — AI brain, tools, model routing
├── index.js       — Telegram-only mode
├── terminal.js    — Terminal-only mode
├── .env.example   — Keys template
├── .gitignore     — Keeps .env out of git
└── README.md      — This file
```

---

## Created by DrigoonCode
