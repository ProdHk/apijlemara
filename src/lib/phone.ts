// src/lib/phone.ts
export function digits(v?: string | null) {
  return String(v || "").replace(/\D+/g, "");
}

/**
 * BR_BASE10:
 * - remove 55 se existir
 * - se tiver 11 (DDD + 9 + 8) remove o 9 (vira 10)
 * - se tiver 10 (DDD + 8) mantém
 * - fallback: retorna o que tiver
 *
 * Exemplos:
 *  5531996949766 -> 31996949766 -> remove 9 -> 3196949766
 *  31996949766   -> remove 9 -> 3196949766
 *  3189062492    -> mantém -> 3189062492
 */
export function normalizeBRBase10(input: string) {
  let d = digits(input);

  // remove country code BR
  if (d.startsWith("55") && d.length >= 12) d = d.slice(2);

  // (DDD + 9 + 8) => 11 dígitos, remove o '9' após o DDD
  if (d.length === 11 && d[2] === "9") {
    d = d.slice(0, 2) + d.slice(3);
  }

  return d; // ideal: 10 dígitos
}
