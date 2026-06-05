
require('dotenv').config();
new sqlite3.Database(process.env.DB_PATH || "/tmp/leads.sqlite");
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { v4: uuidv4 } = require('uuid');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigin = process.env.ALLOWED_ORIGIN || '*';
const whatsappNumber = process.env.WHATSAPP_NUMBER || '';
const adminUser = process.env.ADMIN_USER || 'admin';
const adminPassword = process.env.ADMIN_PASSWORD || 'change-this-strong-password';

app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: allowedOrigin === '*' ? true : allowedOrigin }));
app.use(express.json({ limit: '200kb' }));
app.use('/widget', express.static(__dirname + '/../public'));

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[char]));
}

function requireAdmin(req, res, next) {
  const auth = req.headers.authorization || '';
  const token = auth.startsWith('Basic ') ? auth.slice(6) : '';
  const [user, pass] = Buffer.from(token, 'base64').toString().split(':');
  if (user === adminUser && pass === adminPassword) return next();
  res.set('WWW-Authenticate', 'Basic realm="Lead Inbox"');
  return res.status(401).send('Login required');
}

function botReply(message = '') {
  const text = message.toLowerCase();
  if (text.includes('cheap') || text.includes('billig') || text.includes('budget')) {
    return 'Yes, we can help with affordable office furniture. Are you looking for desks, office chairs, meeting tables, or bulk office setup?';
  }
  if (text.includes('desk') || text.includes('bord') || text.includes('skrivebord')) {
    return 'Great. What size do you need: 120x80, 140x80, 160x80, or 180x80? Also, do you prefer used desks or hæve-sænkebord?';
  }
  if (text.includes('chair') || text.includes('stol') || text.includes('kontorstol')) {
    return 'We can help with ergonomic office chairs. Do you need 1 chair or multiple chairs for a company?';
  }
  if (text.includes('delivery') || text.includes('fragt')) {
    return 'We offer delivery options. Share your city and product interest, then our team can send an exact offer.';
  }
  return 'Thanks. I can help you find office furniture. What are you looking for, and what is your budget?';
}

app.get('/health', (req, res) => res.json({ ok: true }));

app.post('/api/chat', (req, res) => {
  const { leadId, message } = req.body || {};
  if (!message || message.length > 1000) return res.status(400).json({ error: 'Message is required.' });
  const currentLeadId = leadId || uuidv4();
  const msgId = uuidv4();
  const replyId = uuidv4();
  const reply = botReply(message);

  db.run(`INSERT OR IGNORE INTO leads (id, source_page, message) VALUES (?, ?, ?)`, [currentLeadId, req.headers.referer || '', message]);
  db.run(`INSERT INTO chat_messages (id, lead_id, sender, message) VALUES (?, ?, ?, ?)`, [msgId, currentLeadId, 'customer', message]);
  db.run(`INSERT INTO chat_messages (id, lead_id, sender, message) VALUES (?, ?, ?, ?)`, [replyId, currentLeadId, 'bot', reply]);

  res.json({ leadId: currentLeadId, reply });
});

app.post('/api/leads', (req, res) => {
  const id = req.body.leadId || uuidv4();
  const data = {
    name: req.body.name || '',
    email: req.body.email || '',
    phone: req.body.phone || '',
    company: req.body.company || '',
    product_interest: req.body.productInterest || '',
    budget: req.body.budget || '',
    message: req.body.message || '',
    source_page: req.body.sourcePage || req.headers.referer || ''
  };

  if (!data.phone && !data.email) return res.status(400).json({ error: 'Phone or email is required.' });

  db.run(`INSERT INTO leads (id, name, email, phone, company, product_interest, budget, message, source_page)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
          name=excluded.name, email=excluded.email, phone=excluded.phone, company=excluded.company,
          product_interest=excluded.product_interest, budget=excluded.budget, message=excluded.message, source_page=excluded.source_page`,
    [id, data.name, data.email, data.phone, data.company, data.product_interest, data.budget, data.message, data.source_page],
    (err) => {
      if (err) return res.status(500).json({ error: 'Could not save lead.' });
      const waText = encodeURIComponent(`New office furniture lead\nName: ${data.name}\nPhone: ${data.phone}\nProduct: ${data.product_interest}\nBudget: ${data.budget}\nMessage: ${data.message}`);
      res.json({ ok: true, leadId: id, whatsappUrl: whatsappNumber ? `https://wa.me/${whatsappNumber}?text=${waText}` : '' });
    });
});

app.get('/admin/leads', requireAdmin, (req, res) => {
  db.all(`SELECT * FROM leads ORDER BY created_at DESC LIMIT 200`, [], (err, rows) => {
    if (err) return res.status(500).send('Database error');
    const htmlRows = rows.map(l => `<tr><td>${escapeHtml(l.created_at)}</td><td>${escapeHtml(l.name)}</td><td>${escapeHtml(l.phone)}</td><td>${escapeHtml(l.email)}</td><td>${escapeHtml(l.company)}</td><td>${escapeHtml(l.product_interest)}</td><td>${escapeHtml(l.budget)}</td><td>${escapeHtml(l.message)}</td><td>${escapeHtml(l.source_page)}</td></tr>`).join('');
    res.send(`<!doctype html><html><head><title>Lead Inbox</title><style>body{font-family:Arial;padding:24px;background:#f7f7f7}table{border-collapse:collapse;width:100%;background:#fff}td,th{border:1px solid #ddd;padding:10px;font-size:13px}th{background:#111;color:#fff}</style></head><body><h1>Lead Inbox</h1><table><tr><th>Date</th><th>Name</th><th>Phone</th><th>Email</th><th>Company</th><th>Interest</th><th>Budget</th><th>Message</th><th>Source</th></tr>${htmlRows}</table></body></html>`);
  });
});

app.listen(PORT, () => console.log(`Lead chatbot app running on port ${PORT}`));
