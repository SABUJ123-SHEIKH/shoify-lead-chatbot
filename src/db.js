const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL is missing. Add Neon/PostgreSQL connection string in Render Environment.');
  process.exit(1);
}
const pool = new Pool({ connectionString, ssl: connectionString.includes('sslmode=require') ? undefined : { rejectUnauthorized: false } });

async function initDb(){
  await pool.query(`CREATE TABLE IF NOT EXISTS sites(
    site_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    whatsapp TEXT DEFAULT '',
    brand_color TEXT DEFAULT '#111111',
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS products(
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES sites(site_id) ON DELETE CASCADE,
    title TEXT,
    description TEXT,
    price NUMERIC,
    currency TEXT DEFAULT 'DKK',
    url TEXT,
    image TEXT,
    product_type TEXT,
    vendor TEXT,
    tags TEXT,
    raw JSONB,
    updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS pages(
    id TEXT PRIMARY KEY,
    site_id TEXT REFERENCES sites(site_id) ON DELETE CASCADE,
    title TEXT,
    url TEXT,
    content TEXT,
    type TEXT DEFAULT 'page',
    updated_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS leads(
    id TEXT PRIMARY KEY,
    site_id TEXT,
    name TEXT, email TEXT, phone TEXT, company TEXT,
    product_interest TEXT, budget TEXT, message TEXT, source_page TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
  await pool.query(`CREATE TABLE IF NOT EXISTS chat_messages(
    id TEXT PRIMARY KEY,
    site_id TEXT, lead_id TEXT, sender TEXT, message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
  )`);
}

module.exports = { pool, initDb };
