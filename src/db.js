const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.warn('DATABASE_URL is missing. Add PostgreSQL/Neon URL in Render Environment.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL && process.env.DATABASE_URL.includes('localhost') ? false : { rejectUnauthorized: false }
});

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS sites (
    site_id TEXT PRIMARY KEY,
    name TEXT,
    website_url TEXT NOT NULL,
    whatsapp_number TEXT,
    brand_color TEXT DEFAULT '#111111',
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES sites(site_id) ON DELETE CASCADE,
    title TEXT,
    url TEXT,
    price NUMERIC,
    currency TEXT DEFAULT 'DKK',
    description TEXT,
    image TEXT,
    product_type TEXT,
    vendor TEXT,
    tags TEXT,
    raw JSONB,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS pages (
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES sites(site_id) ON DELETE CASCADE,
    title TEXT,
    url TEXT,
    content TEXT,
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    site_id TEXT,
    name TEXT,
    email TEXT,
    phone TEXT,
    company TEXT,
    product_interest TEXT,
    budget TEXT,
    message TEXT,
    source_page TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);

  await pool.query(`CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    lead_id TEXT,
    site_id TEXT,
    sender TEXT,
    message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

module.exports = { pool, initDb };
