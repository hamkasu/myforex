import type { Candle, Timeframe } from "@/types";

/**
 * Number of lower-TF candles that form one higher-TF candle.
 * 1h → 4h : factor 4
 * 4h → 1d : factor 6  (approximate — forex ~24h session / 4h)
 */
export function getDownsampleFactor(tf: Timeframe): number {
  if (tf === "1h") return 4;
  if (tf === "4h") return 6;
  return 1; // 1d has no higher TF
}

/**
 * Combine every `factor` consecutive candles into one higher-TF candle.
 * Groups are built oldest-first; any trailing candles that don't fill a
 * complete group are dropped (no partial bars).
 */
export function downsampleCandles(candles: Candle[], factor: number): Candle[] {
  if (factor <= 1 || candles.length < factor) return [];
  const result: Candle[] = [];
  for (let i = 0; i + factor <= candles.length; i += factor) {
    const group = candles.slice(i, i + factor);
    result.push({
      time:   group[group.length - 1].time,
      open:   group[0].open,
      high:   Math.max(...group.map((c) => c.high)),
      low:    Math.min(...group.map((c) => c.low)),
      close:  group[group.length - 1].close,
      volume: group.reduce((s, c) => s + (c.volume ?? 0), 0),
    });
  }
  return result;
}
