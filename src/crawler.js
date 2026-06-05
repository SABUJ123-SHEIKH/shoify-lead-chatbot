const fetch = require('node-fetch');
const cheerio = require('cheerio');
const { v4: uuidv4 } = require('uuid');

function normalizeBase(url) { return String(url || '').replace(/\/$/, ''); }
function cleanText(s='') { return String(s).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000); }
function absUrl(base, url) { try { return new URL(url, base).toString(); } catch { return ''; } }

async function fetchText(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'KGSmartChatbot/2.0 (+lead chatbot crawler)' }, timeout: 20000 });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return res.text();
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'KGSmartChatbot/2.0 (+lead chatbot crawler)' }, timeout: 20000 });
  if (!res.ok) throw new Error(`Fetch failed ${res.status} ${url}`);
  return res.json();
}

async function getShopifyProducts(baseUrl) {
  const base = normalizeBase(baseUrl);
  const items = [];
  // Shopify products.json supports limit=250. Many stores expose enough data here for accurate answers.
  const data = await fetchJson(`${base}/products.json?limit=250`).catch(() => ({ products: [] }));
  for (const p of data.products || []) {
    const variants = p.variants || [];
    const first = variants[0] || {};
    const image = (p.images || [])[0]?.src || '';
    const prices = variants.map(v => Number(v.price)).filter(n => !Number.isNaN(n));
    const price = prices.length ? `${Math.min(...prices)}${prices.length > 1 ? '+' : ''}` : (first.price || '');
    const variantText = variants.map(v => `${v.title || ''} ${v.price || ''}`).join(' ');
    const content = cleanText(`${p.title}. ${p.body_html || ''} Tags: ${(p.tags || '').toString()}. Variants: ${variantText}`);
    const keywords = cleanText(`${p.title} ${p.handle || ''} ${p.product_type || ''} ${p.vendor || ''} ${(p.tags || []).join ? p.tags.join(' ') : p.tags || ''} ${variantText}`);
    items.push({
      id: uuidv4(), type: 'product', title: p.title || '',
      url: `${base}/products/${p.handle}`,
      price, image, content, keywords
    });
  }
  return items;
}

async function getSitemapUrls(baseUrl, limit=160) {
  const base = normalizeBase(baseUrl);
  const seen = new Set();
  const allUrls = [];
  async function readMap(url) {
    const xml = await fetchText(url).catch(() => '');
    const urls = [...xml.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
    for (const u of urls) {
      if (seen.has(u)) continue;
      seen.add(u);
      if (u.endsWith('.xml')) await readMap(u);
      else if (/\/products\/|\/collections\/|\/pages\/|\/blogs\//.test(u)) allUrls.push(u);
      if (allUrls.length >= limit) break;
    }
  }
  await readMap(`${base}/sitemap.xml`);
  return allUrls.slice(0, limit);
}

async function scrapePage(url, baseUrl) {
  const html = await fetchText(url);
  const $ = cheerio.load(html);
  $('script,style,noscript,svg').remove();
  const title = cleanText($('h1').first().text() || $('meta[property="og:title"]').attr('content') || $('title').text());
  const desc = cleanText($('meta[name="description"]').attr('content') || $('meta[property="og:description"]').attr('content') || $('main').text() || $('body').text());
  const price = cleanText($('[class*="price"], [data-price]').first().text()).slice(0, 120);
  const image = absUrl(baseUrl, $('meta[property="og:image"]').attr('content') || $('img').first().attr('src') || '');
  return { id: uuidv4(), type: url.includes('/products/') ? 'product' : 'page', title, url, price, image, content: desc, keywords: cleanText(`${title} ${desc}`).slice(0, 1000) };
}

async function crawlWebsite(baseUrl) {
  const products = await getShopifyProducts(baseUrl).catch(() => []);
  const urls = await getSitemapUrls(baseUrl, products.length ? 80 : 160).catch(() => []);
  const existingProductUrls = new Set(products.map(p => p.url));
  const pages = [];
  for (const url of urls) {
    if (existingProductUrls.has(url)) continue;
    try { pages.push(await scrapePage(url, baseUrl)); } catch (_) {}
  }
  const all = [...products, ...pages].filter(x => x.title && x.url);
  // De-duplicate by URL
  return [...new Map(all.map(x => [x.url, x])).values()];
}

module.exports = { crawlWebsite };
