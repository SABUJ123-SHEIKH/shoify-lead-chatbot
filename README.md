# Multi-site Smart Lead Chatbot

One chatbot backend for 10-15 websites. Each website has its own site_id, URL, products/pages knowledge base, WhatsApp number, and leads.

## Render setup
Build command: `npm install`
Start command: `npm start`

Environment variables:
- ADMIN_USER=admin
- ADMIN_PASSWORD=yourStrongPassword
- DB_PATH=/tmp/multisite-chatbot.sqlite
- DATABASE_URL= optional PostgreSQL URL, recommended for production

## Admin URLs
- `/health`
- `/admin/sites`
- `/admin/crawl?site=arnehus`
- `/admin/pages?site=arnehus`
- `/admin/leads?site=arnehus`

## Website script
```html
<script>
  window.KG_SITE_ID = "arnehus";
</script>
<script src="https://YOUR-RENDER-URL.onrender.com/widget/chat-widget.js"></script>
```

For another website, use another site ID.
