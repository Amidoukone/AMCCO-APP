import ImageKit from "@imagekit/nodejs";
import { HttpError } from "../errors/http-error.js";
import { env } from "../config/env.js";

let imagekitClient: unknown = null;

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

  try {
    const client = getClient();
    const file = await client.files.get(key);
    if (typeof file?.url === "string" && file.url.trim().length > 0) {
      return file.url;
    }
    return null;
  } catch {
    return null;
  }
}
