import { ProxyAgent } from "undici";

type ProxiedRequestInit = RequestInit & {
  dispatcher?: ProxyAgent;
};

const proxiedHostnames = new Set([
  "ah.nl",
  "www.ah.nl",
  "static.ah.nl",
  "jumbo.com",
  "www.jumbo.com",
  "assets.jumbo.com",
]);

let proxyAgent: ProxyAgent | null = null;
let proxyAgentUrl: string | null = null;

function shouldProxyUrl(url: string) {
  try {
    const hostname = new URL(url).hostname.toLowerCase();
    return proxiedHostnames.has(hostname) || hostname.endsWith(".ah.nl") || hostname.endsWith(".jumbo.com");
  } catch {
    return false;
  }
}

function getProxyAgent() {
  const proxyUrl = process.env.SCRAPER_PROXY_URL?.trim();

  if (!proxyUrl) {
    return null;
  }

  if (!proxyAgent || proxyAgentUrl !== proxyUrl) {
    proxyAgent = new ProxyAgent(proxyUrl);
    proxyAgentUrl = proxyUrl;
  }

  return proxyAgent;
}

export function fetchWithOptionalScraperProxy(url: string, init: RequestInit = {}) {
  const agent = shouldProxyUrl(url) ? getProxyAgent() : null;

  if (!agent) {
    return fetch(url, init);
  }

  return fetch(url, {
    ...init,
    dispatcher: agent,
  } as ProxiedRequestInit);
}
