# Shopify install guide

## 1. Upload app to hosting

Use Render, Railway, DigitalOcean, VPS, or another Node.js host.

## 2. Configure environment variables

Copy `.env.example` to `.env` and update:

```text
WHATSAPP_NUMBER=45XXXXXXXX
ALLOWED_ORIGIN=https://kontorgaarden.dk
ADMIN_USER=your-admin-name
ADMIN_PASSWORD=your-strong-password
```

## 3. Run app

```bash
npm install
npm start
```

## 4. Add widget to Shopify

Shopify Admin → Online Store → Themes → Edit code → `layout/theme.liquid`

Add before `</body>`:

```liquid
<script>
  window.KG_CHAT_API = 'https://your-app-domain.com';
</script>
<script src="https://your-app-domain.com/widget/chat-widget.js" defer></script>
```

## 5. Open lead inbox

```text
https://your-app-domain.com/admin/leads
```

Login using `ADMIN_USER` and `ADMIN_PASSWORD`.
