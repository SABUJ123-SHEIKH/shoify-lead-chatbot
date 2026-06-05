# Shopify Lead Chatbot App

A setup-ready MVP for Shopify stores that collects high-quality office furniture leads from a storefront chat widget and sends them to an admin lead inbox + WhatsApp handoff.

## What is included

- Storefront chat widget
- Lead form: name, phone, email, company, product interest, budget, message
- Auto bot replies for desks, office chairs, cheap furniture, delivery questions
- Admin lead inbox
- SQLite database
- WhatsApp prefilled lead handoff
- Simple production deployment guide

## Local setup

```bash
npm install
cp .env.example .env
npm start
```

Open:

```text
http://localhost:3000/health
http://localhost:3000/admin/leads
```

## Shopify theme install

Add this before `</body>` in `layout/theme.liquid`:

```liquid
<script>
  window.KG_CHAT_API = 'https://YOUR-APP-DOMAIN.com';
</script>
<script src="https://YOUR-APP-DOMAIN.com/widget/chat-widget.js" defer></script>
```

## Production notes

Use HTTPS hosting such as Render, Railway, DigitalOcean, VPS, or Shopify Hydrogen-compatible hosting. Protect `/admin/leads` using the ADMIN_USER and ADMIN_PASSWORD variables.
