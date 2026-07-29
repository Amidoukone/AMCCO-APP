export type ImageKitUploadResult = {
  fileId?: string;
  filePath?: string;
  url?: string;
  name?: string;
  size?: number | string;
  fileType?: string;
};

const STORAGE_KEY_MAX_LENGTH = 255;
const FILE_NAME_MAX_LENGTH = 255;

function firstUsableValue(values: Array<string | undefined>): string | null {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized && normalized.length <= STORAGE_KEY_MAX_LENGTH) {
      return normalized;
    }
  }
  return null;
}

export function resolveImageKitStorageKey(
  uploaded: ImageKitUploadResult,
  fallbackFileName: string
): string {
  return (
    firstUsableValue([uploaded.filePath, uploaded.fileId, uploaded.url, fallbackFileName]) ??
    fallbackFileName.slice(0, STORAGE_KEY_MAX_LENGTH)
  );
}

export function resolveImageKitFileName(
  uploaded: ImageKitUploadResult,
  fallbackFileName: string
): string {
  const name = uploaded.name?.trim() || fallbackFileName.trim() || "piece-jointe";
  return name.slice(0, FILE_NAME_MAX_LENGTH);
}

export function resolveImageKitFileSize(
  uploaded: ImageKitUploadResult,
  fallbackFileSize: number
): number {
  const parsed = typeof uploaded.size === "string" ? Number(uploaded.size) : uploaded.size;
  return typeof parsed === "number" && Number.isInteger(parsed) && parsed > 0
    ? parsed
    : fallbackFileSize;
}
