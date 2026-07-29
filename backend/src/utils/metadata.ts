export function toMetadataStringMap(value: unknown): Record<string, string> {
  if (!value) {
    return {};
  }

  if (typeof value === "string") {
    try {
      return toMetadataStringMap(JSON.parse(value));
    } catch {
      return {};
    }
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => {
        const normalizedKey = key.trim();
        if (!normalizedKey || item === null || item === undefined) {
          return null;
        }
        if (typeof item === "string") {
          return [normalizedKey, item];
        }
        if (typeof item === "number" || typeof item === "boolean") {
          return [normalizedKey, String(item)];
        }
        return null;
      })
      .filter((entry): entry is [string, string] => entry !== null)
  );
}
