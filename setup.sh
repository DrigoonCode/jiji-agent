#!/bin/bash
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  JIJI Setup Script — Termux (Android)
#  Run: bash setup.sh
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

echo ""
echo "  ================================"
echo "  |   JIJI Agent — Setup         |"
echo "  ================================"
echo ""

# Step 1: Update Termux
echo "[1/5] Updating Termux..."
yes | pkg update -y 2>/dev/null
yes | pkg upgrade -y 2>/dev/null

# Step 2: Install required packages
echo "[2/5] Installing Node.js and Git..."
yes | pkg install nodejs-lts git nano -y 2>/dev/null

# Check Node installed
if ! command -v node &> /dev/null; then
  echo "ERROR: Node.js install failed. Try:"
  echo "  pkg install nodejs"
  exit 1
fi

echo "  Node.js: $(node -v)"
echo "  npm: $(npm -v)"

# Step 3: Install npm dependencies
echo "[3/5] Installing dependencies..."
npm install 2>&1 | tail -3

# Step 4: Check .env exists
echo "[4/5] Checking .env..."
if [ ! -f .env ]; then
  cp .env.example .env 2>/dev/null || cat > .env << 'EOF'
TELEGRAM_TOKEN=
OPENROUTER_KEY=
MY_CHAT_ID=
GITHUB_TOKEN=
GITHUB_USERNAME=
EOF
  echo "  .env file created. You need to fill in your keys."
  echo "  Opening editor now..."
  sleep 1
  nano .env
else
  echo "  .env exists."
fi

# Step 5: Verify keys
echo "[5/5] Verifying setup..."
source .env 2>/dev/null
READY=true

if [ -z "$TELEGRAM_TOKEN" ]; then
  echo "  MISSING: TELEGRAM_TOKEN"
  READY=false
fi
if [ -z "$OPENROUTER_KEY" ]; then
  echo "  MISSING: OPENROUTER_KEY"
  READY=false
fi

if [ "$READY" = true ]; then
  echo ""
  echo "  ================================"
  echo "  |   Setup Complete!            |"
  echo "  |   Run: node jiji.js          |"
  echo "  ================================"
  echo ""
else
  echo ""
  echo "  Keys missing. Edit .env first:"
  echo "    nano .env"
  echo "  Then run:"
  echo "    node jiji.js"
  echo ""
fi
