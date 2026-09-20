// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  JIJI — Telegram Bot
//  File upload + Voice + Multilingual
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios       = require('axios');
const fs          = require('fs-extra');
const path        = require('path');
const FormData    = require('form-data');
const gTTS        = require('node-gtts');
const { runJiji, clearHistory, getHistory } = require('./agent');

const bot        = new TelegramBot(process.env.TELEGRAM_TOKEN, { polling: true });
const MY_CHAT_ID = process.env.MY_CHAT_ID;
const TMP        = process.env.TMPDIR || require('os').tmpdir();

// per-user prefs
const userPrefs = {};
function getPrefs(id) {
  if (!userPrefs[id]) userPrefs[id] = { voice: false, lang: 'hi', context: null };
  return userPrefs[id];
}

// ── Language detect ────────────────────────────
function detectLang(text) {
  if (/[\u0900-\u097F]/.test(text)) return 'hi';
  const hw = ['kya','hai','nahi','kar','banao','toh','aur','mujhe','bolo'];
  if (hw.some(w => text.toLowerCase().includes(w))) return 'hi';
  return 'en';
}

// ── Download any Telegram file ────────────────
async function downloadFile(fileId, ext) {
  const link = await bot.getFileLink(fileId);
  const res  = await axios.get(link, { responseType: 'arraybuffer' });
  const dest = path.join(TMP, `jiji_${Date.now()}.${ext}`);
  await fs.writeFile(dest, res.data);
  return dest;
}

// ── Read file content (text / pdf / code) ─────
async function readFileContent(filePath, mimeType = '') {
  const ext = path.extname(filePath).toLowerCase();

  // PDF
  if (ext === '.pdf' || mimeType.includes('pdf')) {
    try {
      const pdfParse = require('pdf-parse');
      const buf      = await fs.readFile(filePath);
      const data     = await pdfParse(buf);
      return data.text.slice(0, 8000); // first 8K chars
    } catch {
      return null;
    }
  }

  // Text / code / markdown / JSON / anything readable
  const textExts = ['.txt','.md','.js','.ts','.py','.html','.css','.json',
                    '.csv','.xml','.yaml','.yml','.sh','.java','.cpp','.c',
                    '.go','.rs','.php','.rb','.swift','.kt','.sql','.env',
                    '.gitignore','.dockerfile',''];
  if (textExts.includes(ext) || mimeType.startsWith('text')) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      return content.slice(0, 10000);
    } catch {
      return null;
    }
  }

  return null;
}

// ── Voice → Text (Whisper) ─────────────────────
async function voiceToText(fileId) {
  try {
    const filePath = await downloadFile(fileId, 'oga');
    const form     = new FormData();
    form.append('file', fs.createReadStream(filePath), { filename:'audio.oga', contentType:'audio/ogg' });
    form.append('model', 'whisper-1');
    const key     = process.env.OPENAI_KEY || process.env.OPENROUTER_KEY;
    const baseURL = process.env.OPENAI_KEY ? 'https://api.openai.com/v1' : 'https://openrouter.ai/api/v1';
    const res     = await axios.post(`${baseURL}/audio/transcriptions`, form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${key}` }
    });
    await fs.remove(filePath).catch(() => {});
    return res.data.text;
  } catch { return null; }
}

// ── Text → Voice (Google TTS) ─────────────────
async function textToVoice(text, lang = 'hi') {
  try {
    const clean = text.replace(/[*_`#\[\]]/g,'').replace(/https?:\/\/\S+/g,'link')
                      .replace(/\n/g,'. ').trim().slice(0, 500);
    if (!clean || clean.length < 3) return null;
    const out = path.join(TMP, `jiji_tts_${Date.now()}.mp3`);
    await new Promise((res, rej) => {
      const tts = gTTS(clean, lang);
      tts.save(out, err => err ? rej(err) : res());
    });
    return out;
  } catch { return null; }
}

// ── Send (chunked, markdown) ──────────────────
async function send(chatId, text, opts = {}) {
  const chunks = text.match(/.{1,4000}/gs) || [text];
  for (const c of chunks) {
    await bot.sendMessage(chatId, c, { parse_mode:'Markdown', ...opts })
      .catch(async () => bot.sendMessage(chatId, c, opts).catch(() => {}));
  }
}

// ── Send + optional TTS ───────────────────────
async function reply(chatId, text) {
  await send(chatId, text);
  const p = getPrefs(chatId);
  if (p.voice) {
    const f = await textToVoice(text, p.lang || 'hi');
    if (f) { await bot.sendVoice(chatId, f).catch(()=>{}); await fs.remove(f).catch(()=>{}); }
  }
}

function scheduledCallback(response, name) {
  if (MY_CHAT_ID) reply(MY_CHAT_ID, `*${name}*\n\n${response}`);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  COMMANDS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

bot.onText(/\/start/, (msg) => {
  getPrefs(msg.chat.id);
  send(msg.chat.id,
`*JIJI online!*

Kya kar sakti hoon:
- Kuch bhi search
- Websites / apps banana, GitHub pe push
- Files banana, padhna, delete karna
- Reminders aur daily tasks set karna
- *File upload* — PDF, README, code — padh ke kaam karegi
- Voice messages samajhna

Commands:
/voice — voice reply on/off
/context — uploaded file ka status dekho
/clearcontext — file context clear karo
/tasks — scheduled tasks
/clear — history clear
/help — full menu`);
});

bot.onText(/\/voice/, (msg) => {
  const p = getPrefs(msg.chat.id);
  p.voice = !p.voice;
  send(msg.chat.id, `Voice: *${p.voice ? 'ON' : 'OFF'}*`);
});

bot.onText(/\/context/, (msg) => {
  const p = getPrefs(msg.chat.id);
  if (!p.context) return send(msg.chat.id, 'Koi file load nahi hai. File bhejo pehle.');
  send(msg.chat.id, `*Loaded file:* ${p.contextName}\n*Size:* ${p.context.length} chars\n\nAb instruction do kya karna hai iske saath.`);
});

bot.onText(/\/clearcontext/, (msg) => {
  const p = getPrefs(msg.chat.id);
  p.context = null; p.contextName = null;
  send(msg.chat.id, 'File context clear ho gaya.');
});

bot.onText(/\/tasks/, async (msg) => {
  const r = await runJiji(String(msg.chat.id), 'list all scheduled tasks', false, scheduledCallback);
  send(msg.chat.id, r);
});

bot.onText(/\/clear/, (msg) => {
  clearHistory(String(msg.chat.id));
  send(msg.chat.id, 'History clear.');
});

bot.onText(/\/help/, (msg) => {
  send(msg.chat.id,
`*JIJI Help*

*File upload:*
Koi bhi file bhejo (PDF, README, .js, .py, .md...)
JIJI padh legi aur context mein rakhegi.
Phir bolo: "Is file ko improve karo" ya "Resume se portfolio banao"

*Projects:*
"Portfolio website banao 3D dark theme mein"
"React app setup karo with routing"
"Python Flask API banao"

*Search:*
"IPL score kya hai?"
"Latest React docs batao"

*Schedule:*
"Roz 8 baje good morning bhejo"
"Roz raat 10 baje joke sunao"

*Voice:*
/voice — toggle
Voice message bhejo — JIJI samjhegi`);
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  MAIN MESSAGE HANDLER
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
bot.on('message', async (msg) => {
  const chatId  = msg.chat.id;
  const session = String(chatId);
  const prefs   = getPrefs(chatId);

  if (msg.text?.startsWith('/')) return;

  let userInput = '';

  // ── Text ──────────────────────────────────
  if (msg.text) {
    prefs.lang = detectLang(msg.text);
    userInput  = msg.text.replace(/^(hey\s+)?jiji[,!]?\s*/i,'').trim() || msg.text;

    // If context loaded, prepend it
    if (prefs.context) {
      userInput = `[Loaded file: ${prefs.contextName}]\n\n${prefs.context}\n\n---\nUser instruction: ${userInput}`;
    }
  }

  // ── Document / File upload ────────────────
  else if (msg.document) {
    const doc      = msg.document;
    const caption  = msg.caption || '';
    const fileName = doc.file_name || 'uploaded_file';
    const mime     = doc.mime_type || '';
    const ext      = path.extname(fileName).slice(1) || 'txt';

    bot.sendChatAction(chatId, 'typing');
    await send(chatId, `Reading *${fileName}*...`);

    try {
      const filePath = await downloadFile(doc.file_id, ext);
      const content  = await readFileContent(filePath, mime);
      await fs.remove(filePath).catch(()=>{});

      if (!content) {
        return send(chatId, `File type support nahi hai abhi (${mime}). Text, PDF, ya code files bhejo.`);
      }

      // Store in context
      prefs.context     = content;
      prefs.contextName = fileName;

      const preview = content.slice(0, 200).replace(/\n/g,' ');

      if (caption) {
        // User gave instruction with the file
        userInput = `[File: ${fileName}]\n\n${content}\n\n---\nInstruction: ${caption}`;
        await send(chatId, `File padh li (${content.length} chars). Processing instruction...`);
      } else {
        // No instruction — just confirm and wait
        return send(chatId,
`File padh li: *${fileName}*
Size: ${content.length} characters

Preview: _${preview}..._

Ab bolo kya karna hai iske saath. Example:
- "Is file ko improve karo"
- "Resume se portfolio website banao"
- "Is code mein bugs dhundo"
- "Summary banao"`);
      }
    } catch (err) {
      return send(chatId, `File read karne mein error: ${err.message}`);
    }
  }

  // ── Voice ─────────────────────────────────
  else if (msg.voice || msg.audio) {
    bot.sendChatAction(chatId, 'typing');
    const fid        = msg.voice?.file_id || msg.audio?.file_id;
    const transcribed = await voiceToText(fid);
    if (!transcribed) return send(chatId, 'Voice samajh nahi aaya. Dobara try karo.');
    await send(chatId, `_Heard: "${transcribed}"_`);
    userInput  = transcribed;
    prefs.lang = detectLang(transcribed);
    if (prefs.context) {
      userInput = `[Loaded file: ${prefs.contextName}]\n\n${prefs.context}\n\n---\nUser instruction: ${userInput}`;
    }
  }

  // ── Photo ─────────────────────────────────
  else if (msg.photo) {
    userInput = msg.caption || 'Is image ke baare mein batao';
  }

  else return;

  bot.sendChatAction(chatId, 'typing');

  try {
    const response = await runJiji(session, userInput, true, scheduledCallback);
    await reply(chatId, response);
  } catch (err) {
    await send(chatId, `Error: ${err.message}`);
  }
});

bot.on('polling_error', () => {});

// ━━━ Startup ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
console.log('  Telegram bot running. Type in Telegram.');
if (MY_CHAT_ID) {
  setTimeout(() => {
    bot.sendMessage(MY_CHAT_ID, 'JIJI online.', {}).catch(()=>{});
  }, 2000);
}
