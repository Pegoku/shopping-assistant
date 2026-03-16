import QRCode from "qrcode";
import type { CartItem } from "@/lib/types";
import { buildCartItemWhatsAppCaption, getShareableImageUrl } from "@/lib/cart-share";

export type WhatsAppProvider = "webjs" | "meta";

export type WhatsAppStatus = {
  provider: WhatsAppProvider;
  ready: boolean;
  defaultTo: string | null;
  requiresRecipient: boolean;
  auth: {
    state: "idle" | "initializing" | "qr" | "ready" | "auth_failure" | "disconnected";
    qrCodeDataUrl: string | null;
    error: string | null;
  };
};

type SendCartInput = {
  items: CartItem[];
  to?: string | null;
};

type SendCartResult = {
  provider: WhatsAppProvider;
  sentCount: number;
  to: string;
};

type WebJsState = WhatsAppStatus["auth"];

type WebJsStore = {
  client: any;
  clientPromise: Promise<void> | null;
  readyPromise: Promise<void> | null;
  resolveReady: (() => void) | null;
  state: WebJsState;
};

const globalStore = globalThis as typeof globalThis & {
  __shoppingAssistantWhatsappStore?: WebJsStore;
};

const webJsStore =
  globalStore.__shoppingAssistantWhatsappStore ??
  (globalStore.__shoppingAssistantWhatsappStore = {
    client: null,
    clientPromise: null,
    readyPromise: null,
    resolveReady: null,
    state: {
      state: "idle",
      qrCodeDataUrl: null,
      error: null,
    },
  });

function getProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === "meta" ? "meta" : "webjs";
}

function normalizeRecipient(value?: string | null) {
  const digits = value?.replace(/[^\d]/g, "") ?? "";
  return digits || null;
}

function resolveRecipient(value?: string | null) {
  const recipient = normalizeRecipient(value) ?? normalizeRecipient(process.env.WHATSAPP_DEFAULT_TO);

  if (!recipient) {
    throw new Error("Missing WhatsApp recipient. Set WHATSAPP_DEFAULT_TO or enter a phone number in the cart.");
  }

  return recipient;
}

function getWebJsConfig() {
  return {
    clientId: process.env.WHATSAPP_SESSION_NAME ?? "shopping-assistant",
    dataPath: process.env.WHATSAPP_WEBJS_DATA_PATH ?? ".wwebjs_auth",
    headless: process.env.WHATSAPP_WEBJS_HEADLESS !== "false",
    executablePath: process.env.WHATSAPP_WEBJS_CHROME_PATH || undefined,
  };
}

function getMetaConfig() {
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_META_API_VERSION ?? "v23.0";

  if (!accessToken || !phoneNumberId) {
    throw new Error("Missing Meta WhatsApp configuration. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.");
  }

  return { accessToken, phoneNumberId, apiVersion };
}

function getChatId(recipient: string) {
  return `${recipient}@c.us`;
}

function getFileName(imageUrl: string) {
  try {
    const url = new URL(imageUrl);
    const segment = url.pathname.split("/").pop();
    return segment && segment.includes(".") ? segment : "product.jpg";
  } catch {
    return "product.jpg";
  }
}

function resetReadyPromise() {
  webJsStore.readyPromise = new Promise<void>((resolve) => {
    webJsStore.resolveReady = resolve;
  });
}

async function ensureWebJsClient() {
  if (webJsStore.clientPromise) {
    await webJsStore.clientPromise;
    return;
  }

  const { Client, LocalAuth } = await import("whatsapp-web.js");
  const config = getWebJsConfig();

  resetReadyPromise();
  webJsStore.state = {
    state: "initializing",
    qrCodeDataUrl: null,
    error: null,
  };

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: config.clientId,
      dataPath: config.dataPath,
    }),
    puppeteer: {
      headless: config.headless,
      executablePath: config.executablePath,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  webJsStore.client = client;

  client.on("qr", async (qr) => {
    webJsStore.state = {
      state: "qr",
      qrCodeDataUrl: await QRCode.toDataURL(qr, { margin: 1, width: 280 }),
      error: null,
    };
  });

  client.on("ready", () => {
    webJsStore.state = {
      state: "ready",
      qrCodeDataUrl: null,
      error: null,
    };
    webJsStore.resolveReady?.();
  });

  client.on("auth_failure", (message) => {
    webJsStore.state = {
      state: "auth_failure",
      qrCodeDataUrl: null,
      error: message,
    };
  });

  client.on("disconnected", (reason) => {
    webJsStore.client = null;
    webJsStore.clientPromise = null;
    resetReadyPromise();
    webJsStore.state = {
      state: "disconnected",
      qrCodeDataUrl: null,
      error: String(reason),
    };
  });

  webJsStore.clientPromise = client.initialize().catch((error) => {
    webJsStore.client = null;
    webJsStore.clientPromise = null;
    webJsStore.state = {
      state: "auth_failure",
      qrCodeDataUrl: null,
      error: error instanceof Error ? error.message : "Failed to initialize WhatsApp Web",
    };
    throw error;
  });

  await webJsStore.clientPromise;
}

async function waitForWebJsReady(timeoutMs = 30000) {
  await ensureWebJsClient();

  if (webJsStore.state.state === "ready") {
    return;
  }

  const readyPromise = webJsStore.readyPromise;

  if (!readyPromise) {
    throw new Error("WhatsApp Web is not ready.");
  }

  await Promise.race([
    readyPromise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error("WhatsApp Web is not ready yet. Scan the QR code first.")), timeoutMs);
    }),
  ]);
}

async function createMessageMedia(imageUrl: string) {
  const response = await fetch(imageUrl);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const contentType = response.headers.get("content-type") ?? "image/jpeg";
  const data = Buffer.from(await response.arrayBuffer()).toString("base64");
  const { MessageMedia } = await import("whatsapp-web.js");

  return new MessageMedia(contentType, data, getFileName(imageUrl));
}

async function sendWithWebJs(input: SendCartInput): Promise<SendCartResult> {
  await waitForWebJsReady();

  const recipient = resolveRecipient(input.to);
  const chatId = getChatId(recipient);
  const activeClient = webJsStore.client;

  if (!activeClient) {
    throw new Error("WhatsApp Web client is unavailable.");
  }

  for (const item of input.items) {
    const caption = buildCartItemWhatsAppCaption(item);
    const media = await createMessageMedia(getShareableImageUrl(item)).catch(() => null);

    if (media) {
      await activeClient.sendMessage(chatId, media, { caption });
      continue;
    }

    await activeClient.sendMessage(chatId, caption);
  }

  return {
    provider: "webjs",
    sentCount: input.items.length,
    to: recipient,
  };
}

async function sendWithMeta(input: SendCartInput): Promise<SendCartResult> {
  const recipient = resolveRecipient(input.to);
  const { accessToken, apiVersion, phoneNumberId } = getMetaConfig();

  for (const item of input.items) {
    const imageUrl = getShareableImageUrl(item);
    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: recipient,
        type: "image",
        image: {
          link: imageUrl,
          caption: buildCartItemWhatsAppCaption(item),
        },
      }),
    });

    if (!response.ok) {
      const details = await response.text();
      throw new Error(`Meta WhatsApp send failed: ${details}`);
    }
  }

  return {
    provider: "meta",
    sentCount: input.items.length,
    to: recipient,
  };
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const provider = getProvider();
  const defaultTo = normalizeRecipient(process.env.WHATSAPP_DEFAULT_TO);

  if (provider === "meta") {
    try {
      getMetaConfig();
      return {
        provider,
        ready: true,
        defaultTo,
        requiresRecipient: !defaultTo,
        auth: {
          state: "ready",
          qrCodeDataUrl: null,
          error: null,
        },
      };
    } catch (error) {
      return {
        provider,
        ready: false,
        defaultTo,
        requiresRecipient: !defaultTo,
        auth: {
          state: "auth_failure",
          qrCodeDataUrl: null,
          error: error instanceof Error ? error.message : "Invalid Meta WhatsApp configuration",
        },
      };
    }
  }

  try {
    await ensureWebJsClient();
  } catch {
  }

  return {
    provider,
    ready: webJsStore.state.state === "ready",
    defaultTo,
    requiresRecipient: !defaultTo,
    auth: webJsStore.state,
  };
}

export async function sendCartToWhatsApp(input: SendCartInput) {
  if (!input.items.length) {
    throw new Error("Cart is empty.");
  }

  if (getProvider() === "meta") {
    return sendWithMeta(input);
  }

  return sendWithWebJs(input);
}
