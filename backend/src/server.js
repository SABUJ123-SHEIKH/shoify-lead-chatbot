require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const { URL } = require('url');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-strong-password';
const defaultSiteUrl = process.env.SITE_URL || process.env.SHOP_URL || process.env.SHOP_NAME || '';

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: allowedOrigin === '*' ? true : allowedOrigin }));
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));
app.use('/widget', express.static(__dirname + '/../public', { setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin') }));

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Basic ') ? auth.slice(6) : '';
  const [user, pass] = Buffer.from(token, 'base64').toString().split(':');
  if (user === adminUser && pass === adminPassword) return next();
  res.set('WWW-Authenticate', 'Basic realm="Smart Chatbot Admin"');
  return res.status(401).send('Login required');
}
function normalizeUrl(input) {
  if (!input) return '';
  let value = String(input).trim();
  if (!/^https?:\/\//i.test(value)) value = 'https://' + value;
  try { const u = new URL(value); return u.origin; } catch { return ''; }
}
function getSetting(key, fallback = '') {
  return new Promise((resolve) => db.get('SELECT value FROM app_settings WHERE key=?', [key], (err, row) => resolve(row ? row.value : fallback)));
}
function setSetting(key, value) {
  return new Promise((resolve, reject) => db.run('INSERT INTO app_settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [key, value], (err) => err ? reject(err) : resolve()));
}
function dbAll(sql, params = []) { return new Promise((resolve) => db.all(sql, params, (err, rows) => resolve(err ? [] : rows))); }
function dbRun(sql, params = []) { return new Promise((resolve, reject) => db.run(sql, params, function(err){ err ? reject(err) : resolve(this); })); }
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12000);
  try {
    const res = await fetch(url, { signal: controller.signal, headers: { 'User-Agent': 'SmartLeadChatbot/1.0' } });
    if (!res.ok) return '';
    const ct = res.headers.get('content-type') || '';
    if (!ct.includes('text') && !ct.includes('xml') && !ct.includes('html')) return '';
    return await res.text();
  } catch { return ''; } finally { clearTimeout(timer); }
}
function stripHtml(html = '') {
  return html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}
function pick(regex, text) { const m = text.match(regex); return m ? (m[1] || '').trim() : ''; }
function extractPage(url, html) {
  const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i, html) || pick(/<title[^>]*>([^<]+)/i, html) || pick(/<h1[^>]*>([\s\S]*?)<\/h1>/i, html);
  const price = pick(/<meta[^>]+property=["']product:price:amount["'][^>]+content=["']([^"']+)/i, html) || pick(/"price"\s*:\s*"?([0-9.,]+)/i, html) || pick(/([0-9][0-9\.,]{2,})\s*(?:kr|dkk)/i, html);
  const image = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i, html);
  const clean = stripHtml(html).slice(0, 3500);
  let type = 'page';
  const lower = url.toLowerCase();
  if (lower.includes('/products/')) type = 'product';
  if (lower.includes('/collections/')) type = 'collection';
  const keywords = (title + ' ' + clean).toLowerCase().slice(0, 5000);
  return { title: stripHtml(title).slice(0, 220), price: price.slice(0, 80), image, type, content: clean, keywords };
}
async function crawlSite(siteUrl, maxPages = 80) {
  const origin = normalizeUrl(siteUrl);
  if (!origin) throw new Error('Invalid website URL');
  await setSetting('site_url', origin);
  const sitemapUrls = [`${origin}/sitemap.xml`, `${origin}/sitemap_products_1.xml`, `${origin}/sitemap_pages_1.xml`, `${origin}/sitemap_collections_1.xml`];
  const found = new Set();
  for (const sm of sitemapUrls) {
    const xml = await fetchText(sm);
    (xml.match(/<loc>(.*?)<\/loc>/g) || []).forEach(x => {
      const u = x.replace(/<\/?loc>/g, '').trim();
      if (u.startsWith(origin)) found.add(u);
    });
  }
  if (!found.size) found.add(origin);
  const urls = Array.from(found).filter(u => !/\.(jpg|jpeg|png|gif|webp|pdf|zip)$/i.test(u)).slice(0, Number(maxPages) || 80);
  let saved = 0;
  for (const url of urls) {
    const html = await fetchText(url);
    if (!html || !/<html|<title|<body/i.test(html)) continue;
    const p = extractPage(url, html);
    if (!p.title && !p.content) continue;
    const id = crypto.createHash('md5').update(url).digest('hex');
    await dbRun(`INSERT INTO site_pages(id,url,title,price,image,type,content,keywords,updated_at)
      VALUES(?,?,?,?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(url) DO UPDATE SET title=excluded.title,price=excluded.price,image=excluded.image,type=excluded.type,content=excluded.content,keywords=excluded.keywords,updated_at=CURRENT_TIMESTAMP`,
      [id, url, p.title, p.price, p.image, p.type, p.content, p.keywords]);
    saved++;
  }
  return { origin, scanned: urls.length, saved };
}
function scorePage(page, terms) {
  const hay = ((page.title || '') + ' ' + (page.keywords || '') + ' ' + (page.url || '')).toLowerCase();
  let score = 0;
  for (const t of terms) if (t.length > 2 && hay.includes(t)) score += 2;
  if (page.type === 'product') score += 2;
  if (page.type === 'collection') score += 1;
  return score;
}
async function smartReply(message = '') {
  const msg = String(message || '').toLowerCase();
  const synonyms = {
    desk: ['desk','desks','bord','skrivebord','table','hæve','haeve','height','adjustable','sænkebord','saenkebord'],
    chair: ['chair','chairs','stol','kontorstol','office chair'],
    meeting: ['meeting','conference','møde','moede','mødebord','moedebord'],
    cheap: ['cheap','billig','budget','affordable','price','rate','offer','tilbud'],
  };
  let terms = msg.split(/[^a-zA-Z0-9æøåÆØÅ]+/).filter(Boolean);
  for (const group of Object.values(synonyms)) if (group.some(w => msg.includes(w))) terms = terms.concat(group);
  const rows = await dbAll('SELECT * FROM site_pages ORDER BY updated_at DESC LIMIT 500');
  const matches = rows.map(r => ({ ...r, _score: scorePage(r, terms) })).filter(r => r._score > 0).sort((a,b) => b._score - a._score).slice(0, 4);
  const siteUrl = await getSetting('site_url', defaultSiteUrl);
  if (matches.length) {
    const items = matches.map((p, i) => `${i+1}. ${p.title || 'Product/page'}${p.price ? ` – ${p.price} kr` : ''}\n${p.url}`).join('\n\n');
    return `I found these matching options:\n\n${items}\n\nSend your phone/email below and we can send the best offer.`;
  }
  return `I can search this website for products, prices and links. Try writing product type + size + budget, for example: “height-adjustable desk 180x80 budget 1500”.${siteUrl ? `\n\nWebsite: ${siteUrl}` : ''}`;
}

app.get('/', (req, res) => res.send('Smart lead chatbot is running. Open /health or /admin/leads'));
app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/chat', async (req, res) => {
  const { leadId, message } = req.body || {};
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Message is required.' });
  const currentLeadId = leadId || uuidv4();
  const reply = await smartReply(message);
  db.run(`INSERT OR IGNORE INTO leads (id, source_page, message) VALUES (?, ?, ?)`, [currentLeadId, req.headers.referer || '', message]);
  db.run(`INSERT INTO chat_messages (id, lead_id, sender, message) VALUES (?, ?, ?, ?)`, [uuidv4(), currentLeadId, 'customer', message]);
  db.run(`INSERT INTO chat_messages (id, lead_id, sender, message) VALUES (?, ?, ?, ?)`, [uuidv4(), currentLeadId, 'bot', reply]);
  res.json({ leadId: currentLeadId, reply });
});

app.post('/api/leads', (req, res) => {
  const id = req.body.leadId || uuidv4();
  const data = { name:req.body.name||'', email:req.body.email||'', phone:req.body.phone||'', company:req.body.company||'', product_interest:req.body.productInterest||'', budget:req.body.budget||'', message:req.body.message||'', source_page:req.body.sourcePage||req.headers.referer||'' };
  if (!data.phone && !data.email) return res.status(400).json({ error: 'Phone or email is required.' });
  db.run(`INSERT INTO leads (id,name,email,phone,company,product_interest,budget,message,source_page) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,company=excluded.company,product_interest=excluded.product_interest,budget=excluded.budget,message=excluded.message,source_page=excluded.source_page`,
    [id,data.name,data.email,data.phone,data.company,data.product_interest,data.budget,data.message,data.source_page], (err) => {
      if (err) return res.status(500).json({ error: 'Could not save lead.' });
      const waText = encodeURIComponent(`New website lead\nName: ${data.name}\nPhone: ${data.phone}\nProduct: ${data.product_interest}\nBudget: ${data.budget}\nMessage: ${data.message}`);
      res.json({ ok:true, leadId:id, whatsappUrl: whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${waText}` : '' });
    });
});

app.get('/admin/leads', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 200`, [], (err, rows=[]) => {
    const htmlRows = rows.map(l => `<tr><td>${escapeHtml(l.created_at)}</td><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.phone)}</td><td>${escapeHtml(l.email)}</td><td>${escapeHtml(l.company)}</td><td>${escapeHtml(l.product_interest)}</td><td>${escapeHtml(l.budget)}</td><td>${escapeHtml(l.message)}</td><td>${escapeHtml(l.source_page)}</td></tr>`).join('');
    res.send(`<!doctype html><html><head><title>Lead Inbox</title><style>body{font-family:Arial;padding:24px;background:#f7f7f7}a{color:#111}table{border-collapse:collapse;width:100%;background:#fff}td,th{border:1px solid #ddd;padding:10px;font-size:13px}th{background:#111;color:#fff}.nav a{margin-right:15px}</style></head><body><div class="nav"><a href="/admin/crawl">Crawl website</a><a href="/admin/pages">Knowledge base</a></div><h1>Lead Inbox</h1><table><tr><th>Date</th><th>Name</th><th>Phone</th><th>Email</th><th>Company</th><th>Interest</th><th>Budget</th><th>Message</th><th>Source</th></tr>${htmlRows}</table></body></html>`);
  });
});
app.get('/admin/crawl', requireAdmin, async (req, res) => {
  const site = await getSetting('site_url', defaultSiteUrl);
  res.send(`<!doctype html><html><head><title>Crawl website</title><style>body{font-family:Arial;padding:24px;max-width:760px}input{width:100%;padding:12px;margin:10px 0}button{background:#111;color:#fff;border:0;padding:12px 18px;border-radius:8px}</style></head><body><h1>Scan website data</h1><p>Paste any website URL. The bot will read sitemap/pages/products and save titles, price text and links.</p><form method="post" action="/admin/crawl"><input name="siteUrl" value="${escapeHtml(site)}" placeholder="https://www.arnehus.dk"><input name="maxPages" value="80"><button>Scan now</button></form><p><a href="/admin/leads">Back to leads</a> · <a href="/admin/pages">View knowledge base</a></p></body></html>`);
});
app.post('/admin/crawl', requireAdmin, async (req, res) => {
  try { const result = await crawlSite(req.body.siteUrl, req.body.maxPages || 80); res.send(`<p>Done. Website: ${escapeHtml(result.origin)}. Scanned: ${result.scanned}. Saved: ${result.saved}.</p><p><a href="/admin/pages">View pages</a> · <a href="/admin/crawl">Scan again</a></p>`); }
  catch(e) { res.status(500).send(`Crawl failed: ${escapeHtml(e.message)} <p><a href="/admin/crawl">Back</a></p>`); }
});
app.get('/admin/pages', requireAdmin, (req, res) => {
  db.all('SELECT title,price,type,url,updated_at FROM site_pages ORDER BY updated_at DESC LIMIT 300', [], (err, rows=[]) => {
    const htmlRows = rows.map(p => `<tr><td>${escapeHtml(p.type)}</td><td>${escapeHtml(p.title)}</td><td>${escapeHtml(p.price)}</td><td><a href="${escapeHtml(p.url)}" target="_blank">open</a></td><td>${escapeHtml(p.updated_at)}</td></tr>`).join('');
    res.send(`<!doctype html><html><head><title>Knowledge Base</title><style>body{font-family:Arial;padding:24px;background:#f7f7f7}table{border-collapse:collapse;width:100%;background:#fff}td,th{border:1px solid #ddd;padding:10px;font-size:13px}th{background:#111;color:#fff}</style></head><body><h1>Knowledge Base</h1><p><a href="/admin/crawl">Scan website</a> · <a href="/admin/leads">Leads</a></p><table><tr><th>Type</th><th>Title</th><th>Price</th><th>URL</th><th>Updated</th></tr>${htmlRows}</table></body></html>`);
  });
});

app.listen(PORT, () => console.log(`Smart lead chatbot running on port ${PORT}`));
