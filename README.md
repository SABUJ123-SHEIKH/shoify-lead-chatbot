# Universal Smart Lead Chatbot

This version works for Shopify or almost any website.

You enter a website URL in the admin panel, click **Scan website**, and the bot reads sitemap/product/page URLs. It saves titles, prices, text and links to a local knowledge base. When a customer asks for a product, size, budget or offer, the bot searches the website data and returns matching product/page links.

## Included

- Storefront chat widget
- Website crawler from sitemap.xml
- Knowledge base table
- Product/page matching answer system
- Lead form with name, phone, email, company, product interest, budget
- Admin lead inbox
- WhatsApp handoff

## Setup

```bash
npm install
npm start
```

Open:

```text
/health
/admin/crawl
/admin/pages
/admin/leads
```

## Render environment variables

```text
SITE_URL=https://www.arnehus.dk
ADMIN_USER=admin
ADMIN_PASSWORD=your-password
WHATSAPP_NUMBER=45XXXXXXXX
DB_PATH=/tmp/leads.sqlite
ALLOWED_ORIGIN=*
```

## Shopify install

Paste before `</body>` in `layout/theme.liquid`:

```html
<script src="https://YOUR-RENDER-URL.onrender.com/widget/chat-widget.js"></script>
```

After deploy, open:

```text
https://YOUR-RENDER-URL.onrender.com/admin/crawl
```

Add your website URL and click **Scan now**.
