require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');
const { crawlWebsite } = require('./crawler');

const app = express();
const PORT = process.env.PORT || 3000;
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-password';

app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin: true }));
app.use(express.json({ limit: '400kb' }));
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Access-Control-Allow-Origin', '*');
  next();
});
app.use('/widget', express.static(__dirname + '/../public'));

function esc(v='') { return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function auth(req, res, next) {
  const a = req.headers.authorization || '';
  const token = a.startsWith('Basic ') ? a.slice(6) : '';
  const [u,p] = Buffer.from(token, 'base64').toString().split(':');
  if (u === adminUser && p === adminPassword) return next();
  res.set('WWW-Authenticate', 'Basic realm="Chatbot Admin"');
  res.status(401).send('Login required');
}
function run(sql, params=[]) { return new Promise((resolve,reject)=>db.run(sql, params, function(err){ err?reject(err):resolve(this); })); }
function all(sql, params=[]) { return new Promise((resolve,reject)=>db.all(sql, params, (err,rows)=>err?reject(err):resolve(rows))); }
function get(sql, params=[]) { return new Promise((resolve,reject)=>db.get(sql, params, (err,row)=>err?reject(err):resolve(row))); }
function normSiteId(v='') { return String(v || '').trim().toLowerCase().replace(/[^a-z0-9_-]/g, ''); }
function tokens(q='') { return String(q).toLowerCase().split(/[^a-z0-9æøåäöüéèà]+/i).filter(w => w.length > 1); }
function expandQuery(q='') {
  const t = String(q).toLowerCase();
  const extra = [];
  if (/desk|table|bord|skrivebord|hæve|haeve|height|adjustable|standing/.test(t)) extra.push('desk','table','bord','skrivebord','hæve','haeve','height','adjustable','standing');
  if (/chair|stol|kontorstol|ergonomic|ergonomisk/.test(t)) extra.push('chair','stol','kontorstol','ergonomic','ergonomisk');
  if (/meeting|conference|møde|moede|konference/.test(t)) extra.push('meeting','conference','møde','moede','konference','mødebord');
  if (/cheap|billig|budget|offer|tilbud|pris|price|rate/.test(t)) extra.push('cheap','billig','budget','offer','tilbud','pris','price');
  return `${q} ${extra.join(' ')}`;
}
function scoreItem(item, q) {
  const expanded = expandQuery(q);
  const words = tokens(expanded);
  const hay = `${item.title} ${item.url} ${item.keywords} ${item.content} ${item.price}`.toLowerCase();
  let score = 0;
  for (const w of words) {
    if (w.length > 2 && hay.includes(w)) score += 3;
    if (w.length > 3 && String(item.title || '').toLowerCase().includes(w)) score += 5;
  }
  const ql = String(q).toLowerCase();
  if (/180x80|180 x 80|180/.test(ql) && /180x80|180 x 80|180/.test(hay)) score += 12;
  if (/160x80|160 x 80|160/.test(ql) && /160x80|160 x 80|160/.test(hay)) score += 12;
  if (/140x80|140 x 80|140/.test(ql) && /140x80|140 x 80|140/.test(hay)) score += 12;
  if (/desk|bord|table|hæve|haeve|height|adjustable|standing/.test(ql) && /desk|bord|table|hæve|haeve|height|adjustable|skrivebord|standing/.test(hay)) score += 10;
  if (/chair|stol|kontorstol/.test(ql) && /chair|stol|kontorstol/.test(hay)) score += 10;
  if (/meeting|conference|møde|moede/.test(ql) && /meeting|conference|møde|moede|konference|mødebord/.test(hay)) score += 10;
  return score;
}
function formatLinks(rows) {
  return rows.map((r,i) => `${i+1}. ${r.title}${r.price ? ' — ' + r.price : ''}\n${r.url}`).join('\n\n');
}
async function answer(siteId, message) {
  const site = await get('SELECT * FROM sites WHERE id=?', [siteId]);
  if (!site) return 'This chatbot site is not configured yet. Please contact support.';

  const rows = await all('SELECT * FROM knowledge WHERE site_id=? LIMIT 1500', [siteId]);
  if (!rows.length) {
    return `I am connected to ${site.name || site.website_url}, but the website has not been scanned yet. Please scan the site from /admin/crawl?site=${siteId}.`;
  }

  const ranked = rows
    .map(r => ({...r, score: scoreItem(r, message)}))
    .filter(r => r.score > 0)
    .sort((a,b)=>b.score-a.score)
    .slice(0,4);

  if (ranked.length) {
    return `Yes, I found these from ${site.name || site.website_url}:\n\n${formatLinks(ranked)}\n\nSend your phone number, budget and quantity in the form below, then we can send the best offer.`;
  }

  const q = String(message).toLowerCase();
  let categoryWhere = '';
  if (/desk|bord|table|hæve|haeve|height|adjustable/.test(q)) categoryWhere = 'AND (lower(title) LIKE "%bord%" OR lower(title) LIKE "%desk%" OR lower(url) LIKE "%desk%" OR lower(url) LIKE "%bord%")';
  else if (/chair|stol|kontorstol/.test(q)) categoryWhere = 'AND (lower(title) LIKE "%stol%" OR lower(title) LIKE "%chair%" OR lower(url) LIKE "%stol%" OR lower(url) LIKE "%chair%")';
  else if (/meeting|conference|møde|moede/.test(q)) categoryWhere = 'AND (lower(title) LIKE "%møde%" OR lower(title) LIKE "%moede%" OR lower(title) LIKE "%meeting%" OR lower(url) LIKE "%meeting%")';

  const fallbackLinks = await all(`SELECT title,url,price FROM knowledge WHERE site_id=? ${categoryWhere} LIMIT 4`, [siteId]);
  const links = formatLinks(fallbackLinks.length ? fallbackLinks : rows.slice(0,4));
  return `I could not find an exact match, but these links from ${site.name || site.website_url} may help:\n\n${links}\n\nWrite product type + size + budget, for example: “height-adjustable desk 180x80 budget 1500”.`;
}

app.get('/', (req,res)=>res.send('Multisite smart chatbot is running. Open /health or /admin/sites.'));
app.get('/health', async (req,res)=>{
  try {
    const siteCount = await get('SELECT COUNT(*) as n FROM sites');
    const knowledgeCount = await get('SELECT COUNT(*) as n FROM knowledge');
    res.json({ok:true, app:'multisite-smart-chatbot-v2', sites:siteCount?.n||0, knowledge:knowledgeCount?.n||0});
  } catch(e) { res.json({ok:true, app:'multisite-smart-chatbot-v2'}); }
});


app.post('/api/chat', async (req,res)=>{
  try {
    const siteId = normSiteId(req.body.siteId || process.env.DEFAULT_SITE_ID || 'default');
    const message = String(req.body.message || '').slice(0,1000);
    if (!message) return res.status(400).json({error:'Message is required'});
    const leadId = req.body.leadId || uuidv4();
    const reply = await answer(siteId, message);
    await run('INSERT INTO chat_messages (id,site_id,lead_id,sender,message) VALUES (?,?,?,?,?)',[uuidv4(),siteId,leadId,'customer',message]);
    await run('INSERT INTO chat_messages (id,site_id,lead_id,sender,message) VALUES (?,?,?,?,?)',[uuidv4(),siteId,leadId,'bot',reply]);
    res.json({leadId, reply});
  } catch(e) { res.status(500).json({error:'Chat error', detail:e.message}); }
});

app.post('/api/leads', async (req,res)=>{
  try {
    const siteId = normSiteId(req.body.siteId || process.env.DEFAULT_SITE_ID || 'default');
    const id = req.body.leadId || uuidv4();
    const d = req.body;
    if (!d.phone && !d.email) return res.status(400).json({error:'Phone or email is required.'});
    await run(`INSERT INTO leads (id,site_id,name,email,phone,company,product_interest,budget,message,source_page) VALUES (?,?,?,?,?,?,?,?,?,?)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,email=excluded.email,phone=excluded.phone,company=excluded.company,product_interest=excluded.product_interest,budget=excluded.budget,message=excluded.message,source_page=excluded.source_page`,
      [id,siteId,d.name||'',d.email||'',d.phone||'',d.company||'',d.productInterest||'',d.budget||'',d.message||'',d.sourcePage||'']);
    const site = await get('SELECT * FROM sites WHERE id=?',[siteId]);
    const waText = encodeURIComponent(`New lead from ${siteId}\nName: ${d.name||''}\nPhone: ${d.phone||''}\nProduct: ${d.productInterest||''}\nBudget: ${d.budget||''}\nMessage: ${d.message||''}`);
    res.json({ok:true, leadId:id, whatsappUrl: site?.whatsapp_number ? `https://wa.me/${site.whatsapp_number}?text=${waText}` : ''});
  } catch(e) { res.status(500).json({error:'Lead save error'}); }
});

app.get('/admin/sites', auth, async (req,res)=>{
  const rows = await all('SELECT * FROM sites ORDER BY created_at DESC');
  res.send(`<!doctype html><html><body style="font-family:Arial;padding:24px"><h1>Sites</h1><form method="post" action="/admin/sites"><input name="id" placeholder="site_id e.g. arnehus" required><input name="name" placeholder="Name"><input name="website_url" placeholder="https://example.com" required><input name="whatsapp_number" placeholder="45..."><button>Add / Update</button></form><table border="1" cellpadding="8"><tr><th>ID</th><th>Name</th><th>URL</th><th>Actions</th></tr>${rows.map(s=>`<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.website_url)}</td><td><a href="/admin/crawl?site=${esc(s.id)}">Crawl</a> | <a href="/admin/pages?site=${esc(s.id)}">Pages</a> | <a href="/admin/leads?site=${esc(s.id)}">Leads</a></td></tr>`).join('')}</table></body></html>`);
});
app.post('/admin/sites', auth, express.urlencoded({extended:true}), async (req,res)=>{
  await run('INSERT INTO sites (id,name,website_url,whatsapp_number) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,website_url=excluded.website_url,whatsapp_number=excluded.whatsapp_number',[normSiteId(req.body.id),req.body.name||req.body.id,req.body.website_url,req.body.whatsapp_number||'']);
  res.redirect('/admin/sites');
});
app.get('/admin/crawl', auth, async (req,res)=>{
  const siteId = normSiteId(req.query.site || process.env.DEFAULT_SITE_ID || 'default');
  const site = await get('SELECT * FROM sites WHERE id=?',[siteId]);
  res.send(`<!doctype html><html><body style="font-family:Arial;padding:24px"><h1>Crawl ${esc(siteId)}</h1>${site?`<p>${esc(site.website_url)}</p><form method="post" action="/admin/crawl?site=${esc(siteId)}"><button>Scan now</button></form>`:'<p>Site not found. Add it at /admin/sites first.</p>'}<p><a href="/admin/pages?site=${esc(siteId)}">View pages</a></p></body></html>`);
});
app.post('/admin/crawl', auth, async (req,res)=>{
  const siteId = normSiteId(req.query.site || process.env.DEFAULT_SITE_ID || 'default');
  const site = await get('SELECT * FROM sites WHERE id=?',[siteId]);
  if (!site) return res.status(404).send('Site not found');
  const items = await crawlWebsite(site.website_url);
  for (const it of items) {
    await run(`INSERT INTO knowledge (id,site_id,type,title,url,price,image,content,keywords) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(site_id,url) DO UPDATE SET type=excluded.type,title=excluded.title,price=excluded.price,image=excluded.image,content=excluded.content,keywords=excluded.keywords`,
      [it.id,siteId,it.type,it.title,it.url,it.price,it.image,it.content,it.keywords]);
  }
  res.send(`<p>Scan complete. Saved/updated ${items.length} items.</p><p><a href="/admin/pages?site=${esc(siteId)}">View knowledge base</a></p>`);
});
app.get('/admin/pages', auth, async (req,res)=>{
  const siteId = normSiteId(req.query.site || process.env.DEFAULT_SITE_ID || 'default');
  const rows = await all('SELECT * FROM knowledge WHERE site_id=? ORDER BY created_at DESC LIMIT 300',[siteId]);
  res.send(`<!doctype html><html><body style="font-family:Arial;padding:24px"><h1>Knowledge: ${esc(siteId)} (${rows.length})</h1><table border="1" cellpadding="7"><tr><th>Type</th><th>Title</th><th>Price</th><th>URL</th></tr>${rows.map(r=>`<tr><td>${esc(r.type)}</td><td>${esc(r.title)}</td><td>${esc(r.price)}</td><td><a href="${esc(r.url)}" target="_blank">open</a></td></tr>`).join('')}</table></body></html>`);
});
app.get('/admin/leads', auth, async (req,res)=>{
  const siteId = normSiteId(req.query.site || process.env.DEFAULT_SITE_ID || 'default');
  const rows = await all('SELECT * FROM leads WHERE site_id=? ORDER BY created_at DESC LIMIT 300',[siteId]);
  res.send(`<!doctype html><html><body style="font-family:Arial;padding:24px"><h1>Leads: ${esc(siteId)}</h1><table border="1" cellpadding="7"><tr><th>Date</th><th>Name</th><th>Phone</th><th>Email</th><th>Interest</th><th>Budget</th><th>Message</th><th>Source</th></tr>${rows.map(l=>`<tr><td>${esc(l.created_at)}</td><td>${esc(l.name)}</td><td>${esc(l.phone)}</td><td>${esc(l.email)}</td><td>${esc(l.product_interest)}</td><td>${esc(l.budget)}</td><td>${esc(l.message)}</td><td>${esc(l.source_page)}</td></tr>`).join('')}</table></body></html>`);
});

app.listen(PORT, ()=>console.log(`Multisite smart chatbot running on ${PORT}`));
