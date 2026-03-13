import type { Candle } from "@/types";

export interface StochResult {
  k: number;  // %K — fast stochastic (raw)
  d: number;  // %D = SMA(%K, dPeriod) — slow stochastic (signal line)
}

/**
 * Stochastic Oscillator (default: 14, 3, 3 — standard forex setting).
 *
 * How to read:
 *  %K < 20           → oversold zone (watch for bullish reversal)
 *  %K > 80           → overbought zone (watch for bearish reversal)
 *  %K crosses above %D while < 20  → buy signal
 *  %K crosses below %D while > 80  → sell signal
 *  Divergence with price → early trend reversal warning
 */
export function calculateStochastic(
  candles: Candle[],
  kPeriod = 14,
  dPeriod = 3,
): StochResult[] {
  const n = candles.length;

  // Compute raw %K
  const kLine = new Array(n).fill(NaN);
  for (let i = kPeriod - 1; i < n; i++) {
    let hi = -Infinity, lo = Infinity;
    for (let j = i - kPeriod + 1; j <= i; j++) {
      if (candles[j].high > hi) hi = candles[j].high;
      if (candles[j].low  < lo) lo = candles[j].low;
    }
    kLine[i] = hi === lo ? 50 : ((candles[i].close - lo) / (hi - lo)) * 100;
  }

  // Compute %D = SMA(%K, dPeriod)
  return kLine.map((k, i) => {
    if (i < kPeriod + dPeriod - 2) return { k, d: NaN };
    const window = kLine.slice(i - dPeriod + 1, i + 1);
    if (window.some(isNaN)) return { k, d: NaN };
    const d = window.reduce((a, b) => a + b, 0) / dPeriod;
    return { k, d };
  });
}
