# Smart Chatbot V3 Clean (PostgreSQL only)

Deploy-ready for Render. No sqlite3 dependency.

## Render settings
- Root Directory: empty if this package is repo root
- Build Command: `npm install`
- Start Command: `npm start`
- Node: 20

## Required Environment Variables
- `DATABASE_URL` = Neon/PostgreSQL connection string
- `ADMIN_USER` = admin
- `ADMIN_PASSWORD` = your strong password
- `DEFAULT_SITE_ID` = arnehus
- `OPENAI_API_KEY` = optional

## After deploy
1. Open `/health`
2. Open `/admin/sites`
3. Add site:
   - site_id: `arnehus`
   - URL: `https://www.arnehus.dk`
4. Open `/admin/crawl?site=arnehus` and scan.
5. Shopify theme snippet:

```html
<script>
  window.KG_SITE_ID = "arnehus";
</script>
<script src="https://shoify-lead-chatbot-1.onrender.com/widget/chat-widget.js"></script>
```
