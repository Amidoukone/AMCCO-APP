const AMOUNT_SPACE_PATTERN = /[\s\u00a0\u202f]/g;

function normalizeDecimalAmount(input: string): string {
  return input.trim().replace(AMOUNT_SPACE_PATTERN, "").replace(",", ".");
}

export function normalizeAmountForApi(input: string, fallback = ""): string {
  const normalized = normalizeDecimalAmount(input);
  if (!normalized) return fallback;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? String(Math.sign(amount) * Math.round(Math.abs(amount))) : normalized;
}

export function toAmountNumber(input: string): number {
  const parsed = Number.parseFloat(normalizeDecimalAmount(input));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatAmountForDisplay(input: string | number): string {
  const rawValue = typeof input === "number" ? String(input) : input.trim();
  if (!rawValue) {
    return "";
  }

  const amount = Number(normalizeDecimalAmount(rawValue));
  if (!Number.isFinite(amount)) {
    return rawValue;
  }

  return new Intl.NumberFormat("fr-FR", {
    maximumFractionDigits: 0
  })
    .format(amount)
    .replace(/[\u202f\u00a0]/g, " ");
}

export function formatAmountForInput(input: string): string {
  const rawValue = input.trim();
  if (!rawValue) {
    return "";
  }

  const normalized = normalizeDecimalAmount(rawValue);
  if (normalized === "-") return normalized;
  if (!/^-?\d+(?:\.\d*)?$/.test(normalized)) return rawValue;
  return formatAmountForDisplay(normalized);
}

export function formatEditableAmountForInput(input: string): string {
  const rawValue = input.trim();
  if (!rawValue) return "";

  const compactValue = rawValue.replace(AMOUNT_SPACE_PATTERN, "");
  const sign = compactValue.startsWith("-") ? "-" : "";
  const unsignedValue = sign ? compactValue.slice(1) : compactValue;
  const normalizedValue = unsignedValue.replace(".", ",");
  const parts = normalizedValue.match(/^(\d*)(,?)(\d*)$/);
  if (!parts) return rawValue;

  const [, integerDigits, decimalSeparator, decimalDigits] = parts;
  if (!integerDigits && !decimalSeparator && !decimalDigits) return sign;

  const integerPart = integerDigits || (decimalSeparator ? "0" : "");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${groupedInteger}${decimalSeparator ? `,${decimalDigits}` : ""}`;
}
