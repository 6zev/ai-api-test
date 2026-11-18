/* ══════════════════════════════════════════════════════════════════
   API TESTER — openai chat / openai responses / gemini / anthropic
   Single-page, no build step, no dependency.
   ══════════════════════════════════════════════════════════════════ */
'use strict';

/* ───────────────────────────── STATE ───────────────────────────── */
const S = {
  type: 'openai-chat',
  baseUrl: '',
  apiKey: '',
  proxy: 'auto',
  proxyCustom: '',
  models: [],          // [{id, raw, source}]
  model: '',
  modelMeta: null,
  caps: {},            // type -> 'yes'|'no'|'maybe'|null
  busy: false,
};

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];
const LS = 'api-tester.v1';

/* ─────────────────────────── TYPES ─────────────────────────────── */
const TYPES = {
  'openai-chat': {
    label: 'OpenAI Chat',
    path: '/chat/completions',
    modelsPath: '/models',
    auth: (k) => ({ Authorization: 'Bearer ' + k }),
    hint: 'Chuẩn phổ biến nhất. Dùng cho OpenAI, OpenRouter, DeepSeek, Groq, xAI, Together, Mistral, vLLM…',
  },
  'openai-responses': {
    label: 'OpenAI Responses',
    path: '/responses',
    modelsPath: '/models',
    auth: (k) => ({ Authorization: 'Bearer ' + k }),
    hint: 'API mới của OpenAI (/v1/responses). Không phải server nào cũng hỗ trợ.',
  },
  gemini: {
    label: 'Gemini',
    path: '/models/{model}:generateContent',
    modelsPath: '/models',
    auth: (k) => ({ 'x-goog-api-key': k }),
    hint: 'Google Generative Language API. Base thường là …/v1beta — key đi qua header x-goog-api-key.',
  },
  anthropic: {
    label: 'Anthropic',
    path: '/messages',
    modelsPath: '/models',
    auth: (k) => ({
      'x-api-key': k,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    }),
    hint: 'Anthropic Messages API. Cần header anthropic-version. Key đi qua x-api-key.',
  },
};

/* ─────────────────────────── HELPERS ───────────────────────────── */
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast show ' + kind;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (t.className = 'toast ' + kind), 2600);
}

function setStatus(msg, kind = '') {
  const el = $('#status');
  el.className = 'status ' + kind;
  el.textContent = msg;
}

function out(text, kind = '') {
  const el = $('#output');
  el.innerHTML = '';
  const span = document.createElement('span');
  if (kind) span.className = kind;
  span.textContent = text;
  el.appendChild(span);
  el.scrollTop = 0;
}

function outAppend(text) {
  $('#output').appendChild(document.createTextNode(text));
  $('#output').scrollTop = $('#output').scrollHeight;
}

/** Chuẩn hoá base URL: bỏ path endpoint đã lỡ dán kèm, bỏ '/' cuối. */
function normalizeBase(raw) {
  let u = (raw || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  u = u.replace(/\/+$/, '');
  const cut = [
    '/chat/completions', '/completions', '/responses', '/messages',
    '/models', '/embeddings', ':generateContent', ':streamGenerateContent',
  ];
  for (const c of cut) {
    const i = u.toLowerCase().lastIndexOf(c.toLowerCase());
    if (i > 0) { u = u.slice(0, i); break; }
  }
  return u.replace(/\/+$/, '');
}

/** Chuẩn hoá base URL cho Gemini: thêm /v1beta nếu thiếu version. */
function geminiBase(raw) {
  let u = normalizeBase(raw);
  if (!u) return '';
  if (!/\/v\d+(alpha|beta)?\d*$/i.test(u)) u += '/v1beta';
  return u;
}

function baseFor(type) {
  return type === 'gemini' ? geminiBase(S.baseUrl) : normalizeBase(S.baseUrl);
}

/** Build URL cuối cùng, kèm proxy nếu chọn. */
const PROXIES = {
  corsproxy: (u) => 'https://corsproxy.io/?url=' + encodeURIComponent(u),
  allorigins: (u) => 'https://api.allorigins.win/raw?url=' + encodeURIComponent(u),
  corsis: (u) => 'https://cors.isomorphic-git.org/' + u,
  codetabs: (u) => 'https://api.codetabs.com/v1/proxy?quest=' + encodeURIComponent(u),
  thingproxy: (u) => 'https://thingproxy.freeboard.io/fetch/' + u,
  corsworkers: (u) => 'https://test.cors.workers.dev/?' + u,
  custom: (u) => {
    const tpl = (S.proxyCustom || '').trim();
    if (!tpl) return u;
    return tpl.includes('{url}') ? tpl.replace('{url}', encodeURIComponent(u)) : tpl + encodeURIComponent(u);
  },
};

/** Danh sách proxy sẽ thử theo thứ tự. 'auto' = thử direct rồi lần lượt các proxy công khai. */
function proxyChain() {
  if (S.proxy === 'auto') {
    return ['none', 'corsproxy', 'allorigins', 'codetabs', 'corsis', 'corsworkers', 'thingproxy'];
  }
  return [S.proxy];
}

function buildUrl(target, proxyKey = S.proxy) {
  const fn = PROXIES[proxyKey];
  return fn ? fn(target) : target;
}

function headersFor(type, extra = {}) {
  const h = { 'Content-Type': 'application/json', ...extra };
  if (S.apiKey) Object.assign(h, TYPES[type].auth(S.apiKey));
  return h;
}

const fmtMs = (ms) => (ms < 1000 ? Math.round(ms) + ' ms' : (ms / 1000).toFixed(2) + ' s');
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ─────────────────────── BODY BUILDERS ─────────────────────────── */
function buildBody(type, model, prompt, maxTok, stream) {
  if (type === 'openai-chat') {
    return {
      model, stream,
      messages: [{ role: 'user', content: prompt }],
      ...(maxTok ? { max_tokens: maxTok } : {}),
    };
  }
  if (type === 'openai-responses') {
    return {
      model, stream,
      input: prompt,
      ...(maxTok ? { max_output_tokens: maxTok } : {}),
    };
  }
  if (type === 'gemini') {
    const b = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      ...(maxTok ? { generationConfig: { maxOutputTokens: maxTok } } : {}),
    };
    if (stream) b.stream = true;
    return b;
  }
  if (type === 'anthropic') {
    return {
      model, stream,
      max_tokens: maxTok || 1024,
      messages: [{ role: 'user', content: prompt }],
    };
  }
  throw new Error('unknown type');
}

function endpointFor(type, model, stream = false) {
  const b = baseFor(type);
  if (type === 'gemini') {
    const action = stream ? 'streamGenerateContent' : 'generateContent';
    return `${b}/models/${encodeURIComponent(model)}:${action}`;
  }
  return b + TYPES[type].path;
}

/* ──────────────────── SSE / STREAM PARSING ─────────────────────── */
/**
 * Đọc SSE stream, gọi onEvent(dataStr) cho mỗi "data: ..." và trả full text + usage.
 */
async function consumeStream(res, type, onText) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  let text = '';
  let usage = null;
  let done = false;

  const handle = (payload) => {
    if (payload === '[DONE]') { done = true; return; }
    let j;
    try { j = JSON.parse(payload); } catch { return; }

    if (type === 'openai-chat') {
      const d = j.choices?.[0]?.delta?.content;
      if (typeof d === 'string') { text += d; onText(d); }
      if (j.usage) usage = j.usage;
    } else if (type === 'openai-responses') {
      const ev = j.type;
      if (ev === 'response.output_text.delta' && typeof j.delta === 'string') { text += j.delta; onText(j.delta); }
      if (ev === 'response.completed' && j.response?.usage) usage = j.response.usage;
    } else if (type === 'anthropic') {
      if (j.type === 'content_block_delta' && j.delta?.type === 'text_delta') {
        text += j.delta.text; onText(j.delta.text);
      }
      if (j.type === 'message_start' && j.message?.usage) usage = { ...j.message.usage };
      if (j.type === 'message_delta' && j.usage) usage = { ...(usage || {}), ...j.usage };
      if (j.type === 'message_stop') done = true;
    } else if (type === 'gemini') {
      const parts = j.candidates?.[0]?.content?.parts || [];
      for (const p of parts) if (typeof p.text === 'string') { text += p.text; onText(p.text); }
      if (j.usageMetadata) usage = j.usageMetadata;
    }
  };

  while (!done) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      const l = line.trim();
      if (!l || l.startsWith(':')) continue;
      if (l.startsWith('data:')) handle(l.slice(5).trim());
    }
  }
  return { text, usage };
}

/** Non-stream: parse full JSON → text + usage. */
function parseFull(json, type) {
  let text = '', usage = null;
  if (type === 'openai-chat') {
    text = json.choices?.[0]?.message?.content ?? '';
    usage = json.usage || null;
  } else if (type === 'openai-responses') {
    text = json.output_text
      ?? (json.output || []).flatMap((o) => o.content || []).filter((c) => c.type === 'output_text').map((c) => c.text).join('')
      ?? '';
    usage = json.usage || null;
  } else if (type === 'gemini') {
    text = (json.candidates?.[0]?.content?.parts || []).map((p) => p.text || '').join('');
    usage = json.usageMetadata || null;
  } else if (type === 'anthropic') {
    text = (json.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
    usage = json.usage || null;
  }
  return { text, usage };
}

function tokensFrom(usage, type) {
  if (!usage) return null;
  const inTok = usage.prompt_tokens ?? usage.input_tokens ?? usage.promptTokenCount ?? null;
  const outTok = usage.completion_tokens ?? usage.output_tokens ?? usage.candidatesTokenCount ?? null;
  return { in: inTok, out: outTok };
}

/* ─────────────────────────── FETCH WRAPPER ─────────────────────── */
const PROXY_TIMEOUT = 8000;

/** fetch có timeout — proxy công khai hay treo, không được để cả UI đứng. */
async function fetchWithTimeout(url, opts, ms) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ac.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function apiFetch(url, opts = {}) {
  const chain = proxyChain();
  const started = performance.now();
  const fails = [];

  for (const key of chain) {
    const finalUrl = buildUrl(url, key);
    const t0 = performance.now();
    try {
      const res = await fetchWithTimeout(finalUrl, opts, chain.length > 1 ? PROXY_TIMEOUT : 60000);
      // Proxy công khai hay trả trang lỗi HTML / JSON lạ với status lạ — coi là chết, thử tiếp.
      const ct = res.headers.get('content-type') || '';
      const dead = !res.ok && (res.status >= 500 || res.status === 429 || ct.includes('text/html'));
      if (dead && chain.length > 1 && key !== chain[chain.length - 1]) {
        fails.push(`${key}: HTTP ${res.status}`);
        continue;
      }
      S.lastProxy = key;
      return res;
    } catch (e) {
      const reason = e.name === 'AbortError' ? `timeout ${PROXY_TIMEOUT}ms` : e.message;
      fails.push(`${key}: ${reason}`);
    }
    void t0;
  }

  const t = (performance.now() - started) | 0;
  throw Object.assign(new Error(
    `Network/CORS error sau ${fmtMs(t)} — không tới được server qua ${chain.length} đường.\n` +
    fails.map((f) => '  ✗ ' + f).join('\n') + '\n' +
    `→ Kiểm tra Base URL, hoặc chọn CORS Proxy khác / nhập proxy riêng.`
  ), { kind: 'network', ms: t });
}

async function readErr(res) {
  let body = '';
  try { body = await res.text(); } catch { /* ignore */ }
  let msg = body;
  try {
    const j = JSON.parse(body);
    msg = j.error?.message || j.error?.type || j.message || j.detail || body;
  } catch { /* keep raw */ }
  return { status: res.status, msg: String(msg || res.statusText).slice(0, 800) };
}

/* ══════════════════════ CAPABILITY CHECK ════════════════════════ */
async function probeType(type, model) {
  const modelToUse = model || (await guessModelFor(type));
  if (!modelToUse) return { ok: false, status: 0, msg: 'không có model để thử' };

  const url = endpointFor(type, modelToUse, false);
  const body = buildBody(type, modelToUse, 'ping', 8, false);

  let res;
  try {
    res = await apiFetch(url, {
      method: 'POST',
      headers: headersFor(type),
      body: JSON.stringify(body),
    });
  } catch (e) {
    return { ok: false, status: 0, msg: 'network/CORS', detail: e.message };
  }

  if (res.ok) {
    let j = {};
    try { j = await res.json(); } catch { /* ignore */ }
    const hasShape =
      (type === 'openai-chat' && Array.isArray(j.choices)) ||
      (type === 'openai-responses' && (j.object === 'response' || Array.isArray(j.output))) ||
      (type === 'gemini' && Array.isArray(j.candidates)) ||
      (type === 'anthropic' && Array.isArray(j.content));
    return hasShape
      ? { ok: true, status: res.status, msg: 'OK', model: modelToUse }
      : { ok: false, status: res.status, msg: '200 nhưng response sai shape', model: modelToUse };
  }

  const { status, msg } = await readErr(res);
  // 400 kiểu "model không hỗ trợ endpoint này" → endpoint sống nhưng model sai
  // 400/422/4096: endpoint sống nhưng body/model không hợp (vd Gemini sai model → 404
  // hoặc proxy kiểu Cloudflare trả 4096) — vẫn tính là "có chuẩn"
  const endpointAlive = status === 400 || status === 422 || status === 4096;
  return { ok: false, status, msg, model: modelToUse, partial: endpointAlive };
}

/** Đoán model phù hợp theo type để probe (dựa trên model đang chọn / list đã fetch). */
async function guessModelFor(type) {
  const want = {
    'openai-chat': /^(gpt-|o\d|claude|gemini|deepseek|llama|mistral|qwen|grok|glm|kimi)/i,
    'openai-responses': /^(gpt-5|gpt-4\.1|o\d|o3|o4)/i,
    gemini: /gemini/i,
    anthropic: /claude/i,
  }[type];
  const pick = (list) => list.find((m) => want.test(m.id));
  if (S.model && want?.test(S.model)) return S.model;
  if (pick(S.models)) return pick(S.models).id;
  if (S.model) return S.model;
  const fallback = {
    'openai-chat': 'gpt-4o-mini',
    'openai-responses': 'gpt-4.1-mini',
    gemini: 'gemini-2.0-flash',
    anthropic: 'claude-3-5-haiku-latest',
  }[type];
  return fallback;
}

function setCap(type, state, note) {
  const el = $(`.cap[data-cap="${type}"]`);
  if (!el) return;
  el.className = 'cap ' + (state || '');
  const em = el.querySelector('em');
  const dot = el.querySelector('.dot');
  dot.classList.remove('spin');
  em.textContent = note || (state === 'yes' ? 'OK' : state === 'no' ? 'không' : state === 'maybe' ? 'endpoint sống' : 'chưa check');
}

async function checkAll() {
  if (S.busy) return;
  if (!normalizeBase(S.baseUrl)) return toast('Nhập Base URL trước', 'bad');
  S.busy = true;
  $('#btn-check').disabled = true;
  $('#capsSummary').className = 'hint';
  $('#capsSummary').textContent = 'Đang probe 4 chuẩn…';

  for (const t of Object.keys(TYPES)) {
    setCap(t, null, '…');
    $(`.cap[data-cap="${t}"] .dot`).classList.add('spin');
  }
  await new Promise((r) => setTimeout(r, 16));

  const results = {};
  await Promise.all(Object.keys(TYPES).map(async (t) => {
    const r = await probeType(t);
    results[t] = r;
    if (r.ok) setCap(t, 'yes', 'OK ' + r.status);
    else if (r.partial) setCap(t, 'maybe', r.status + ' model?');
    else if (r.status === 401 || r.status === 403) setCap(t, 'maybe', 'key?');
    else if (r.status === 404 || r.status === 405) setCap(t, 'no', String(r.status));
    else if (r.status === 0) setCap(t, 'no', 'CORS');
    else setCap(t, 'no', String(r.status));
  }));

  S.busy = false;
  $('#btn-check').disabled = false;

  const okList = Object.entries(results).filter(([, r]) => r.ok).map(([t]) => TYPES[t].label);
  const aliveList = Object.entries(results).filter(([, r]) => r.partial || r.status === 401 || r.status === 403).map(([t]) => TYPES[t].label);

  if (okList.length) {
    $('#capsSummary').className = 'hint ok';
    $('#capsSummary').textContent = '✔ Hỗ trợ: ' + okList.join(' · ');
    // auto-switch sang chuẩn chạy được nếu chuẩn hiện tại không chạy
    if (!results[S.type]?.ok && okList.length) {
      const first = Object.entries(results).find(([, r]) => r.ok)[0];
      selectType(first);
      toast('Tự chuyển sang ' + TYPES[first].label, 'ok');
    }
  } else if (aliveList.length) {
    $('#capsSummary').className = 'hint';
    $('#capsSummary').textContent = '~ Endpoint sống nhưng lỗi auth/model: ' + aliveList.join(' · ');
  } else {
    $('#capsSummary').className = 'hint bad';
    $('#capsSummary').textContent = '✘ Không chuẩn nào phản hồi. Kiểm tra URL / key / CORS proxy.';
  }

  // đổ detail lỗi ra output
  const lines = Object.entries(results).map(([t, r]) => {
    const tag = r.ok ? '✔' : r.partial ? '~' : '✘';
    return `${tag} ${TYPES[t].label.padEnd(18)} ${r.status || '—'}  ${r.model || ''}  ${r.msg || ''}`;
  });
  out(lines.join('\n'), '');
}

/* ═══════════════════════ FETCH MODELS ═══════════════════════════ */
async function fetchModels() {
  if (S.busy) return;
  if (!normalizeBase(S.baseUrl)) return toast('Nhập Base URL trước', 'bad');

  S.busy = true;
  $('#btn-models').disabled = true;
  toast('Đang lấy danh sách model…');

  const tried = [];
  const attempt = async (type) => {
    const b = baseFor(type);
    const url = b + '/models';
    let res;
    try {
      res = await apiFetch(url, { method: 'GET', headers: headersFor(type) });
    } catch (e) {
      tried.push({ type, status: 'net/CORS' });
      return null;
    }
    tried.push({ type, status: res.status });
    if (!res.ok) return null;
    const j = await res.json().catch(() => null);
    if (!j) return null;

    let arr = null;
    if (Array.isArray(j.data)) arr = j.data.map((m) => ({ id: m.id || m.name, raw: m }));
    else if (Array.isArray(j.models)) arr = j.models.map((m) => ({ id: m.id || m.name || (m.name || '').split('/').pop(), raw: m }));
    else if (Array.isArray(j)) arr = j.map((m) => ({ id: m.id || m.name, raw: m }));
    if (!arr) return null;
    return arr.filter((m) => m.id).map((m) => ({ ...m, source: type }));
  };

  // ưu tiên type đang chọn, rồi các type còn lại
  const order = [S.type, ...Object.keys(TYPES).filter((t) => t !== S.type)];
  let list = null, usedType = null;
  for (const t of order) {
    list = await attempt(t);
    if (list && list.length) { usedType = t; break; }
  }

  S.busy = false;
  $('#btn-models').disabled = false;

  if (!list || !list.length) {
    $('#connState').className = 'hint bad';
    $('#connState').textContent = '✘ Không lấy được model list (' + tried.map((t) => t.type + ':' + t.status).join(' · ') + '). Nhập tay model id bên phải.';
    out('Fetch model thất bại\n' + tried.map((t) => `  ${TYPES[t.type].label.padEnd(18)} ${t.status}`).join('\n'), 'e');
    toast('Fetch model thất bại', 'bad');
    return;
  }

  // Gemini trả name dạng "models/gemini-2.0-flash" → cắt tiền tố
  S.models = list.map((m) => ({ ...m, id: m.id.replace(/^models\//, '') }));
  $('#connState').className = 'hint ok';
  $('#connState').textContent = `✔ ${S.models.length} model (qua ${TYPES[usedType].label})`;
  renderModels();
  toast(S.models.length + ' model', 'ok');

  // tự chọn model đầu tiên phù hợp nếu chưa chọn gì
  if (!S.model) {
    const first = S.models.find((m) => !/embed|whisper|tts|dall|moderation|rerank|image/i.test(m.id)) || S.models[0];
    if (first) selectModel(first.id);
  }
}

/* ═════════════════════════ MODEL UI ═════════════════════════════ */
function renderModels() {
  const q = $('#modelSearch').value.trim().toLowerCase();
  const list = S.models.filter((m) => !q || m.id.toLowerCase().includes(q));
  const box = $('#modelList');
  $('#modelCount').textContent = list.length + '/' + S.models.length;

  if (!list.length) {
    box.innerHTML = '<div class="empty">Không khớp model nào.</div>';
    return;
  }
  const frag = document.createDocumentFragment();
  for (const m of list) {
    const d = document.createElement('div');
    d.className = 'm-item' + (m.id === S.model ? ' sel' : '');
    d.dataset.id = m.id;
    const own = m.raw?.owned_by || m.raw?.provider || '';
    d.innerHTML = `<span class="mid">${esc(m.id)}</span>${own ? `<span class="tag">${esc(own).slice(0, 18)}</span>` : ''}`;
    d.onclick = () => selectModel(m.id);
    frag.appendChild(d);
  }
  box.innerHTML = '';
  box.appendChild(frag);
}

function selectModel(id) {
  S.model = id;
  $('#activeModelName').textContent = id || '—';
  renderModels();
  renderMeta();
}

/* ═══════════════════════ METADATA PANEL ═════════════════════════ */
function renderMeta() {
  const box = $('#metaPanel');
  const m = S.models.find((x) => x.id === S.model);
  const rows = [];

  if (!S.model) {
    box.innerHTML = '<div class="meta-row"><span>Metadata</span><em>chọn 1 model để xem</em></div>';
    return;
  }

  rows.push(['Model ID', S.model]);
  if (m?.raw) {
    const r = m.raw;
    if (r.owned_by) rows.push(['Owned by', r.owned_by]);
    if (r.provider) rows.push(['Provider', r.provider]);
    if (r.created) {
      const d = new Date(r.created * 1000);
      rows.push(['Created', isNaN(d) ? String(r.created) : d.toISOString().slice(0, 10)]);
    }
    if (r.object) rows.push(['Object', r.object]);
    if (r.displayName || r.display_name) rows.push(['Display name', r.displayName || r.display_name]);
    if (r.description) rows.push(['Description', String(r.description).slice(0, 140)]);
    if (r.context_length || r.context_window || r.inputTokenLimit) {
      rows.push(['Context', (r.context_length || r.context_window || r.inputTokenLimit).toLocaleString() + ' tok']);
    }
    if (r.max_output_tokens || r.outputTokenLimit) {
      rows.push(['Max output', (r.max_output_tokens || r.outputTokenLimit).toLocaleString() + ' tok']);
    }
    if (r.pricing) {
      const p = r.pricing;
      if (p.prompt !== undefined) rows.push(['$ / 1M in', (Number(p.prompt) * 1e6).toFixed(3)]);
      if (p.completion !== undefined) rows.push(['$ / 1M out', (Number(p.completion) * 1e6).toFixed(3)]);
    }
    if (Array.isArray(r.supported_parameters) && r.supported_parameters.length) {
      rows.push(['Params', r.supported_parameters.join(', ')]);
    }
    if (r.supportedGenerationMethods) rows.push(['Methods', r.supportedGenerationMethods.join(', ')]);
    if (r.modality) rows.push(['Modality', r.modality]);
  }
  rows.push(['Source', TYPES[m?.source || S.type]?.label || '—']);
  rows.push(['Endpoint', endpointFor(S.type, S.model).replace(/^https?:\/\//, '')]);

  box.innerHTML = rows
    .map(([k, v]) => `<div class="meta-row"><span>${esc(k)}</span><em>${esc(v)}</em></div>`)
    .join('');
}

/* ═════════════════════════════ TEST ═════════════════════════════ */
async function testModel() {
  if (S.busy) return;
  if (!normalizeBase(S.baseUrl)) return toast('Nhập Base URL trước', 'bad');
  if (!S.model) return toast('Chọn model trước', 'bad');

  const prompt = $('#prompt').value || 'Say exactly: OK';
  const maxTok = $('#maxTokensChk').checked ? Number($('#maxTokens').value) || 0 : 0;
  const stream = $('#stream').checked;
  const type = S.type;

  S.busy = true;
  $('#btn-test').disabled = true;
  $('#btn-bench').disabled = true;
  setStatus('Đang gọi ' + TYPES[type].label + ' · ' + S.model + ' …', 'run');
  out('');

  const t0 = performance.now();
  let ttft = null;
  let firstByte = null;
  let text = '';
  let usage = null;
  let httpStatus = 0;

  try {
    const url = endpointFor(type, S.model, stream);
    const res = await apiFetch(url, {
      method: 'POST',
      headers: headersFor(type),
      body: JSON.stringify(buildBody(type, S.model, prompt, maxTok, stream)),
    });
    httpStatus = res.status;
    firstByte = performance.now() - t0;

    if (!res.ok) {
      const { msg } = await readErr(res);
      const total = performance.now() - t0;
      setStatus(`✘ HTTP ${res.status} · ${fmtMs(total)}`, 'err');
      out(`HTTP ${res.status}\n${msg}`, 'e');
      paintStats({ ttft: null, total, tps: null, tok: null });
      return;
    }

    const isStream = res.headers.get('content-type')?.includes('event-stream');

    if (stream && isStream) {
      const onText = (d) => {
        if (ttft === null) ttft = performance.now() - t0;
        outAppend(d);
      };
      const r = await consumeStream(res, type, onText);
      text = r.text;
      usage = r.usage;
      if (ttft === null) ttft = performance.now() - t0;
    } else {
      const j = await res.json();
      const r = parseFull(j, type);
      text = r.text; usage = r.usage;
      ttft = performance.now() - t0;
      out(text);
    }

    const total = performance.now() - t0;
    const tk = tokensFrom(usage, type);
    // tok/s = throughput generation. Stream: chia cho thời gian sinh chữ.
    // Non-stream: server trả 1 cục, chỉ còn tổng thời gian làm mẫu số.
    const genMs = stream && isStream ? Math.max(total - ttft, 1) : Math.max(total, 1);
    const tps = tk?.out && genMs > 0 ? (tk.out / (genMs / 1000)) : null;

    paintStats({ ttft, total, tps, tok: tk?.out ?? null });

    const preview = (text || '').trim();
    setStatus(
      `✔ HTTP ${httpStatus} · TTFT ${fmtMs(ttft)} · tổng ${fmtMs(total)}` +
      (tps ? ` · ${tps.toFixed(1)} tok/s` : '') +
      (preview ? '' : ' · (rỗng)'),
      preview ? 'ok' : 'err'
    );
    if (!preview) out('Response rỗng — endpoint sống nhưng không trả text. Có thể sai shape.', 'e');
  } catch (e) {
    const total = performance.now() - t0;
    setStatus('✘ ' + (e.kind === 'network' ? 'Network/CORS' : 'Lỗi') + ' · ' + fmtMs(total), 'err');
    out(e.message || String(e), 'e');
    paintStats({ ttft: null, total, tps: null, tok: null });
  } finally {
    S.busy = false;
    $('#btn-test').disabled = false;
    $('#btn-bench').disabled = false;
  }
}

function paintStats({ ttft, total, tps, tok }) {
  const set = (id, v) => {
    const el = $(id);
    el.textContent = v;
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  };
  set('#s-ttft', ttft == null ? '—' : fmtMs(ttft));
  set('#s-total', total == null ? '—' : fmtMs(total));
  set('#s-tps', tps == null ? '—' : tps.toFixed(1));
  set('#s-tok', tok == null ? '—' : String(tok));
}

async function bench() {
  if (S.busy) return;
  if (!normalizeBase(S.baseUrl)) return toast('Nhập Base URL trước', 'bad');
  if (!S.model) return toast('Chọn model trước', 'bad');
  const prompt = $('#prompt').value || 'Say exactly: OK';
  const maxTok = $('#maxTokensChk').checked ? Number($('#maxTokens').value) || 0 : 0;
  const stream = $('#stream').checked;
  const type = S.type;
  const runs = [];

  S.busy = true;
  $('#btn-test').disabled = true;
  $('#btn-bench').disabled = true;
  out('');

  for (let i = 0; i < 3; i++) {
    setStatus(`Bench ${i + 1}/3 …`, 'run');
    const t0 = performance.now();
    let ttft = null, total = null, tps = null, ok = false;
    try {
      const res = await apiFetch(endpointFor(type, S.model, stream), {
        method: 'POST',
        headers: headersFor(type),
        body: JSON.stringify(buildBody(type, S.model, prompt, maxTok, stream)),
      });
      if (!res.ok) {
        const { msg } = await readErr(res);
        outAppend(`run ${i + 1}: HTTP ${res.status} ${msg}\n`);
        runs.push({ ok: false, status: res.status });
        continue;
      }
      const isStream = res.headers.get('content-type')?.includes('event-stream');
      let usage = null;
      if (stream && isStream) {
        const r = await consumeStream(res, type, () => { if (ttft === null) ttft = performance.now() - t0; });
        usage = r.usage;
        if (ttft === null) ttft = performance.now() - t0;
      } else {
        const j = await res.json();
        usage = parseFull(j, type).usage;
        ttft = performance.now() - t0;
      }
      total = performance.now() - t0;
      const tk = tokensFrom(usage, type);
      const base = stream && isStream ? Math.max(total - ttft, 1) : Math.max(total, 1);
      tps = tk?.out ? tk.out / (base / 1000) : null;
      ok = true;
      runs.push({ ok, ttft, total, tps });
      outAppend(`run ${i + 1}: TTFT ${fmtMs(ttft)} · tổng ${fmtMs(total)}${tps ? ` · ${tps.toFixed(1)} tok/s` : ''}\n`);
    } catch (e) {
      outAppend(`run ${i + 1}: ${e.message.split('\n')[0]}\n`);
      runs.push({ ok: false, status: 0 });
    }
  }

  const good = runs.filter((r) => r.ok);
  if (good.length) {
    const avg = (k) => good.reduce((a, r) => a + r[k], 0) / good.length;
    const p = good.map((r) => r.ttft).sort((a, b) => a - b);
    paintStats({ ttft: avg('ttft'), total: avg('total'), tps: good.some((r) => r.tps) ? avg('tps') : null, tok: null });
    setStatus(`✔ ${good.length}/3 ok · TTFT tb ${fmtMs(avg('ttft'))} · min ${fmtMs(p[0])} · max ${fmtMs(p[p.length - 1])}`, 'ok');
  } else {
    setStatus('✘ Cả 3 run fail', 'err');
  }

  S.busy = false;
  $('#btn-test').disabled = false;
  $('#btn-bench').disabled = false;
}

/* ═══════════════════════════ WIRING ═════════════════════════════ */
function selectType(type) {
  S.type = type;
  $$('.type').forEach((b) => b.classList.toggle('active', b.dataset.type === type));
  $('#typeHint').textContent = TYPES[type].hint;
  renderMeta();
}

function saveState() {
  const data = {
    type: S.type, baseUrl: S.baseUrl, proxy: S.proxy, proxyCustom: S.proxyCustom,
    model: S.model, apiKey: $('#remember').checked ? S.apiKey : '',
    remember: $('#remember').checked,
  };
  try { localStorage.setItem(LS, JSON.stringify(data)); } catch { /* ignore */ }
}

function loadState() {
  let d = {};
  try { d = JSON.parse(localStorage.getItem(LS) || '{}'); } catch { /* ignore */ }
  if (d.baseUrl) { $('#baseUrl').value = d.baseUrl; S.baseUrl = d.baseUrl; }
  if (d.apiKey) { $('#apiKey').value = d.apiKey; S.apiKey = d.apiKey; }
  if (d.remember) $('#remember').checked = true;
  if (d.proxy) { $('#proxy').value = d.proxy; S.proxy = d.proxy; }
  else { $('#proxy').value = 'auto'; S.proxy = 'auto'; }
  if (d.proxyCustom) { $('#proxyCustom').value = d.proxyCustom; S.proxyCustom = d.proxyCustom; }
  if (d.proxy === 'custom') $('#proxyCustom').classList.remove('hidden');
  if (d.type && TYPES[d.type]) selectType(d.type);
  if (d.model) selectModel(d.model);
}

function init() {
  // state từ input thật (reload có thể restore value của browser mà không bắn 'input')
  loadState();
  S.baseUrl = $('#baseUrl').value || S.baseUrl;
  S.apiKey = ($('#apiKey').value || S.apiKey).trim();
  S.proxy = $('#proxy').value || S.proxy;
  S.proxyCustom = $('#proxyCustom').value || S.proxyCustom;
  $('#typeHint').textContent = TYPES[S.type].hint;

  $$('.type').forEach((b) => (b.onclick = () => { selectType(b.dataset.type); saveState(); }));

  $('#baseUrl').oninput = (e) => { S.baseUrl = e.target.value; saveState(); };
  $('#apiKey').oninput = (e) => { S.apiKey = e.target.value.trim(); saveState(); };
  $('#btn-eye').onclick = () => {
    const i = $('#apiKey');
    i.type = i.type === 'password' ? 'text' : 'password';
  };
  $('#remember').onchange = saveState;

  $('#proxy').onchange = (e) => {
    S.proxy = e.target.value;
    $('#proxyCustom').classList.toggle('hidden', S.proxy !== 'custom');
    saveState();
  };
  $('#proxyCustom').oninput = (e) => { S.proxyCustom = e.target.value; saveState(); };

  $('#modelSearch').oninput = renderModels;
  $('#btn-use-manual').onclick = () => {
    const v = $('#manualModel').value.trim();
    if (!v) return toast('Nhập model id', 'bad');
    if (!S.models.find((m) => m.id === v)) S.models.unshift({ id: v, raw: null, source: S.type });
    selectModel(v);
    saveState();
  };
  $('#manualModel').onkeydown = (e) => { if (e.key === 'Enter') $('#btn-use-manual').click(); };

  $('#btn-check').onclick = checkAll;
  $('#btn-models').onclick = fetchModels;
  $('#btn-test').onclick = testModel;
  $('#btn-bench').onclick = bench;

  $('#btn-theme').onclick = () => {
    document.body.classList.toggle('light');
    try { localStorage.setItem(LS + '.theme', document.body.classList.contains('light') ? 'light' : 'dark'); } catch { /* */ }
  };
  try { if (localStorage.getItem(LS + '.theme') === 'light') document.body.classList.add('light'); } catch { /* */ }

  $('#btn-url-help').onclick = () => $('#modal').classList.remove('hidden');
  $('#btn-modal-close').onclick = () => $('#modal').classList.add('hidden');
  $('#modal').onclick = (e) => { if (e.target.id === 'modal') $('#modal').classList.add('hidden'); };
  $$('.presets li').forEach((li) => (li.onclick = () => {
    const url = li.querySelector('code').textContent;
    $('#baseUrl').value = url; S.baseUrl = url; saveState();
    $('#modal').classList.add('hidden');
    toast('Đã điền base URL', 'ok');
  }));

  // Ctrl/Cmd+Enter = test
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); testModel(); }
  });

  renderMeta();
}

document.addEventListener('DOMContentLoaded', init);
