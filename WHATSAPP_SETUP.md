# WhatsApp Setup

Copy `.env.example` into your local `.env` and choose a provider with `WHATSAPP_PROVIDER`.

## whatsapp-web.js

Use this for local or self-hosted setups without the official API.

Required values:

```env
WHATSAPP_PROVIDER=webjs
WHATSAPP_DEFAULT_TO=31612345678
APP_BASE_URL=http://localhost:3000
WHATSAPP_SESSION_NAME=shopping-assistant
WHATSAPP_WEBJS_DATA_PATH=.wwebjs_auth
WHATSAPP_WEBJS_HEADLESS=true
WHATSAPP_WEBJS_CHROME_PATH=
```

How it works:

1. Open `/cart`
2. Wait for the QR code to appear
3. Scan it in WhatsApp -> Linked Devices
4. Click `Send to WhatsApp`

The linked session is stored in `.wwebjs_auth/`.
Cached product images are stored in `.image-cache/` after the first load.

## Meta WhatsApp Cloud API

Use this for the official provider.

```env
WHATSAPP_PROVIDER=meta
WHATSAPP_DEFAULT_TO=31612345678
APP_BASE_URL=https://your-public-domain.example
WHATSAPP_ACCESS_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_META_API_VERSION=v23.0
```

With the Meta provider, the cart button sends product image messages through the Cloud API instead of `whatsapp-web.js`. Set `APP_BASE_URL` to a public URL if you want Meta to use your locally cached image route.
