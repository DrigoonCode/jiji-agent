// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  JIJI — Beautiful Terminal Interface
//  PC pe ya Termux pe — dono jagah kaam kare
//  Run: node terminal.js
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
require('dotenv').config();
const readline = require('readline');
const chalk = require('chalk');
const { runJiji, clearHistory, getHistory } = require('./agent');

// ━━━ ASCII LOGO ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function printLogo() {
  console.clear();
  console.log('');
  console.log(chalk.cyan('  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.white('                                      ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.cyan('        ██╗██╗ ██╗██╗                  ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.cyan('        ██║██║ ██║██║                  ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.cyan('        ██║██║ ██║██║                  ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.cyan('   ██   ██║██║ ██║██║                  ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.cyan('   ╚█████╔╝╚██████╔╝██║                ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.cyan('    ╚════╝  ╚═════╝ ╚═╝                ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.magenta('       Personal AI Agent 🤖            ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░') + chalk.bold.white('                                      ') + chalk.cyan('░░'));
  console.log(chalk.cyan('  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░'));
  console.log('');
  console.log(chalk.gray('  ') + chalk.green('● Online') + chalk.gray('  |  ') + chalk.cyan('OpenRouter Auto Model') + chalk.gray('  |  ') + chalk.magenta('Piyush ka JIJI'));
  console.log('');
  console.log(chalk.gray('  Type ') + chalk.yellow('/help') + chalk.gray(' for commands, ') + chalk.yellow('/exit') + chalk.gray(' to quit'));
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
  console.log('');
}

// ━━━ TYPING ANIMATION ━━━━━━━━━━━━━━━━━━━━━━━
function showTyping() {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write('\r  ' + chalk.cyan(frames[i % frames.length]) + chalk.gray(' JIJI is thinking...'));
    i++;
  }, 80);
  return () => {
    clearInterval(interval);
    process.stdout.write('\r                              \r');
  };
}

// ━━━ FORMAT RESPONSE ━━━━━━━━━━━━━━━━━━━━━━━━
function formatResponse(text) {
  return text
    .replace(/\*\*(.*?)\*\*/g, (_, t) => chalk.bold.white(t))
    .replace(/\*(.*?)\*/g, (_, t) => chalk.italic.gray(t))
    .replace(/`(.*?)`/g, (_, t) => chalk.bgBlack.cyan(` ${t} `))
    .replace(/^#{1,3}\s(.+)/gm, (_, t) => chalk.bold.cyan('\n  ' + t))
    .replace(/^[-•]\s/gm, chalk.cyan('  ● '))
    .replace(/✅/g, chalk.green('✅'))
    .replace(/❌/g, chalk.red('❌'))
    .replace(/⚠️/g, chalk.yellow('⚠️'))
    .replace(/🔍/g, chalk.blue('🔍'))
    .replace(/💻/g, chalk.magenta('💻'))
    .replace(/📁/g, chalk.yellow('📁'));
}

// ━━━ HELP ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
function showHelp() {
  console.log('');
  console.log(chalk.bold.cyan('  ╔══ JIJI Commands ═══════════════════════╗'));
  console.log(chalk.cyan('  ║') + chalk.white('  /help     — Yeh menu                  ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + chalk.white('  /clear    — Chat history clear         ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + chalk.white('  /history  — Recent chat dekho          ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + chalk.white('  /tasks    — Scheduled tasks dekho      ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + chalk.white('  /logo     — Logo phir dikhao           ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ║') + chalk.white('  /exit     — Terminal band karo         ') + chalk.cyan('║'));
  console.log(chalk.bold.cyan('  ╚════════════════════════════════════════╝'));
  console.log('');
  console.log(chalk.gray('  Examples:'));
  console.log(chalk.yellow('  →') + chalk.white(' "Portfolio website banao dark theme mein"'));
  console.log(chalk.yellow('  →') + chalk.white(' "Roz 8 baje good morning bhejo"'));
  console.log(chalk.yellow('  →') + chalk.white(' "Aaj ka IPL score kya hai?"'));
  console.log(chalk.yellow('  →') + chalk.white(' "React todo app banao"'));
  console.log('');
}

// ━━━ MAIN TERMINAL ━━━━━━━━━━━━━━━━━━━━━━━━━━
async function startTerminal() {
  printLogo();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.magenta('  You ') + chalk.gray('→ '),
    historySize: 100
  });

  const SESSION = 'terminal';

  rl.prompt();

  rl.on('line', async (input) => {
    const line = input.trim();
    if (!line) { rl.prompt(); return; }

    // Commands
    if (line === '/exit' || line === '/quit') {
      console.log('');
      console.log(chalk.cyan('  👋 JIJI: Bye Piyush! Milte hain! ✨'));
      console.log('');
      process.exit(0);
    }

    if (line === '/help') { showHelp(); rl.prompt(); return; }

    if (line === '/logo') { printLogo(); rl.prompt(); return; }

    if (line === '/clear') {
      clearHistory(SESSION);
      console.log(chalk.green('  ✅ History clear ho gayi!'));
      console.log('');
      rl.prompt();
      return;
    }

    if (line === '/history') {
      const hist = getHistory(SESSION);
      if (!hist.length) {
        console.log(chalk.gray('  📋 Koi history nahi abhi.'));
      } else {
        console.log('');
        hist.slice(-6).forEach(m => {
          const icon = m.role === 'user' ? chalk.magenta('  You') : chalk.cyan(' JIJI');
          console.log(icon + chalk.gray(': ') + chalk.white(m.content?.slice(0, 200)));
          console.log('');
        });
      }
      rl.prompt();
      return;
    }

    if (line === '/tasks') {
      const stopTyping = showTyping();
      try {
        const response = await runJiji(SESSION, 'List all scheduled tasks', false);
        stopTyping();
        console.log('');
        console.log(chalk.cyan('  🤖 JIJI:'));
        console.log(chalk.gray('  ─────────────────────────────────────────'));
        console.log('  ' + formatResponse(response).split('\n').join('\n  '));
        console.log(chalk.gray('  ─────────────────────────────────────────'));
        console.log('');
      } catch (e) {
        stopTyping();
        console.log(chalk.red('  ❌ Error: ' + e.message));
      }
      rl.prompt();
      return;
    }

    // Hey JIJI / JIJI wake word
    const cleanInput = line.replace(/^(hey\s+)?jiji[,!]?\s*/i, '').trim() || 'Hello!';

    // Run agent
    const stopTyping = showTyping();

    try {
      const response = await runJiji(SESSION, cleanInput, true);
      stopTyping();

      console.log('');
      console.log(chalk.bold.cyan('  🤖 JIJI:'));
      console.log(chalk.gray('  ─────────────────────────────────────────'));
      const lines = formatResponse(response).split('\n');
      lines.forEach(l => console.log('  ' + l));
      console.log(chalk.gray('  ─────────────────────────────────────────'));
      console.log('');

    } catch (err) {
      stopTyping();
      console.log(chalk.red('  ❌ Error: ' + err.message));
      console.log('');
    }

    rl.prompt();
  });

  rl.on('close', () => {
    console.log('\n' + chalk.cyan('  👋 JIJI: Bye! ✨\n'));
    process.exit(0);
  });
}

startTerminal();
