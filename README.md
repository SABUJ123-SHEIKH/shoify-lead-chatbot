# AI Agent Multi-site Shopify Chatbot v4

A Render-ready AI sales agent chatbot for 10-15 websites. It syncs Shopify products from `/products.json`, stores products/leads in PostgreSQL/Neon, answers customer questions with product links/prices, can handle general Q&A with AI, and collects leads.

## Render setup
Build command: `npm install`
Start command: `npm start`

Environment variables:
- `DATABASE_URL` Neon PostgreSQL connection string
- `ADMIN_USER` admin username
- `ADMIN_PASSWORD` admin password
- `NODE_VERSION=20`
- `OPENAI_API_KEY` optional, for smarter AI answers
- `OPENAI_MODEL=gpt-4.1-mini`

## Admin URLs
- `/health`
- `/admin/sites`
- `/admin/crawl?site=arnehus`
- `/admin/pages?site=arnehus`
- `/admin/leads?site=arnehus`
- `/admin/faqs?site=arnehus`

## Shopify install
Paste before `</body>` in theme.liquid:

```html
<script>window.KG_SITE_ID="arnehus";</script>
<script src="https://YOUR-RENDER-URL.onrender.com/widget/chat-widget.js"></script>
```

Optional overrides:
- `window.KG_CHAT_API` to point the widget at a custom API host
- `data-site-id="arnehus"` on the widget script tag

## First setup
1. Create Neon database and add `DATABASE_URL` to Render.
2. Deploy.
3. Open `/admin/sites`, add site id `arnehus`, URL `https://www.arnehus.dk`, name `Arnehus`.
4. Open `/admin/crawl?site=arnehus`, click Sync.
5. Add shipping / returns / support answers in `/admin/faqs?site=arnehus`.
6. Open website and test: `height adjustable desk 180x80 budget 1500` or a general question like `what shipping options do you offer?`.
