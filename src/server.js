require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const fetch = require('node-fetch');
const { pool, initDb } = require('./db');
const { crawlSite, searchKnowledge } = require('./crawler');

const app = express();
const PORT = process.env.PORT || 10000;
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';
const defaultSiteId = process.env.DEFAULT_SITE_ID || 'default';

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '300kb' }));
app.use('/widget', express.static(__dirname + '/public'));
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Basic ') ? auth.slice(6) : '';
  const [user, pass] = Buffer.from(token, 'base64').toString().split(':');
  if (user === adminUser && pass === adminPassword) return next();
  res.set('WWW-Authenticate', 'Basic realm="Smart Chatbot Admin"');
  return res.status(401).send('Login required');
}
function getSiteId(req) {
  return (req.body?.siteId || req.query.site || req.headers['x-kg-site-id'] || defaultSiteId).toString().trim();
}

async function aiAnswer(site, message, knowledge) {
  const products = knowledge.products || [];
  const pages = knowledge.pages || [];
  if (!process.env.OPENAI_API_KEY) return null;
  try {
    const productText = products.map((p, i) => `${i+1}. ${p.title} | ${p.price || ''} ${p.currency || ''} | ${p.url} | ${String(p.description || '').slice(0,300)}`).join('\n');
    const pageText = pages.map((p, i) => `${i+1}. ${p.title} | ${p.url} | ${String(p.content || '').slice(0,400)}`).join('\n');
    const prompt = `You are a professional sales chatbot for ${site.name || site.site_id}. Answer only using the provided website data. Always include relevant product/page links. Keep answer short. If no exact product, ask for phone/email for offer.\n\nCustomer: ${message}\n\nProducts:\n${productText}\n\nPages:\n${pageText}`;
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'gpt-4.1-mini', input: prompt, max_output_tokens: 350 })
    });
    const data = await r.json();
    return data.output_text || null;
  } catch (e) { console.error('OpenAI error', e.message); return null; }
}

function simpleAnswer(site, message, knowledge) {
  const products = knowledge.products || [];
  const pages = knowledge.pages || [];
  if (products.length) {
    const lines = products.slice(0, 4).map((p, i) => {
      const price = p.price ? ` – ${p.price} ${p.currency || 'DKK'}` : '';
      return `${i+1}. ${p.title}${price}\n${p.url}`;
    }).join('\n\n');
    return `I found these relevant options on ${site.name || site.website_url}:\n\n${lines}\n\nWant an exact offer? Send your phone number, budget and quantity in the form below.`;
  }
  if (pages.length) {
    return `I found related website information:\n\n${pages.map((p,i)=>`${i+1}. ${p.title}\n${p.url}`).join('\n\n')}\n\nTell me product type, size and budget, then I can search more accurately.`;
  }
  return `I do not have enough website data for this question yet. Please ask the store owner to scan this site in /admin/crawl?site=${site.site_id}. You can still send your phone/email and product request for an offer.`;
}

app.get('/', (req, res) => res.send('Smart Multisite Shopify Chatbot is running.'));
app.get('/health', async (req, res) => {
  const sites = await pool.query('SELECT COUNT(*)::int AS count FROM sites').catch(() => ({ rows:[{count:0}] }));
  const products = await pool.query('SELECT COUNT(*)::int AS count FROM products').catch(() => ({ rows:[{count:0}] }));
  res.json({ ok: true, sites: sites.rows[0].count, products: products.rows[0].count });
});

app.get('/admin/sites', requireAdmin, async (req, res) => {
  const rows = (await pool.query('SELECT * FROM sites ORDER BY created_at DESC')).rows;
  const list = rows.map(s => `<tr><td>${escapeHtml(s.site_id)}</td><td>${escapeHtml(s.name)}</td><td>${escapeHtml(s.website_url)}</td><td><a href="/admin/crawl?site=${encodeURIComponent(s.site_id)}">crawl</a></td><td><a href="/admin/products?site=${encodeURIComponent(s.site_id)}">products</a></td><td><a href="/admin/leads?site=${encodeURIComponent(s.site_id)}">leads</a></td></tr>`).join('');
  res.send(`<!doctype html><html><body style="font-family:Arial;padding:24px"><h1>Sites</h1><form method="post" action="/admin/sites"><input name="site_id" placeholder="site_id e.g. arnehus" required><input name="name" placeholder="Name"><input name="website_url" placeholder="https://www.site.dk" required><input name="whatsapp_number" placeholder="45..."><button>Add/Update site</button></form><hr><table border="1" cellpadding="8"><tr><th>ID</th><th>Name</th><th>URL</th><th>Crawl</th><th>Products</th><th>Leads</th></tr>${list}</table></body></html>`);
});
app.use(express.urlencoded({ extended: true }));
app.post('/admin/sites', requireAdmin, async (req, res) => {
  const { site_id, name, website_url, whatsapp_number } = req.body;
  await pool.query(`INSERT INTO sites (site_id,name,website_url,whatsapp_number) VALUES ($1,$2,$3,$4) ON CONFLICT (site_id) DO UPDATE SET name=EXCLUDED.name, website_url=EXCLUDED.website_url, whatsapp_number=EXCLUDED.whatsapp_number`, [site_id, name || site_id, website_url, whatsapp_number || '']);
  res.redirect('/admin/sites');
});
app.get('/admin/crawl', requireAdmin, async (req, res) => {
  const site = req.query.site || defaultSiteId;
  res.send(`<!doctype html><html><body style="font-family:Arial;padding:24px"><h1>Crawl site: ${escapeHtml(site)}</h1><form method="post" action="/admin/crawl?site=${encodeURIComponent(site)}"><button>Scan now</button></form><p>After scan, check <a href="/admin/products?site=${encodeURIComponent(site)}">products</a>.</p></body></html>`);
});
app.post('/admin/crawl', requireAdmin, async (req, res) => {
  const result = await crawlSite(req.query.site || defaultSiteId);
  res.send(`Scan complete. Products: ${result.products}. Pages: ${result.pages}. <a href="/admin/products?site=${encodeURIComponent(req.query.site || defaultSiteId)}">View products</a>`);
});
app.get('/admin/products', requireAdmin, async (req, res) => {
  const site = req.query.site || defaultSiteId;
  const rows = (await pool.query('SELECT title,price,currency,url,product_type FROM products WHERE site_id=$1 ORDER BY updated_at DESC LIMIT 300', [site])).rows;
  res.send(`<!doctype html><html><body style="font-family:Arial;padding:24px"><h1>Products: ${escapeHtml(site)}</h1><p>${rows.length} shown</p><table border="1" cellpadding="8"><tr><th>Title</th><th>Price</th><th>Type</th><th>URL</th></tr>${rows.map(p=>`<tr><td>${escapeHtml(p.title)}</td><td>${escapeHtml(p.price)} ${escapeHtml(p.currency)}</td><td>${escapeHtml(p.product_type)}</td><td><a href="${escapeHtml(p.url)}" target="_blank">open</a></td></tr>`).join('')}</table></body></html>`);
});
app.get('/admin/leads', requireAdmin, async (req, res) => {
  const site = req.query.site || defaultSiteId;
  const rows = (await pool.query('SELECT * FROM leads WHERE site_id=$1 ORDER BY created_at DESC LIMIT 300', [site])).rows;
  res.send(`<!doctype html><html><body style="font-family:Arial;padding:24px"><h1>Leads: ${escapeHtml(site)}</h1><table border="1" cellpadding="8"><tr><th>Date</th><th>Name</th><th>Phone</th><th>Email</th><th>Interest</th><th>Budget</th><th>Message</th><th>Source</th></tr>${rows.map(l=>`<tr><td>${escapeHtml(l.created_at)}</td><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.phone)}</td><td>${escapeHtml(l.email)}</td><td>${escapeHtml(l.product_interest)}</td><td>${escapeHtml(l.budget)}</td><td>${escapeHtml(l.message)}</td><td>${escapeHtml(l.source_page)}</td></tr>`).join('')}</table></body></html>`);
});

app.post('/api/chat', async (req, res) => {
  const siteId = getSiteId(req);
  const message = String(req.body?.message || '').trim();
  if (!message) return res.status(400).json({ error: 'Message required' });
  const siteRes = await pool.query('SELECT * FROM sites WHERE site_id=$1', [siteId]);
  if (!siteRes.rows.length) return res.json({ leadId: req.body.leadId || uuidv4(), reply: `This chatbot is not configured for site ID: ${siteId}. Please add it in /admin/sites.` });
  const site = siteRes.rows[0];
  const leadId = req.body.leadId || uuidv4();
  const knowledge = await searchKnowledge(siteId, message);
  let reply = await aiAnswer(site, message, knowledge);
  if (!reply) reply = simpleAnswer(site, message, knowledge);
  await pool.query('INSERT INTO chat_messages (id,lead_id,site_id,sender,message) VALUES ($1,$2,$3,$4,$5)', [uuidv4(), leadId, siteId, 'customer', message]);
  await pool.query('INSERT INTO chat_messages (id,lead_id,site_id,sender,message) VALUES ($1,$2,$3,$4,$5)', [uuidv4(), leadId, siteId, 'bot', reply]);
  res.json({ leadId, reply });
});

app.post('/api/leads', async (req, res) => {
  const siteId = getSiteId(req);
  const id = req.body.leadId || uuidv4();
  const data = { name:req.body.name||'', email:req.body.email||'', phone:req.body.phone||'', company:req.body.company||'', productInterest:req.body.productInterest||'', budget:req.body.budget||'', message:req.body.message||'', sourcePage:req.body.sourcePage||req.headers.referer||'' };
  if (!data.phone && !data.email) return res.status(400).json({ error: 'Phone or email is required.' });
  await pool.query(`INSERT INTO leads (id,site_id,name,email,phone,company,product_interest,budget,message,source_page) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,company=EXCLUDED.company,product_interest=EXCLUDED.product_interest,budget=EXCLUDED.budget,message=EXCLUDED.message,source_page=EXCLUDED.source_page`, [id,siteId,data.name,data.email,data.phone,data.company,data.productInterest,data.budget,data.message,data.sourcePage]);
  const site = (await pool.query('SELECT whatsapp_number FROM sites WHERE site_id=$1', [siteId])).rows[0] || {};
  const waText = encodeURIComponent(`New lead\nSite: ${siteId}\nName: ${data.name}\nPhone: ${data.phone}\nProduct: ${data.productInterest}\nBudget: ${data.budget}\nMessage: ${data.message}`);
  res.json({ ok:true, leadId:id, whatsappUrl: site.whatsapp_number ? `https://wa.me/${site.whatsapp_number}?text=${waText}` : '' });
});

initDb().then(() => app.listen(PORT, () => console.log(`Smart chatbot v3 running on port ${PORT}`))).catch(err => { console.error(err); process.exit(1); });
