const AMOUNT_SPACE_PATTERN = /[\s\u00a0\u202f]/g;

export function normalizeAmountForApi(input: string, fallback = ""): string {
  const normalized = input.trim().replace(AMOUNT_SPACE_PATTERN, "").replace(",", ".");
  return normalized || fallback;
}

export function toAmountNumber(input: string): number {
  const parsed = Number.parseFloat(normalizeAmountForApi(input));
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatAmountForDisplay(input: string | number): string {
  const rawValue = typeof input === "number" ? String(input) : input.trim();
  if (!rawValue) {
    return "";
  }

  const amount = Number(normalizeAmountForApi(rawValue));
  if (!Number.isFinite(amount)) {
    return rawValue;
  }

  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
    .format(amount)
    .replace(/[\u202f\u00a0]/g, " ");
}

export function formatAmountForInput(input: string): string {
  const rawValue = input.trim();
  if (!rawValue) {
    return "";
  }

  const compactValue = rawValue.replace(AMOUNT_SPACE_PATTERN, "");
  const sign = compactValue.startsWith("-") ? "-" : "";
  const unsignedValue = sign ? compactValue.slice(1) : compactValue;
  const normalizedValue = unsignedValue.replace(".", ",");
  const parts = normalizedValue.match(/^(\d*)(,?)(\d*)$/);
  if (!parts) {
    return rawValue;
  }

  const [, integerDigits, decimalSeparator, decimalDigits] = parts;
  if (!integerDigits && !decimalSeparator && !decimalDigits) {
    return sign;
  }

  const integerPart = integerDigits || (decimalSeparator ? "0" : "");
  const groupedInteger = integerPart.replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${groupedInteger}${decimalSeparator ? `,${decimalDigits}` : ""}`;
}
