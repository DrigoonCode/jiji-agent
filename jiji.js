#!/usr/bin/env node
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  JIJI — Personal AI Agent
//  Claude Code style terminal interface
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
require('dotenv').config();
const readline = require('readline');
const chalk    = require('chalk');
const { runJiji, clearHistory, getHistory } = require('./agent');

// ── JIJI pixel logo (white on black, like Claude Code) ──
const LOGO = `
  ▐█ ██ █▌
  ▐█ ██ █▌   JIJI  v1.0
  ▐██████▌   Personal AI Agent
   ▝▀▀▀▀▀
`;

// ── Spinner frames ──────────────────────────
const FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏'];

function spinner(label) {
  let i = 0;
  const iv = setInterval(() => {
    process.stdout.write(`\r  ${chalk.gray(FRAMES[i++ % FRAMES.length])}  ${chalk.dim(label)}`);
  }, 80);
  return () => {
    clearInterval(iv);
    process.stdout.write('\r' + ' '.repeat(40) + '\r');
  };
}

// ── Strip markdown for terminal display ──────
function strip(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/\*(.*?)\*/g,     '$1')
    .replace(/`{3}[\s\S]*?`{3}/g, (m) => chalk.gray(m.replace(/`{3}\w*\n?/g,'')))
    .replace(/`([^`]+)`/g, chalk.cyan('$1'))
    .replace(/^#{1,3}\s(.+)/gm, (_, t) => chalk.bold(t))
    .replace(/^[-*]\s/gm, '  • ');
}

// ── Print header ─────────────────────────────
function header() {
  console.clear();
  console.log(chalk.white(LOGO));
  const model = process.env.JIJI_HEAVY_MODEL || 'openrouter/free (auto)';
  const gh    = process.env.GITHUB_USERNAME  || 'not set';
  console.log(chalk.dim(`  Model    ${model}`));
  console.log(chalk.dim(`  GitHub   ${gh}`));
  console.log(chalk.dim(`  Telegram ${process.env.TELEGRAM_TOKEN ? 'connected' : 'not configured'}`));
  console.log('');
  console.log(chalk.dim('  ─────────────────────────────────────────────'));
  console.log('');
}

// ── Start Telegram silently in background ────
function startTelegram(onMessage) {
  if (!process.env.TELEGRAM_TOKEN) return;
  try {
    const TelegramBot = require('node-telegram-bot-api');
    const bot = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });

    bot.on('message', async (msg) => {
      if (!msg.text || msg.text.startsWith('/')) {
        if (msg.text === '/start') bot.sendMessage(msg.chat.id, 'JIJI online. Bolo kya karna hai.');
        if (msg.text === '/clear') { clearHistory(String(msg.chat.id)); bot.sendMessage(msg.chat.id, 'History cleared.'); }
        return;
      }
      const input = msg.text.replace(/^(hey\s+)?jiji[,!]?\s*/i, '').trim() || msg.text;
      bot.sendChatAction(msg.chat.id, 'typing');

      // Show discreet notification in terminal
      onMessage(`Telegram @${msg.from?.username || msg.chat.id}: ${input.slice(0,50)}`);

      try {
        const reply = await runJiji(String(msg.chat.id), input, true);
        const chunks = reply.match(/.{1,4000}/gs) || [reply];
        for (const c of chunks) await bot.sendMessage(msg.chat.id, c, { parse_mode: 'Markdown' }).catch(() => bot.sendMessage(msg.chat.id, c));
      } catch (e) {
        bot.sendMessage(msg.chat.id, `Error: ${e.message}`);
      }
    });

    bot.on('polling_error', () => {});
  } catch { /* telegram optional */ }
}

// ── Help text ────────────────────────────────
function showHelp() {
  console.log('');
  console.log(chalk.dim('  Commands'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log('  /help      show this');
  console.log('  /clear     clear chat history');
  console.log('  /history   show recent messages');
  console.log('  /tasks     show scheduled tasks');
  console.log('  /logs      show last request logs');
  console.log('  /verbose   toggle verbose mode');
  console.log('  /exit      quit');
  console.log('');
  console.log(chalk.dim('  Examples'));
  console.log(chalk.dim('  ─────────────────────────────────────'));
  console.log('  Portfolio website banao dark theme mein');
  console.log('  Roz subah 8 baje good morning bhejo');
  console.log('  IPL ka score kya hai?');
  console.log('');
}

// ── Main ─────────────────────────────────────
async function main() {
  header();

  let verboseMode = false;
  const SESSION   = 'terminal';

  // Telegram messages show as small notification
  function tgNotify(text) {
    process.stdout.write('\r' + ' '.repeat(60) + '\r');
    console.log(chalk.dim(`  [telegram] ${text}`));
    rl.prompt(true);
  }

  startTelegram(tgNotify);

  const rl = readline.createInterface({
    input:       process.stdin,
    output:      process.stdout,
    prompt:      chalk.white('  > '),
    historySize: 200,
  });

  console.log(chalk.dim('  Type /help for commands'));
  console.log('');
  rl.prompt();

  rl.on('line', async (raw) => {
    const line = raw.trim();
    if (!line) { rl.prompt(); return; }

    // Commands
    if (line === '/exit') { console.log(''); process.exit(0); }

    if (line === '/help') { showHelp(); rl.prompt(); return; }

    if (line === '/clear') {
      clearHistory(SESSION);
      console.log(chalk.dim('  History cleared.\n'));
      rl.prompt(); return;
    }

    if (line === '/history') {
      const h = getHistory(SESSION);
      console.log('');
      if (!h.length) {
        console.log(chalk.dim('  No history yet.\n'));
      } else {
        h.slice(-8).forEach(m => {
          const who = m.role === 'user'
            ? chalk.white('  You  ')
            : chalk.cyan ('  JIJI ');
          const text = (m.content || '').slice(0, 140).replace(/\n/g, ' ');
          console.log(who + chalk.dim(' │ ') + text);
        });
        console.log('');
      }
      rl.prompt(); return;
    }

    if (line === '/logs') {
      const logs = global.lastLogs || [];
      console.log('');
      if (!logs.length) {
        console.log(chalk.dim('  No logs from last request.\n'));
      } else {
        console.log(chalk.dim('  Last request logs:'));
        logs.forEach(l => console.log(chalk.dim('  ' + l)));
        console.log('');
      }
      rl.prompt(); return;
    }

    if (line === '/verbose') {
      verboseMode = !verboseMode;
      process.env.JIJI_VERBOSE = verboseMode ? 'true' : 'false';
      console.log(chalk.dim(`  Verbose mode: ${verboseMode ? 'on' : 'off'}\n`));
      rl.prompt(); return;
    }

    if (line === '/tasks') {
      const stop = spinner('Fetching tasks...');
      const r    = await runJiji(SESSION, 'list all scheduled tasks', false);
      stop();
      console.log('');
      console.log(chalk.dim('  ─────────────────────────────────────'));
      strip(r).split('\n').forEach(l => console.log('  ' + l));
      console.log(chalk.dim('  ─────────────────────────────────────'));
      console.log('');
      rl.prompt(); return;
    }

    // Strip wake word
    const input = line.replace(/^(hey\s+)?jiji[,!]?\s*/i, '').trim() || line;

    // Thinking spinner
    const stop = spinner('Thinking...');

    try {
      const reply = await runJiji(SESSION, input, true);
      stop();
      console.log('');
      console.log(chalk.dim('  ─────────────────────────────────────'));
      strip(reply).split('\n').forEach(l => console.log('  ' + l));
      console.log(chalk.dim('  ─────────────────────────────────────'));
      console.log('');
    } catch (err) {
      stop();
      console.log('');
      console.log(chalk.red('  Error: ') + err.message);
      console.log('');
    }

    rl.prompt();
  });

  rl.on('close', () => { console.log(''); process.exit(0); });
}

main();
