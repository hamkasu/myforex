import type { Candle } from "@/types";

/**
 * Detect swing highs and lows using a rolling pivot detection.
 * A swing high is where candle[i].high > all highs in ±`lookback` window.
 */
function detectPivots(candles: Candle[], lookback = 5): {
  highs: number[];
  lows: number[];
} {
  const highs: number[] = [];
  const lows: number[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const windowHigh = candles.slice(i - lookback, i + lookback + 1).map((c) => c.high);
    const windowLow = candles.slice(i - lookback, i + lookback + 1).map((c) => c.low);

    if (candles[i].high === Math.max(...windowHigh)) {
      highs.push(candles[i].high);
    }
    if (candles[i].low === Math.min(...windowLow)) {
      lows.push(candles[i].low);
    }
  }

  return { highs, lows };
}

/** Cluster nearby levels within `tolerance` percentage of each other */
function clusterLevels(levels: number[], tolerance = 0.002): number[] {
  if (levels.length === 0) return [];
  const sorted = [...levels].sort((a, b) => a - b);
  const clusters: number[][] = [[sorted[0]]];

  for (let i = 1; i < sorted.length; i++) {
    const last = clusters[clusters.length - 1];
    const avg = last.reduce((s, v) => s + v, 0) / last.length;
    if (Math.abs(sorted[i] - avg) / avg < tolerance) {
      last.push(sorted[i]);
    } else {
      clusters.push([sorted[i]]);
    }
  }

  // Return average of each cluster
  return clusters.map((cl) => cl.reduce((s, v) => s + v, 0) / cl.length);
}

export interface SRLevels {
  support: number[];
  resistance: number[];
}

export function calculateSupportResistance(
  candles: Candle[],
  lookback = 5,
  maxLevels = 5
): SRLevels {
  if (candles.length < lookback * 2 + 1) {
    return { support: [], resistance: [] };
  }

  const { highs, lows } = detectPivots(candles, lookback);
  const currentPrice = candles[candles.length - 1].close;

  const clusteredHighs = clusterLevels(highs);
  const clusteredLows = clusterLevels(lows);

  // Resistance = pivot highs above current price
  const resistance = clusteredHighs
    .filter((h) => h > currentPrice)
    .sort((a, b) => a - b)
    .slice(0, maxLevels);

  // Support = pivot lows below current price
  const support = clusteredLows
    .filter((l) => l < currentPrice)
    .sort((a, b) => b - a)
    .slice(0, maxLevels);

  return { support, resistance };
}

/** True if price is within `proximityPct` of any support level */
export function nearSupport(
  price: number,
  support: number[],
  proximityPct = 0.003
): boolean {
  return support.some((s) => Math.abs(price - s) / s < proximityPct);
}

/** True if price is within `proximityPct` of any resistance level */
export function nearResistance(
  price: number,
  resistance: number[],
  proximityPct = 0.003
): boolean {
  return resistance.some((r) => Math.abs(price - r) / r < proximityPct);
}

/** True if price broke above a resistance level this candle */
export function brokeResistance(
  candle: Candle,
  prevClose: number,
  resistance: number[]
): boolean {
  return resistance.some((r) => prevClose < r && candle.close > r);
}

/** True if price broke below a support level this candle */
export function brokeSupport(
  candle: Candle,
  prevClose: number,
  support: number[]
): boolean {
  return support.some((s) => prevClose > s && candle.close < s);
}
