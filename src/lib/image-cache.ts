import "server-only";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fetchWithOptionalScraperProxy } from "@/lib/proxied-fetch";

const cacheDir = path.join(process.cwd(), ".image-cache");

type CachedImageMetadata = {
  contentType: string;
  extension: string;
  originalUrl: string;
};

type CachedImageFile = {
  buffer: Buffer;
  contentType: string;
  fileName: string;
  filePath: string;
};

function getCacheKey(url: string) {
  return createHash("sha256").update(url).digest("hex");
}

function sanitizeExtension(extension: string) {
  return extension.replace(/[^a-z0-9]/gi, "").toLowerCase();
}

function extensionFromContentType(contentType: string) {
  if (contentType.includes("png")) {
    return "png";
  }

  if (contentType.includes("webp")) {
    return "webp";
  }

  if (contentType.includes("gif")) {
    return "gif";
  }

  if (contentType.includes("svg")) {
    return "svg";
  }

  return "jpg";
}

function contentTypeFromBuffer(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }

  if (buffer.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) {
    return "image/jpeg";
  }

  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "image/webp";
  }

  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") {
    return "image/gif";
  }

  return null;
}

function extensionFromUrl(url: string) {
  try {
    const pathname = new URL(url).pathname;
    const extension = pathname.split(".").pop();
    return extension ? sanitizeExtension(extension) : "";
  } catch {
    return "";
  }
}

function getMetadataPath(key: string) {
  return path.join(cacheDir, `${key}.json`);
}

async function getCachedMetadata(key: string) {
  try {
    const raw = await fs.readFile(getMetadataPath(key), "utf8");
    return JSON.parse(raw) as CachedImageMetadata;
  } catch {
    return null;
  }
}

async function ensureCacheDir() {
  await fs.mkdir(cacheDir, { recursive: true });
}

async function getExistingFile(key: string, metadata: CachedImageMetadata) {
  const filePath = path.join(cacheDir, `${key}.${metadata.extension}`);

  try {
    const buffer = await fs.readFile(filePath);
    return {
      buffer,
      contentType: metadata.contentType,
      fileName: path.basename(filePath),
      filePath,
    } satisfies CachedImageFile;
  } catch {
    return null;
  }
}

export async function getCachedImageFile(url: string): Promise<CachedImageFile> {
  const key = getCacheKey(url);
  const existingMetadata = await getCachedMetadata(key);

  if (existingMetadata) {
    const existingFile = await getExistingFile(key, existingMetadata);

    if (existingFile) {
      return existingFile;
    }
  }

  await ensureCacheDir();

  const response = await fetchWithOptionalScraperProxy(url);

  if (!response.ok) {
    throw new Error(`Failed to fetch image: ${response.status}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const responseContentType = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase() ?? null;
  const contentType = responseContentType?.startsWith("image/") ? responseContentType : contentTypeFromBuffer(buffer);

  if (!contentType) {
    throw new Error(`Fetched resource is not an image: ${responseContentType ?? "missing content-type"}`);
  }

  const extension = extensionFromUrl(url) || extensionFromContentType(contentType);
  const metadata: CachedImageMetadata = {
    contentType,
    extension,
    originalUrl: url,
  };
  const filePath = path.join(cacheDir, `${key}.${extension}`);

  await fs.writeFile(filePath, buffer);
  await fs.writeFile(getMetadataPath(key), JSON.stringify(metadata, null, 2));

  return {
    buffer,
    contentType,
    fileName: path.basename(filePath),
    filePath,
  };
}

export async function getCachedImageAbsoluteUrl(url: string) {
  const baseUrl = process.env.APP_BASE_URL?.trim();

  if (!baseUrl) {
    return url;
  }

  return new URL(`/api/images/cache?url=${encodeURIComponent(url)}`, baseUrl).toString();
}
