require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
const { pool, initDb } = require('./db');
let OpenAI = null;
try { OpenAI = require('openai'); } catch(e) {}

const app = express();
const PORT = process.env.PORT || 10000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
const DEFAULT_SITE_ID = process.env.DEFAULT_SITE_ID || 'default';
const openai = (process.env.OPENAI_API_KEY && OpenAI) ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

app.use(helmet({ contentSecurityPolicy:false, crossOriginResourcePolicy:false, crossOriginEmbedderPolicy:false }));
app.use((req,res,next)=>{res.setHeader('Cross-Origin-Resource-Policy','cross-origin'); next();});
app.use(cors({ origin:true }));
app.use(express.json({ limit:'1mb' }));
app.use('/widget', express.static(__dirname + '/public'));

function esc(v=''){return String(v||'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function admin(req,res,next){const auth=req.headers.authorization||''; const token=auth.startsWith('Basic ')?auth.slice(6):''; const [u,p]=Buffer.from(token,'base64').toString().split(':'); if(u===ADMIN_USER&&p===ADMIN_PASSWORD)return next(); res.set('WWW-Authenticate','Basic realm="Admin"'); res.status(401).send('Login required');}
function normUrl(base,path){ try { return new URL(path, base).toString(); } catch(e){ return path; } }
function tokens(text){ return String(text||'').toLowerCase().replace(/[^a-z0-9æøåäöüéèàç\s-]/gi,' ').split(/\s+/).filter(w=>w.length>2); }

async function getSite(siteId){
  const r=await pool.query('SELECT site_id AS id, name, url, whatsapp_number, brand_color, created_at FROM sites WHERE site_id=$1',[siteId]);
  return r.rows[0];
}
async function searchProducts(siteId, message){
  const words = tokens(message).slice(0,12);
  if(!words.length) return [];
  const like = words.map(w=>`%${w}%`);
  const sql = `SELECT *, (
    ${words.map((_,i)=>`CASE WHEN lower(title||' '||coalesce(description,'')||' '||coalesce(tags,'')||' '||coalesce(product_type,'')) LIKE lower($${i+2}) THEN 1 ELSE 0 END`).join(' + ')}
  ) AS score FROM products WHERE site_id=$1 ORDER BY score DESC, price ASC NULLS LAST LIMIT 6`;
  const r=await pool.query(sql,[siteId,...like]);
  return r.rows.filter(x=>Number(x.score)>0).slice(0,4);
}
async function searchPages(siteId,message){
  const words=tokens(message).slice(0,10); if(!words.length)return [];
  const like=words.map(w=>`%${w}%`);
  const sql=`SELECT *, (${words.map((_,i)=>`CASE WHEN lower(title||' '||coalesce(content,'')) LIKE lower($${i+2}) THEN 1 ELSE 0 END`).join(' + ')}) AS score FROM pages WHERE site_id=$1 ORDER BY score DESC LIMIT 3`;
  const r=await pool.query(sql,[siteId,...like]); return r.rows.filter(x=>Number(x.score)>0);
}
function simpleAnswer(site, products, pages, message){
  if(products.length){
    const lines=products.map((p,i)=>`${i+1}. ${p.title}${p.price ? ` – ${p.price} ${p.currency||'DKK'}`:''}\n${p.url}`);
    return `I found these matching options on ${site.name}:\n\n${lines.join('\n\n')}\n\nDo you want a direct offer? Send your phone number, quantity, size and budget.`;
  }
  if(pages.length){
    return `I found these relevant pages on ${site.name}:\n\n${pages.map((p,i)=>`${i+1}. ${p.title}\n${p.url}`).join('\n\n')}\n\nFor a direct offer, send your phone number and budget.`;
  }
  return `I could not find an exact product yet. Try product type + size + budget, for example: “height-adjustable desk 180x80 budget 1500”.\n\nWebsite: ${site.url}\n\nSend your phone number below and our team can help.`;
}
async function aiAnswer(site, products, pages, message){
  if(!openai) return simpleAnswer(site,products,pages,message);
  const context = JSON.stringify({site:{name:site.name,url:site.url},products:products.map(p=>({title:p.title,price:p.price,currency:p.currency,url:p.url,type:p.product_type})),pages:pages.map(p=>({title:p.title,url:p.url,content:String(p.content||'').slice(0,400)}))});
  try{
    const resp=await openai.responses.create({model:process.env.OPENAI_MODEL||'gpt-4.1-mini',input:[{role:'system',content:'You are a professional sales chatbot. Answer only from provided website/product context. Include product links and prices when available. Ask for phone, quantity, size, and budget for offer. Be concise.'},{role:'user',content:`Question: ${message}\nContext: ${context}`} ]});
    return resp.output_text || simpleAnswer(site,products,pages,message);
  }catch(e){return simpleAnswer(site,products,pages,message);}
}
async function syncShopifyProducts(site){
  let count=0;
  for(let page=1; page<=10; page++){
    const url = `${site.url.replace(/\/$/,'')}/products.json?limit=250&page=${page}`;
    const res = await fetch(url, {headers:{'User-Agent':'AI-Agent-Chatbot/4.0'}});
    if(!res.ok) break;
    const data=await res.json();
    const products=data.products||[]; if(!products.length) break;
    for(const p of products){
      const variant=(p.variants||[])[0]||{};
      const productUrl=`${site.url.replace(/\/$/,'')}/products/${p.handle}`;
      const desc=String(p.body_html||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();
      await pool.query(`INSERT INTO products(id,site_id,title,description,price,currency,url,image,product_type,vendor,tags,raw,updated_at)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
        ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,description=EXCLUDED.description,price=EXCLUDED.price,url=EXCLUDED.url,image=EXCLUDED.image,product_type=EXCLUDED.product_type,vendor=EXCLUDED.vendor,tags=EXCLUDED.tags,raw=EXCLUDED.raw,updated_at=now()`,
        [`${site.id}:${p.id}`,site.id,p.title,desc,variant.price||null,'DKK',productUrl,(p.images&&p.images[0]&&p.images[0].src)||'',p.product_type||'',p.vendor||'',Array.isArray(p.tags)?p.tags.join(', '):(p.tags||''),p]);
      count++;
    }
  }
  return count;
}
async function syncBasicPages(site){
  const pageUrls=[site.url, '/pages/contact', '/pages/levering', '/pages/returnering', '/pages/handelsbetingelser'].map(u=>normUrl(site.url,u));
  let count=0;
  for(const u of pageUrls){
    try{ const res=await fetch(u); if(!res.ok) continue; const html=await res.text(); const $=cheerio.load(html); $('script,style,noscript').remove(); const title=($('title').text()||u).trim(); const content=$('body').text().replace(/\s+/g,' ').trim().slice(0,5000); await pool.query(`INSERT INTO pages(id,site_id,title,url,content,type,updated_at) VALUES($1,$2,$3,$4,$5,'page',now()) ON CONFLICT(id) DO UPDATE SET title=EXCLUDED.title,content=EXCLUDED.content,updated_at=now()`,[`${site.id}:${u}`,site.id,title,u,content]); count++; }catch(e){}
  }
  return count;
}

app.get('/',(req,res)=>res.send('AI Agent Multisite Chatbot is running. Open /health'));
app.get('/health',async(req,res)=>{const p=await pool.query('SELECT COUNT(*)::int products FROM products'); const s=await pool.query('SELECT COUNT(*)::int sites FROM sites'); res.json({ok:true,sites:s.rows[0].sites,products:p.rows[0].products});});

app.post('/api/chat', async(req,res)=>{
  const siteId=req.body.siteId||req.query.site||DEFAULT_SITE_ID; const message=String(req.body.message||'').slice(0,1000); if(!message)return res.status(400).json({error:'Message required'});
  const site=await getSite(siteId); if(!site)return res.json({reply:`This chatbot is not configured for site_id "${siteId}". Add it in /admin/sites first.`,leadId:req.body.leadId||uuidv4()});
  const leadId=req.body.leadId||uuidv4(); const products=await searchProducts(siteId,message); const pages=await searchPages(siteId,message); const reply=await aiAnswer(site,products,pages,message);
  await pool.query('INSERT INTO chat_messages(id,site_id,lead_id,sender,message) VALUES($1,$2,$3,$4,$5)',[uuidv4(),siteId,leadId,'customer',message]);
  await pool.query('INSERT INTO chat_messages(id,site_id,lead_id,sender,message) VALUES($1,$2,$3,$4,$5)',[uuidv4(),siteId,leadId,'bot',reply]);
  res.json({leadId,reply});
});
app.post('/api/leads',async(req,res)=>{const id=req.body.leadId||uuidv4(); const siteId=req.body.siteId||DEFAULT_SITE_ID; const d=req.body||{}; if(!d.phone&&!d.email)return res.status(400).json({error:'Phone or email required'}); await pool.query(`INSERT INTO leads(id,site_id,name,email,phone,company,product_interest,budget,message,source_page) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,email=EXCLUDED.email,phone=EXCLUDED.phone,company=EXCLUDED.company,product_interest=EXCLUDED.product_interest,budget=EXCLUDED.budget,message=EXCLUDED.message,source_page=EXCLUDED.source_page`,[id,siteId,d.name||'',d.email||'',d.phone||'',d.company||'',d.productInterest||'',d.budget||'',d.message||'',d.sourcePage||'']); res.json({ok:true,leadId:id});});

app.get('/admin/sites',admin,async(req,res)=>{const rows=(await pool.query('SELECT site_id AS id, name, url, whatsapp_number, brand_color, created_at FROM sites ORDER BY created_at DESC')).rows; res.send(`<!doctype html><body style="font-family:Arial;padding:24px"><h1>Sites</h1><form method="post"><input name="id" placeholder="site id e.g. arnehus"><input name="name" placeholder="Name"><input name="url" placeholder="https://www.site.dk"><input name="whatsapp_number" placeholder="whatsapp_number"><button>Add site</button></form><table border="1" cellpadding="8"><tr><th>ID</th><th>Name</th><th>URL</th><th>Actions</th></tr>${rows.map(s=>`<tr><td>${esc(s.id)}</td><td>${esc(s.name)}</td><td>${esc(s.url)}</td><td><a href="/admin/crawl?site=${esc(s.id)}">Sync</a> | <a href="/admin/pages?site=${esc(s.id)}">Products</a> | <a href="/admin/leads?site=${esc(s.id)}">Leads</a></td></tr>`).join('')}</table></body>`)});
app.post('/admin/sites',admin,express.urlencoded({extended:true}),async(req,res)=>{const {id,name,url,whatsapp_number}=req.body; await pool.query('INSERT INTO sites(site_id,name,url,whatsapp_number) VALUES($1,$2,$3,$4) ON CONFLICT(site_id) DO UPDATE SET name=EXCLUDED.name,url=EXCLUDED.url,whatsapp_number=EXCLUDED.whatsapp_number',[id,name||id,url,whatsapp_number||'']); res.redirect('/admin/sites');});
app.get('/admin/crawl',admin,async(req,res)=>{const siteId=req.query.site||DEFAULT_SITE_ID; const site=await getSite(siteId); if(!site)return res.send('Site not found. Add it in /admin/sites'); const run=req.query.run==='1'; let msg=''; if(run){const pc=await syncShopifyProducts(site); const pg=await syncBasicPages(site); msg=`Synced ${pc} products and ${pg} pages.`;} res.send(`<body style="font-family:Arial;padding:24px"><h1>Sync ${esc(site.name)}</h1><p>${esc(msg)}</p><a href="/admin/crawl?site=${esc(site.id)}&run=1">Sync now</a> | <a href="/admin/pages?site=${esc(site.id)}">View products</a></body>`)});
app.get('/admin/pages',admin,async(req,res)=>{const siteId=req.query.site||DEFAULT_SITE_ID; const rows=(await pool.query('SELECT title,price,currency,url,product_type FROM products WHERE site_id=$1 ORDER BY updated_at DESC LIMIT 300',[siteId])).rows; res.send(`<body style="font-family:Arial;padding:24px"><h1>Products ${esc(siteId)}</h1><table border="1" cellpadding="8"><tr><th>Title</th><th>Price</th><th>Type</th><th>URL</th></tr>${rows.map(p=>`<tr><td>${esc(p.title)}</td><td>${esc(p.price||'')} ${esc(p.currency||'')}</td><td>${esc(p.product_type||'')}</td><td><a href="${esc(p.url)}" target="_blank">Open</a></td></tr>`).join('')}</table></body>`)});
app.get('/admin/leads',admin,async(req,res)=>{const siteId=req.query.site||DEFAULT_SITE_ID; const rows=(await pool.query('SELECT * FROM leads WHERE site_id=$1 ORDER BY created_at DESC LIMIT 200',[siteId])).rows; res.send(`<body style="font-family:Arial;padding:24px"><h1>Leads ${esc(siteId)}</h1><table border="1" cellpadding="8"><tr><th>Date</th><th>Name</th><th>Phone</th><th>Email</th><th>Interest</th><th>Budget</th><th>Message</th></tr>${rows.map(l=>`<tr><td>${esc(l.created_at)}</td><td>${esc(l.name)}</td><td>${esc(l.phone)}</td><td>${esc(l.email)}</td><td>${esc(l.product_interest)}</td><td>${esc(l.budget)}</td><td>${esc(l.message)}</td></tr>`).join('')}</table></body>`)});

initDb().then(()=>app.listen(PORT,()=>console.log('AI Agent Chatbot running on '+PORT))).catch(e=>{console.error(e); process.exit(1);});
