import QRCode from "qrcode";
import type { CartItem } from "@/lib/types";
import { buildCartItemWhatsAppCaption, getUpstreamImageUrl } from "@/lib/cart-share";
import { getCachedImageAbsoluteUrl, getCachedImageFile } from "@/lib/image-cache";

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

type ClearChatInput = {
  to?: string | null;
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

function logWhatsApp(message: string, details?: Record<string, unknown>) {
  if (details) {
    console.log(`[whatsapp] ${message}`, details);
    return;
  }

  console.log(`[whatsapp] ${message}`);
}

function logWhatsAppError(message: string, error: unknown, details?: Record<string, unknown>) {
  console.error(`[whatsapp] ${message}`, {
    ...details,
    error: error instanceof Error ? error.message : String(error),
  });
}

function maskRecipient(recipient: string) {
  if (recipient.length <= 4) {
    return recipient;
  }

  return `${recipient.slice(0, 2)}***${recipient.slice(-2)}`;
}

function getProvider(): WhatsAppProvider {
  return process.env.WHATSAPP_PROVIDER === "meta" ? "meta" : "webjs";
}

function normalizeRecipient(value?: string | null) {
  const raw = value?.trim() ?? "";

  if (!raw) {
    return null;
  }

  if (raw.endsWith("@g.us") || raw.endsWith("@c.us")) {
    return raw;
  }

  const digits = raw.replace(/[^\d]/g, "");
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
  if (recipient.endsWith("@g.us") || recipient.endsWith("@c.us")) {
    return recipient;
  }

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
    logWhatsApp("reusing existing WhatsApp Web client promise", {
      state: webJsStore.state.state,
    });
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

  logWhatsApp("initializing WhatsApp Web client", {
    clientId: config.clientId,
    dataPath: config.dataPath,
    headless: config.headless,
  });

  client.on("qr", async (qr) => {
    logWhatsApp("received WhatsApp QR code");
    webJsStore.state = {
      state: "qr",
      qrCodeDataUrl: await QRCode.toDataURL(qr, { margin: 1, width: 280 }),
      error: null,
    };
  });

  client.on("ready", () => {
    logWhatsApp("WhatsApp Web client is ready");
    webJsStore.state = {
      state: "ready",
      qrCodeDataUrl: null,
      error: null,
    };
    webJsStore.resolveReady?.();
  });

  client.on("auth_failure", (message) => {
    logWhatsAppError("WhatsApp authentication failed", message);
    webJsStore.state = {
      state: "auth_failure",
      qrCodeDataUrl: null,
      error: message,
    };
  });

  client.on("disconnected", (reason) => {
    logWhatsAppError("WhatsApp Web client disconnected", reason);
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
    logWhatsAppError("failed to initialize WhatsApp Web client", error);
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
  logWhatsApp("waiting for WhatsApp Web readiness", { timeoutMs });
  await ensureWebJsClient();

  if (webJsStore.state.state === "ready") {
    logWhatsApp("WhatsApp Web already ready");
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

  logWhatsApp("WhatsApp Web became ready after waiting");
}

async function createMessageMedia(imageUrl: string) {
  logWhatsApp("loading cached WhatsApp media", { imageUrl });
  const file = await getCachedImageFile(imageUrl);
  const data = file.buffer.toString("base64");
  const { MessageMedia } = await import("whatsapp-web.js");

  return new MessageMedia(file.contentType, data, file.fileName || getFileName(imageUrl));
}

async function sendWithWebJs(input: SendCartInput): Promise<SendCartResult> {
  await waitForWebJsReady();

  const recipient = resolveRecipient(input.to);
  const chatId = getChatId(recipient);
  const activeClient = webJsStore.client;

  logWhatsApp("sending cart with WhatsApp Web", {
    recipient: maskRecipient(recipient),
    chatId,
    itemCount: input.items.length,
  });

  if (!activeClient) {
    throw new Error("WhatsApp Web client is unavailable.");
  }

  for (const item of input.items) {
    const caption = buildCartItemWhatsAppCaption(item);
    logWhatsApp("sending WhatsApp Web cart item", {
      recipient: maskRecipient(recipient),
      product: item.originalName,
      supermarket: item.supermarket,
    });
    const media = await createMessageMedia(getUpstreamImageUrl(item)).catch((error) => {
      logWhatsAppError("failed to prepare WhatsApp media, falling back to text", error, {
        product: item.originalName,
      });
      return null;
    });

    if (media) {
      await activeClient.sendMessage(chatId, media, { caption });
      logWhatsApp("sent WhatsApp Web image message", {
        recipient: maskRecipient(recipient),
        product: item.originalName,
      });
      continue;
    }

    await activeClient.sendMessage(chatId, caption);
    logWhatsApp("sent WhatsApp Web text message", {
      recipient: maskRecipient(recipient),
      product: item.originalName,
    });
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

  logWhatsApp("sending cart with Meta WhatsApp API", {
    recipient: maskRecipient(recipient),
    itemCount: input.items.length,
    apiVersion,
    phoneNumberId,
    hasAccessToken: Boolean(accessToken),
  });

  for (const item of input.items) {
    const imageUrl = await getCachedImageAbsoluteUrl(getUpstreamImageUrl(item));
    logWhatsApp("sending Meta WhatsApp cart item", {
      recipient: maskRecipient(recipient),
      product: item.originalName,
      supermarket: item.supermarket,
      imageUrl,
    });
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
      logWhatsAppError("Meta WhatsApp send failed", details, {
        recipient: maskRecipient(recipient),
        product: item.originalName,
      });
      throw new Error(`Meta WhatsApp send failed: ${details}`);
    }

    logWhatsApp("sent Meta WhatsApp image message", {
      recipient: maskRecipient(recipient),
      product: item.originalName,
    });
  }

  return {
    provider: "meta",
    sentCount: input.items.length,
    to: recipient,
  };
}

async function clearWebJsChat(input: ClearChatInput) {
  await waitForWebJsReady();

  const recipient = resolveRecipient(input.to);
  const chatId = getChatId(recipient);
  const activeClient = webJsStore.client;

  if (!activeClient) {
    throw new Error("WhatsApp Web client is unavailable.");
  }

  logWhatsApp("clearing WhatsApp Web chat", {
    recipient: maskRecipient(recipient),
    chatId,
  });

  const chat = await activeClient.getChatById(chatId).catch(() => null);

  if (!chat) {
    throw new Error("WhatsApp chat not found for this recipient.");
  }

  if (typeof chat.clearMessages !== "function") {
    throw new Error("This WhatsApp chat cannot be cleared.");
  }

  await chat.clearMessages();

  return {
    provider: "webjs" as const,
    to: recipient,
  };
}

export async function getWhatsAppStatus(): Promise<WhatsAppStatus> {
  const provider = getProvider();
  const defaultTo = normalizeRecipient(process.env.WHATSAPP_DEFAULT_TO);

  logWhatsApp("checking WhatsApp status", {
    provider,
    hasDefaultRecipient: Boolean(defaultTo),
  });

  if (provider === "meta") {
    try {
      getMetaConfig();
      logWhatsApp("Meta WhatsApp configuration is ready");
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
      logWhatsAppError("Meta WhatsApp configuration is invalid", error);
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
  } catch (error) {
    logWhatsAppError("failed while checking WhatsApp Web status", error);
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

  logWhatsApp("starting cart send", {
    provider: getProvider(),
    itemCount: input.items.length,
    hasExplicitRecipient: Boolean(input.to?.trim()),
  });

  if (getProvider() === "meta") {
    return sendWithMeta(input);
  }

  return sendWithWebJs(input);
}

export async function clearWhatsAppChat(input: ClearChatInput) {
  if (getProvider() === "meta") {
    throw new Error("Clearing chats is only supported with whatsapp-web.js.");
  }

  return clearWebJsChat(input);
}
