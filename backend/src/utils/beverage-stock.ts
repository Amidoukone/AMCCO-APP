import { HttpError } from "../errors/http-error.js";

// Quantities use thousandths; values use billionths of XOF. No floating point stock arithmetic.
export function stockDecimal(value: string, scale: number): bigint {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!new RegExp(`^\\d{1,21}(?:\\.\\d{1,${scale}})?$`).test(normalized)) {
    throw new HttpError(400, `Nombre invalide : au maximum ${scale} décimales.`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  return BigInt(whole) * 10n ** BigInt(scale) + BigInt(fraction.padEnd(scale, "0"));
}

export function stockFormat(value: bigint, scale: number): string {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(scale + 1, "0");
  return `${sign}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

export function saleStockCost(quantity: bigint, available: bigint, value: bigint): bigint {
  if (quantity <= 0n) throw new HttpError(400, "La quantité doit être supérieure à zéro.");
  if (quantity > available) throw new HttpError(409, `Stock insuffisant : ${stockFormat(available, 3)} disponible(s). Actualisez le stock et vérifiez la quantité.`);
  // Selling the last unit takes the entire remaining value, avoiding rounding residue.
  return quantity === available ? value : (value * quantity + available / 2n) / available;
}

export function averageStockCost(quantity: bigint, value: bigint): string {
  return quantity > 0n ? stockFormat((value + quantity / 2n) / quantity, 6) : "0.000000";
}
