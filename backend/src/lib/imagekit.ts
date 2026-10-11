import ImageKit from "@imagekit/nodejs";
import { HttpError } from "../errors/http-error.js";
import { env } from "../config/env.js";

let imagekitClient: unknown = null;
const RESOLVED_PROOF_URL_TTL_MS = 15 * 60 * 1000;
const MAX_RESOLVED_PROOF_URLS = 300;
const resolvedProofUrls = new Map<string, { url: string; expiresAt: number }>();
const pendingProofUrlLookups = new Map<string, Promise<string | null>>();

type ImageKitConfig = {
  publicKey: string;
  privateKey: string;
  urlEndpoint: string;
};

function normalizeUrlEndpoint(urlEndpoint: string): string {
  return urlEndpoint.replace(/\/+$/, "");
}

function getConfigIfAvailable(): ImageKitConfig | null {
  if (!env.IMAGEKIT_PUBLIC_KEY || !env.IMAGEKIT_PRIVATE_KEY || !env.IMAGEKIT_URL_ENDPOINT) {
    return null;
  }
  return {
    publicKey: env.IMAGEKIT_PUBLIC_KEY,
    privateKey: env.IMAGEKIT_PRIVATE_KEY,
    urlEndpoint: normalizeUrlEndpoint(env.IMAGEKIT_URL_ENDPOINT)
  };
}

function getConfigOrThrow(): ImageKitConfig {
  const config = getConfigIfAvailable();
  if (!config) {
    throw new HttpError(503, "Le service de stockage de preuves n'est pas configure.");
  }
  return config;
}

function getClient(): any {
  if (imagekitClient) {
    return imagekitClient as any;
  }
  const config = getConfigOrThrow();
  imagekitClient = new (ImageKit as any)({
    publicKey: config.publicKey,
    privateKey: config.privateKey,
    urlEndpoint: config.urlEndpoint
  });
  return imagekitClient as any;
}

export function getImageKitUploadAuthParameters(): {
  uploadUrl: string;
  publicKey: string;
  urlEndpoint: string;
  token: string;
  expire: number;
  signature: string;
} {
  const config = getConfigOrThrow();
  const client = getClient();
  const { token, expire, signature } = client.helper.getAuthenticationParameters();

  return {
    uploadUrl: "https://upload.imagekit.io/api/v1/files/upload",
    publicKey: config.publicKey,
    urlEndpoint: config.urlEndpoint,
    token,
    expire,
    signature
  };
}

export async function resolveImageKitProofUrl(storageKey: string): Promise<string | null> {
  const key = storageKey.trim();
  if (!key) {
    return null;
  }

  if (key.startsWith("https://") || key.startsWith("http://")) {
    return key;
  }

  const config = getConfigIfAvailable();

  if (key.startsWith("/") && config) {
    return `${config.urlEndpoint}${key}`;
  }

  if (!config) {
    return null;
  }

  const cacheKey = `${config.urlEndpoint}:${key}`;
  const cached = resolvedProofUrls.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.url;
  }
  if (cached) {
    resolvedProofUrls.delete(cacheKey);
  }

  const pendingLookup = pendingProofUrlLookups.get(cacheKey);
  if (pendingLookup) {
    return pendingLookup;
  }

  const lookup = (async (): Promise<string | null> => {
    try {
      const client = getClient();
      const file = await client.files.get(key);
      const url = typeof file?.url === "string" ? file.url.trim() : "";
      if (!url) {
        return null;
      }

      resolvedProofUrls.set(cacheKey, {
        url,
        expiresAt: Date.now() + RESOLVED_PROOF_URL_TTL_MS
      });
      while (resolvedProofUrls.size > MAX_RESOLVED_PROOF_URLS) {
        const oldestKey = resolvedProofUrls.keys().next().value as string | undefined;
        if (!oldestKey) break;
        resolvedProofUrls.delete(oldestKey);
      }
      return url;
    } catch {
      return null;
    }
  })();
  pendingProofUrlLookups.set(cacheKey, lookup);

  try {
    return await lookup;
  } finally {
    if (pendingProofUrlLookups.get(cacheKey) === lookup) {
      pendingProofUrlLookups.delete(cacheKey);
    }
  }
}
