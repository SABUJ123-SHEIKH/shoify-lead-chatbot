const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');
const { pool } = require('./db');

function cleanBase(url) {
  return String(url || '').replace(/\/$/, '');
}

function stripHtml(html = '') {
  return String(html).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'User-Agent': 'SmartLeadChatbot/3.0' }, timeout: 20000 });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return res.json();
}

async function syncShopifyProducts(siteId, websiteUrl) {
  const base = cleanBase(websiteUrl);
  let page = 1;
  let total = 0;

  while (page <= 10) {
    const json = await fetchJson(`${base}/products.json?limit=250&page=${page}`);
    const products = json.products || [];
    if (!products.length) break;

    for (const p of products) {
      const variant = (p.variants || [])[0] || {};
      const image = (p.images || [])[0]?.src || '';
      const url = `${base}/products/${p.handle}`;
      const tags = Array.isArray(p.tags) ? p.tags.join(', ') : (p.tags || '');
      await pool.query(
        `INSERT INTO products (id, site_id, title, url, price, description, image, product_type, vendor, tags, raw, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW())
         ON CONFLICT (id) DO UPDATE SET
           title=EXCLUDED.title, url=EXCLUDED.url, price=EXCLUDED.price, description=EXCLUDED.description,
           image=EXCLUDED.image, product_type=EXCLUDED.product_type, vendor=EXCLUDED.vendor,
           tags=EXCLUDED.tags, raw=EXCLUDED.raw, updated_at=NOW()`,
        [`${siteId}:shopify:${p.id}`, siteId, p.title || '', url, variant.price || null, stripHtml(p.body_html || ''), image, p.product_type || '', p.vendor || '', tags, p]
      );
      total++;
    }
    if (products.length < 250) break;
    page++;
  }
  return total;
}

async function crawlBasicPages(siteId, websiteUrl) {
  const base = cleanBase(websiteUrl);
  const urls = [`${base}/`, `${base}/pages/contact`, `${base}/pages/shipping`, `${base}/pages/return-policy`];
  let total = 0;
  for (const url of urls) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'SmartLeadChatbot/3.0' }, timeout: 12000 });
      if (!res.ok) continue;
      const html = await res.text();
      const $ = cheerio.load(html);
      $('script,style,noscript').remove();
      const title = $('title').first().text().trim() || url;
      const content = $('body').text().replace(/\s+/g, ' ').trim().slice(0, 10000);
      await pool.query(
        `INSERT INTO pages (id, site_id, title, url, content, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW())
         ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title, content=EXCLUDED.content, updated_at=NOW()`,
        [`${siteId}:page:${Buffer.from(url).toString('base64').slice(0,80)}`, siteId, title, url, content]
      );
      total++;
    } catch (_) {}
  }
  return total;
}

async function crawlSite(siteId) {
  const siteRes = await pool.query('SELECT * FROM sites WHERE site_id=$1', [siteId]);
  if (!siteRes.rows.length) throw new Error('Site not found');
  const site = siteRes.rows[0];
  let products = 0;
  try { products = await syncShopifyProducts(siteId, site.website_url); } catch (e) { console.error('Shopify sync failed', e.message); }
  const pages = await crawlBasicPages(siteId, site.website_url);
  return { products, pages };
}

async function searchKnowledge(siteId, query) {
  const terms = String(query || '').toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
  const like = `%${terms.join('%')}%`;
  const productRes = await pool.query(
    `SELECT title,url,price,currency,description,product_type,tags
     FROM products
     WHERE site_id=$1 AND LOWER(title || ' ' || COALESCE(description,'') || ' ' || COALESCE(product_type,'') || ' ' || COALESCE(tags,'')) LIKE $2
     ORDER BY price NULLS LAST
     LIMIT 5`,
    [siteId, like]
  );

  let products = productRes.rows;
  if (!products.length && terms.length) {
    const orParts = terms.map((_, i) => `LOWER(title || ' ' || COALESCE(description,'') || ' ' || COALESCE(tags,'')) LIKE $${i + 2}`).join(' OR ');
    const res = await pool.query(
      `SELECT title,url,price,currency,description,product_type,tags FROM products WHERE site_id=$1 AND (${orParts}) LIMIT 5`,
      [siteId, ...terms.map(t => `%${t}%`)]
    );
    products = res.rows;
  }

  const pageRes = await pool.query(
    `SELECT title,url,content FROM pages WHERE site_id=$1 AND LOWER(title || ' ' || COALESCE(content,'')) LIKE $2 LIMIT 3`,
    [siteId, like]
  );
  return { products, pages: pageRes.rows };
}

module.exports = { crawlSite, searchKnowledge };
