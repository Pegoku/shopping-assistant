import { Client, LocalAuth } from "whatsapp-web.js";

function getWebJsConfig() {
  return {
    clientId: process.env.WHATSAPP_SESSION_NAME ?? "shopping-assistant",
    dataPath: process.env.WHATSAPP_WEBJS_DATA_PATH ?? ".wwebjs_auth",
    headless: process.env.WHATSAPP_WEBJS_HEADLESS !== "false",
    executablePath: process.env.WHATSAPP_WEBJS_CHROME_PATH || undefined,
  };
}

function ensureWebJsProvider() {
  const provider = process.env.WHATSAPP_PROVIDER ?? "webjs";

  if (provider !== "webjs") {
    throw new Error("This command only works with WHATSAPP_PROVIDER=webjs.");
  }
}

async function main() {
  ensureWebJsProvider();

  const config = getWebJsConfig();
  console.log("[whatsapp] listing groups", {
    clientId: config.clientId,
    dataPath: config.dataPath,
    headless: config.headless,
  });
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

  const ready = new Promise<void>((resolve) => {
    client.once("ready", () => {
      console.log("[whatsapp] groups command client is ready");
      resolve();
    });
  });

  const qr = new Promise<void>((_, reject) => {
    client.once("qr", () => {
      console.log("[whatsapp] groups command received QR event");
      reject(new Error("WhatsApp is not linked yet. Open /cart, scan the QR code, then rerun this command."));
    });
  });

  const authFailure = new Promise<void>((_, reject) => {
    client.once("auth_failure", (message) => {
      console.error("[whatsapp] groups command auth failure", { message });
      reject(new Error(`WhatsApp authentication failed: ${message}`));
    });
  });

  const disconnected = new Promise<void>((_, reject) => {
    client.once("disconnected", (reason) => {
      console.error("[whatsapp] groups command disconnected", { reason: String(reason) });
      reject(new Error(`WhatsApp disconnected: ${String(reason)}`));
    });
  });

  try {
    await client.initialize();
    await Promise.race([ready, qr, authFailure, disconnected]);

    const chats = await client.getChats();
    console.log("[whatsapp] fetched chats for groups command", {
      totalChats: chats.length,
    });
    const groups = chats
      .filter((chat) => chat.isGroup)
      .map((chat) => ({
        name: chat.name,
        id: chat.id._serialized,
      }))
      .sort((left, right) => left.name.localeCompare(right.name));

    if (!groups.length) {
      console.log("No WhatsApp groups found for this linked account.");
      return;
    }

    console.log("[whatsapp] resolved group count", { count: groups.length });

    for (const group of groups) {
      console.log(`${group.name}: ${group.id}`);
    }
  } finally {
    await client.destroy().catch(() => undefined);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "Failed to list WhatsApp groups.");
  process.exit(1);
});
