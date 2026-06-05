# Deploy on Render

1. Create a new Web Service on Render.
2. Upload/connect this project.
3. Set build command:

```bash
npm install
```

4. Set start command:

```bash
npm start
```

5. Add environment variables:

```text
PORT=3000
SHOP_NAME=kontorgaarden.dk
WHATSAPP_NUMBER=45XXXXXXXX
ALLOWED_ORIGIN=https://kontorgaarden.dk
ADMIN_USER=your-admin-name
ADMIN_PASSWORD=your-strong-password
```

6. Deploy and copy your Render domain.
7. Add the widget script to Shopify `theme.liquid` before `</body>`.
