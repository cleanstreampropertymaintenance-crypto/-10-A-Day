const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PASSWORD = process.env.APP_PASSWORD || '';
const MAX_INBOX = 500;

fs.mkdirSync(DATA_DIR, { recursive: true });
const STATE_FILE = path.join(DATA_DIR, 'state.json');
const INBOX_FILE = path.join(DATA_DIR, 'inbox.json');

function readJson(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJson(file, value) {
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(value));
  fs.renameSync(tmp, file);
}
function authed(req) {
  return !PASSWORD || req.get('x-app-key') === PASSWORD;
}
function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}

/* Pull a lead's name / phone / event type out of whatever shape the CRM
   sends. Walks the payload for common key names so QuoteIQ can change its
   schema without breaking us; the raw payload is kept regardless. */
function findValue(obj, patterns, depth) {
  if (depth > 5 || obj == null || typeof obj !== 'object') return null;
  for (const [k, v] of Object.entries(obj)) {
    const key = k.toLowerCase().replace(/[_\s-]/g, '');
    if (patterns.includes(key) && (typeof v === 'string' || typeof v === 'number') && String(v).trim()) {
      return String(v).trim();
    }
  }
  for (const v of Object.values(obj)) {
    const found = findValue(v, patterns, depth + 1);
    if (found) return found;
  }
  return null;
}
function extractLead(raw) {
  const name =
    findValue(raw, ['customername', 'clientname', 'fullname', 'contactname', 'leadname', 'name'], 0) ||
    [findValue(raw, ['firstname'], 0), findValue(raw, ['lastname'], 0)].filter(Boolean).join(' ') || null;
  const phone = findValue(raw, ['customerphone', 'phonenumber', 'clientphone', 'contactphone', 'mobile', 'cell', 'phone'], 0);
  const eventType = findValue(raw, ['eventtype', 'event', 'type', 'topic', 'action', 'trigger'], 0);
  const email = findValue(raw, ['customeremail', 'clientemail', 'email'], 0);
  const address = findValue(raw, ['serviceaddress', 'jobaddress', 'address', 'address1'], 0);
  return { name, phone, eventType, email, address };
}

/* ── webhook receiver: accepts anything, never rejects a payload ── */
app.all(['/api/webhooks/:src', '/api/webhooks'], express.text({ type: '*/*', limit: '2mb' }), (req, res) => {
  if (req.method === 'GET' || req.method === 'HEAD') return res.json({ ok: true }); // verification pings
  let raw = {};
  if (typeof req.body === 'string' && req.body.trim()) {
    try { raw = JSON.parse(req.body); }
    catch (e) {
      try { raw = Object.fromEntries(new URLSearchParams(req.body)); }
      catch (e2) { raw = { body: req.body }; }
    }
  }
  const inbox = readJson(INBOX_FILE, []);
  const item = {
    id: uid(),
    receivedAt: new Date().toISOString(),
    channel: req.params.src || 'default',
    consumed: false,
    ...extractLead(raw),
    raw,
  };
  inbox.push(item);
  writeJson(INBOX_FILE, inbox.slice(-MAX_INBOX));
  console.log(`[webhook] ${item.channel}: ${item.eventType || 'event'} — ${item.name || 'no name found'}`);
  res.json({ ok: true, id: item.id });
});

app.use(express.json({ limit: '4mb' }));

/* ── app state sync ── */
app.get('/api/state', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  res.json({ state: readJson(STATE_FILE, null) });
});
app.put('/api/state', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  if (!req.body || !Array.isArray(req.body.sources)) return res.status(400).json({ error: 'bad state' });
  writeJson(STATE_FILE, req.body);
  res.json({ ok: true });
});

/* ── webhook inbox: client pulls new CRM events, then marks them consumed ── */
app.get('/api/inbox', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const inbox = readJson(INBOX_FILE, []);
  res.json({ events: inbox.filter(e => !e.consumed).map(({ raw, ...rest }) => rest) });
});
app.post('/api/inbox/consume', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  const ids = new Set((req.body && req.body.ids) || []);
  const inbox = readJson(INBOX_FILE, []);
  inbox.forEach(e => { if (ids.has(e.id)) e.consumed = true; });
  writeJson(INBOX_FILE, inbox);
  res.json({ ok: true });
});
/* raw payload log, for checking what the CRM actually sends */
app.get('/api/inbox/log', (req, res) => {
  if (!authed(req)) return res.status(401).json({ error: 'unauthorized' });
  res.json({ events: readJson(INBOX_FILE, []).slice(-25).reverse() });
});

/* ── the app itself (only the one file — never expose the repo dir) ── */
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/index.html', (req, res) => res.sendFile(path.join(__dirname, 'index.html')));
app.get('/healthz', (req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`Ad Budget Optimizer running on port ${PORT}, data in ${DATA_DIR}`));
