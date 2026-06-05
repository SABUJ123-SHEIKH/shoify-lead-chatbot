require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = process.env.DB_PATH || '/tmp/multisite-chatbot.sqlite';
const dir = path.dirname(dbPath);
if (dir && dir !== '.' && !fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS sites (
    id TEXT PRIMARY KEY,
    name TEXT,
    website_url TEXT NOT NULL,
    whatsapp_number TEXT,
    brand_color TEXT DEFAULT '#111111',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS knowledge (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    type TEXT,
    title TEXT,
    url TEXT,
    price TEXT,
    image TEXT,
    content TEXT,
    keywords TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(site_id, url)
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    name TEXT,
    email TEXT,
    phone TEXT,
    company TEXT,
    product_interest TEXT,
    budget TEXT,
    message TEXT,
    source_page TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  db.run(`CREATE TABLE IF NOT EXISTS chat_messages (
    id TEXT PRIMARY KEY,
    site_id TEXT NOT NULL,
    lead_id TEXT,
    sender TEXT,
    message TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
});

module.exports = db;
