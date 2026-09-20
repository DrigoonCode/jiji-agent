// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  JIJI — Core Agent Brain
//  Auto-rotating free model pool
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

// ── FREE MODEL POOLS ──────────────────────────
// When one hits quota/rate-limit → auto-tries next
// Cooldown per model: 5 minutes, then retries

const HEAVY_POOL = [
  'nvidia/llama-3.1-nemotron-70b-instruct:free', // Extremely smart, best free reasoning
  'google/gemma-4-31b-it:free',         
  'google/gemma-4-26b-a4b-it:free',     
  'inclusionai/ling-3.0-flash-fin:free',
  'dots-studio/dots-3-note-preview:free',
  'openrouter/free',                     
];

const LIGHT_POOL = [
  'liquid/lfm-2.5-2.6b:free',           
  'google/gemma-4-26b-a4b-it:free',     
  'inclusionai/ling-3.0-flash-vl:free',
  'openrouter/free',                     
];

// Rate-limit tracker: modelId → cooldown expiry timestamp
const rateLimited = {};
const COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

function isAvailable(model) {
  const exp = rateLimited[model];
  if (!exp) return true;
  if (Date.now() > exp) { delete rateLimited[model]; return true; }
  return false;
}

function markLimited(model) {
  rateLimited[model] = Date.now() + COOLDOWN_MS;
  const mins = Math.round(COOLDOWN_MS / 60000);
  console.log(`[model] ${model} rate-limited — cooling down ${mins}m`);
}

function pickModel(pool) {
  const available = pool.filter(isAvailable);
  if (available.length === 0) {
    // All limited — pick least recently limited
    const leastRecent = pool.sort((a,b) => (rateLimited[a]||0) - (rateLimited[b]||0))[0];
    console.log(`[model] All limited — forcing ${leastRecent}`);
    return leastRecent;
  }
  return available[0]; // first available = highest priority
}

// Keywords that need heavy model
const HEAVY_KEYWORDS = [
  'banao','bana','banana','create','build','make','generate','design',
  'develop','implement','setup','deploy','launch',
  'website','webpage','app','application','project','portfolio',
  'dashboard','landing','api','backend','frontend','database','server','script',
  'code','coding','program','function','class','component',
  'fix','debug','refactor','optimize','html','css','javascript','react','node','python','java',
  'analyze','explain','compare','review','summarize','research','plan','suggest','improve',
  'file','folder','repo','github','push','commit',
];

function selectModel(userMessage) {
  const lower   = userMessage.toLowerCase();
  const isHeavy = HEAVY_KEYWORDS.some(kw => lower.includes(kw));
  if (isHeavy) {
    const model = pickModel(HEAVY_POOL);
    console.log(`[model] heavy → ${model}`);
    return { model, pool: HEAVY_POOL, maxTokens: 8192 };
  }
  const model = pickModel(LIGHT_POOL);
  console.log(`[model] light  → ${model}`);
  return { model, pool: LIGHT_POOL, maxTokens: 2048 };
}



const OpenAI = require('openai');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');
const { exec } = require('child_process');
const { Octokit } = require('@octokit/rest');

const ai = new OpenAI({
  baseURL: 'https://openrouter.ai/api/v1',
  apiKey: process.env.OPENROUTER_KEY,
  timeout: 60000,      // 60s timeout (prevents Premature close)
  maxRetries: 2,       // auto-retry on network failures
});

const octokit = process.env.GITHUB_TOKEN
  ? new Octokit({ auth: process.env.GITHUB_TOKEN })
  : null;

const scheduledJobs = {};
const chatHistories = {};

// ━━━ SYSTEM PROMPT ━━━━━━━━━━━━━━━━━━━━━━━━━━
const JIJI_SYSTEM = `You are JIJI — Piyush's personal AI agent.

THINKING APPROACH (CRITICAL — always follow this):
Before doing anything, think step by step:
1. What exactly is being asked?
2. What is the best approach? (not the easiest — the BEST)
3. What tools do you need?
4. What would a senior expert produce here?
Only then act.

CODING STANDARDS — always produce this quality:
- HTML/CSS: Semantic HTML5, CSS variables, responsive (mobile-first), smooth transitions/animations
- JavaScript: Modern ES6+, clean architecture, proper error handling
- React: Hooks, proper component structure, no prop drilling
- 3D/Animations: Use Three.js or CSS 3D transforms properly — not fake
- Portfolio: Must have hero section, smooth scroll, dark theme, real animations, not generic
- APIs: Proper REST design, auth, error codes
- Full stack: Think about DB schema, API design, frontend state — the whole picture

When building websites/apps:
- NEVER produce placeholder/demo quality — produce REAL production code
- Use Google Fonts, CSS custom properties, real animations
- Dark theme means: #0a0a0f or #0d0d0d backgrounds, not just black
- 3D means: actual CSS perspective/transform-style:preserve-3d or Three.js — not flat
- Write complete files, not snippets

When user uploads a file:
- Read it fully before responding
- Understand the context deeply
- Give specific, actionable improvements based on the actual content
- Don't give generic advice

Personality:
- Respond in Hinglish (Hindi + English mix naturally)
- No unnecessary emojis — use them only when they add value
- Be direct and concise — no fluff
- If something is complex, explain it clearly but briefly

Tools:
- Use web_search when you need current info, docs, or to find best practices
- Use create_github_project to build and deploy real projects
- Use file operations for reading/writing/managing files
- Always choose the right tool for the job`;


// ━━━ TOOLS DEFINITION ━━━━━━━━━━━━━━━━━━━━━━━
const TOOLS = [
  {
    type: 'function',
    function: {
      name: 'web_search',
      description: 'Internet pe kuch bhi search karo — news, info, lyrics, price, anything',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string' },
          type: { type: 'string', enum: ['general', 'news', 'code', 'images'], default: 'general' }
        },
        required: ['query']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_github_project',
      description: 'Naya project banao aur GitHub pe push karo',
      parameters: {
        type: 'object',
        properties: {
          repo_name: { type: 'string' },
          description: { type: 'string' },
          is_private: { type: 'boolean', default: false },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' }
              }
            }
          }
        },
        required: ['repo_name', 'files']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'create_local_files',
      description: 'Local machine pe files aur folders banao',
      parameters: {
        type: 'object',
        properties: {
          base_path: { type: 'string', description: 'Folder path jahan files banani hain' },
          files: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                path: { type: 'string' },
                content: { type: 'string' }
              }
            }
          }
        },
        required: ['files']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_file',
      description: 'Kisi file ka content padho',
      parameters: {
        type: 'object',
        properties: {
          file_path: { type: 'string' }
        },
        required: ['file_path']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'delete_file',
      description: 'File ya folder delete karo (sirf confirmation ke baad)',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          confirmed: { type: 'boolean' }
        },
        required: ['path', 'confirmed']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'run_command',
      description: 'Terminal command execute karo',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string' },
          cwd: { type: 'string' }
        },
        required: ['command']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'read_url',
      description: 'Kisi bhi URL ka content padho aur analyze karo',
      parameters: {
        type: 'object',
        properties: {
          url: { type: 'string' }
        },
        required: ['url']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'schedule_task',
      description: 'Koi bhi recurring task schedule karo — jokes, reminders, news, quotes',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          cron: { type: 'string', description: 'minute hour day month weekday — e.g. "0 8 * * *" for 8AM daily' },
          prompt: { type: 'string', description: 'Jiji ko kya karna chahiye us time pe — e.g. "Ek funny joke sunao"' },
          timezone: { type: 'string', default: 'Asia/Kolkata' }
        },
        required: ['name', 'cron', 'prompt']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_scheduled_tasks',
      description: 'Saare scheduled tasks dikhao',
      parameters: { type: 'object', properties: {} }
    }
  },
  {
    type: 'function',
    function: {
      name: 'cancel_task',
      description: 'Koi scheduled task cancel karo',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' }
        },
        required: ['name']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'list_files',
      description: 'Kisi folder ke files list karo',
      parameters: {
        type: 'object',
        properties: {
          folder: { type: 'string' }
        }
      }
    }
  }
];

// ━━━ TOOL EXECUTORS ━━━━━━━━━━━━━━━━━━━━━━━━━
async function executeTool(name, args, sendCallback) {
  try {
    switch (name) {

      case 'web_search': {
        // Strategy: Brave Search API > DuckDuckGo HTML scrape > DDG instant
        const braveKey = process.env.BRAVE_SEARCH_KEY;
        if (braveKey && braveKey !== 'BSA_YAHAN_BRAVE_KEY_DAALO') {
          try {
            const res = await axios.get('https://api.search.brave.com/res/v1/web/search', {
              params: { q: args.query, count: 5 },
              headers: { 'X-Subscription-Token': braveKey },
              timeout: 10000
            });
            const results = (res.data.web?.results || []).slice(0, 5)
              .map(r => `**${r.title}**\n${(r.description || '').slice(0, 300)}\n${r.url}`)
              .join('\n\n');
            return results || 'No results found.';
          } catch { /* fall through to DDG */ }
        }

        // DuckDuckGo HTML scrape (always free, no key needed)
        try {
          const res = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(args.query)}`, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
          });
          const cheerio = require('cheerio');
          const $ = cheerio.load(res.data);
          const results = [];
          $('.result').each((i, el) => {
            if (i >= 5) return false;
            const title = $(el).find('.result__title').text().trim();
            const snippet = $(el).find('.result__snippet').text().trim();
            const href = $(el).find('.result__url').text().trim();
            if (title) results.push(`**${title}**\n${snippet}\n${href}`);
          });
          if (results.length) return results.join('\n\n');
        } catch { /* fall through */ }

        // Last resort: DDG instant answers
        try {
          const res = await axios.get(`https://api.duckduckgo.com/?q=${encodeURIComponent(args.query)}&format=json&no_html=1`, { timeout: 8000 });
          const d = res.data;
          return d.AbstractText || d.Answer || d.RelatedTopics?.slice(0,3).map(t => t.Text).join('\n') || 'Search mein kuch nahi mila.';
        } catch { return 'Search failed. Check internet connection.'; }
      }

      case 'create_github_project': {
        if (!octokit) return '❌ GITHUB_TOKEN set nahi hai .env mein';
        
        const owner = process.env.GITHUB_USERNAME;
        await octokit.repos.createForAuthenticatedUser({
          name: args.repo_name,
          description: args.description || 'Created by JIJI',
          private: args.is_private || false,
          auto_init: true
        });

        await new Promise(r => setTimeout(r, 2000));

        for (const file of args.files) {
          await octokit.repos.createOrUpdateFileContents({
            owner, repo: args.repo_name,
            path: file.path,
            message: `✨ Add ${file.path}`,
            content: Buffer.from(file.content).toString('base64')
          }).catch(() => {});
        }

        return `✅ **GitHub repo bana gaya!**\n🔗 https://github.com/${owner}/${args.repo_name}\n🌐 Live: https://${owner}.github.io/${args.repo_name}\n📁 Files: ${args.files.map(f => f.path).join(', ')}`;
      }

      case 'create_local_files': {
        const base = args.base_path || './jiji-workspace';
        const created = [];
        for (const file of args.files) {
          const fullPath = path.join(base, file.path);
          await fs.ensureDir(path.dirname(fullPath));
          await fs.writeFile(fullPath, file.content, 'utf8');
          created.push(fullPath);
        }
        return `✅ **Files ban gayi:**\n${created.map(f => `📄 ${f}`).join('\n')}`;
      }

      case 'read_file': {
        const ext = path.extname(args.file_path).toLowerCase();
        if (ext === '.pdf') {
          try {
            const pdfParse = require('pdf-parse');
            const data = await pdfParse(await fs.readFile(args.file_path));
            return data.text.slice(0, 8000);
          } catch(e) { return 'Error reading PDF: ' + e.message; }
        }
        const content = await fs.readFile(args.file_path, 'utf8');
        return content.slice(0, 8000);
      }

      case 'delete_file': {
        if (!args.confirmed) {
          return `⚠️ **Confirm karo:** "${args.path}" delete karna chahte ho? Haan bol do.`;
        }
        await fs.remove(args.path);
        return `🗑️ Delete ho gaya: ${args.path}`;
      }

      case 'run_command': {
        return new Promise((resolve) => {
          exec(args.command, { cwd: args.cwd || '.', timeout: 30000 }, (err, stdout, stderr) => {
            const output = stdout || stderr || err?.message || 'No output';
            resolve(`💻 **Command:** \`${args.command}\`\n\n\`\`\`\n${output.slice(0, 2000)}\n\`\`\``);
          });
        });
      }

      case 'read_url': {
        try {
          const res = await axios.get(args.url, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            timeout: 10000
          });
          const cheerio = require('cheerio');
          const $ = cheerio.load(res.data);
          $('script, style, nav, footer, header').remove();
          const text = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 5000);
          return text || 'No readable text found on this page.';
        } catch(e) { return 'Error reading URL: ' + e.message; }
      }

      case 'schedule_task': {
        if (scheduledJobs[args.name]) scheduledJobs[args.name].destroy?.() || scheduledJobs[args.name].stop();

        const task = cron.schedule(args.cron, async () => {
          try {
            const response = await runJiji('scheduled', args.prompt, false);
            if (sendCallback) sendCallback(response, args.name);
          } catch (e) {
            console.error('Scheduled task error:', e.message);
          }
        }, { timezone: args.timezone || 'Asia/Kolkata' });

        scheduledJobs[args.name] = { task, cron: args.cron, prompt: args.prompt };

        return `✅ **Task schedule ho gaya!**\n📌 Name: ${args.name}\n⏰ Cron: ${args.cron}\n💬 Task: ${args.prompt}\n\n_Timezone: Asia/Kolkata_`;
      }

      case 'list_scheduled_tasks': {
        const jobs = Object.entries(scheduledJobs);
        if (!jobs.length) return '📋 Koi scheduled task nahi hai abhi.';
        return '📋 **Scheduled Tasks:**\n\n' + jobs
          .map(([name, job]) => `⏰ **${name}**\n   Cron: ${job.cron}\n   Task: ${job.prompt}`)
          .join('\n\n');
      }

      case 'cancel_task': {
        if (scheduledJobs[args.name]) {
          scheduledJobs[args.name].task?.stop();
          delete scheduledJobs[args.name];
          return `✅ Task cancel ho gaya: **${args.name}**`;
        }
        return `❌ Task nahi mila: ${args.name}`;
      }

      case 'list_files': {
        const folder = args.folder || '.';
        const items = await fs.readdir(folder).catch(() => []);
        return `📁 **${folder}:**\n${items.map(i => `  • ${i}`).join('\n') || 'Empty folder'}`;
      }

      default:
        return `❌ Unknown tool: ${name}`;
    }
  } catch (err) {
    return `❌ Tool error (${name}): ${err.message}`;
  }
}

// ━━━ MAIN AGENT LOOP ━━━━━━━━━━━━━━━━━━━━━━━━
async function runJiji(sessionId, userMessage, saveHistory = true, sendCallback = null) {
  if (!chatHistories[sessionId]) chatHistories[sessionId] = [];

  if (saveHistory) {
    chatHistories[sessionId].push({ role: 'user', content: userMessage });
  }

  const messages = [
    { role: 'system', content: JIJI_SYSTEM },
    ...chatHistories[sessionId].slice(-20)
  ];

  if (!saveHistory) {
    messages.push({ role: 'user', content: userMessage });
  }

  const VERBOSE = process.env.JIJI_VERBOSE === 'true';
  const log     = (...a) => VERBOSE && console.log(...a);
  const runLogs = [];
  const rlog    = (m) => { runLogs.push(m); log(m); };
  global.lastLogs = runLogs;

  // Pick initial model + pool
  let { model, pool, maxTokens } = selectModel(userMessage);
  rlog(`model: ${model} | tokens: ${maxTokens}`);

  let finalResponse = '...';
  let iteration = 0;

  while (iteration < 6) {
    iteration++;
    rlog(`iteration ${iteration} — ${model}`);

    let response;
    try {
      response = await ai.chat.completions.create({
        model,
        max_tokens: maxTokens,
        messages,
        tools: TOOLS,
        tool_choice: 'auto',
      });
    } catch (err) {
      const status = err?.status || err?.response?.status;
      const errMsg = (err.message || '').toLowerCase();
      const isQuota = status === 402 || status === 429 || status === 404 || status === 400
                   || errMsg.includes('quota')
                   || errMsg.includes('rate limit')
                   || errMsg.includes('unavailable')
                   || errMsg.includes('premature close')
                   || errMsg.includes('econnreset')
                   || errMsg.includes('fetch');

      if (isQuota) {
        markLimited(model);
        const next = pickModel(pool);
        if (next === model) throw err; // all limited, give up
        console.log(`[model] switching to ${next} (error ${status})`);
        model = next;
        iteration--; // retry same iteration with new model
        continue;
      }
      throw err;
    }

    const msg   = response.choices[0].message;
    const usage = response.usage;
    if (usage) rlog(`tokens: prompt=${usage.prompt_tokens} completion=${usage.completion_tokens}`);

    messages.push(msg);

    if (!msg.tool_calls?.length) {
      finalResponse = msg.content || 'Done!';
      rlog(`done (${finalResponse.length} chars)`);
      break;
    }

    rlog(`tool calls: ${msg.tool_calls.length}`);
    for (const tc of msg.tool_calls) {
      let args;
      try { args = JSON.parse(tc.function.arguments); } catch { args = {}; }

      rlog(`  tool: ${tc.function.name}(${JSON.stringify(args).slice(0, 60)})`);
      const t0     = Date.now();
      const result = await executeTool(tc.function.name, args, sendCallback);
      rlog(`  done in ${Date.now() - t0}ms`);

      messages.push({ role: 'tool', tool_call_id: tc.id, content: String(result) });
    }
  }

  if (saveHistory) {
    chatHistories[sessionId].push({ role: 'assistant', content: finalResponse });
    if (chatHistories[sessionId].length > 50)
      chatHistories[sessionId] = chatHistories[sessionId].slice(-50);
  }

  return finalResponse;
}

function clearHistory(sessionId) {
  chatHistories[sessionId] = [];
}

function getHistory(sessionId) {
  return chatHistories[sessionId] || [];
}

module.exports = { runJiji, clearHistory, getHistory };
