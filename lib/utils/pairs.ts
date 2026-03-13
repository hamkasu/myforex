import type { ForexPair } from "@/types";

/** Decimal places to display prices for each pair */
export function getPairDecimals(pair: ForexPair): number {
  if (["GBP/JPY", "USD/JPY", "EUR/JPY"].includes(pair)) return 3;
  if (["SPX500", "NAS100", "GER40", "XAU/USD"].includes(pair)) return 2;
  return 5;
}

/**
 * Multiplier to convert a price diff into "pips" (or points for indices).
 * - Standard forex 5-decimal: ×10000 (0.0001 = 1 pip)
 * - JPY pairs 3-decimal:      ×100   (0.01   = 1 pip)
 * - XAU/USD:                  ×10    (0.1    = 1 tick, ~$0.10)
 * - Indices:                  ×1     (1.0    = 1 point)
 */
export function getPipFactor(pair: ForexPair): number {
  if (["GBP/JPY", "USD/JPY", "EUR/JPY"].includes(pair)) return 100;
  if (["SPX500", "NAS100", "GER40"].includes(pair)) return 1;
  if (pair === "XAU/USD") return 10;
  return 10000;
}

/** Human-readable pip/point label for the pair */
export function getPipLabel(pair: ForexPair): string {
  if (["SPX500", "NAS100", "GER40"].includes(pair)) return "pts";
  return "pips";
}

/** Category for grouping pairs in the UI */
export function getPairCategory(pair: ForexPair): "forex" | "indices" | "commodities" {
  if (["SPX500", "NAS100", "GER40"].includes(pair)) return "indices";
  if (pair === "XAU/USD") return "commodities";
  return "forex";
}
