import type { Candle } from "@/types";

export type StructureBias = "bullish" | "bearish" | "neutral";
export type BOSType = "bullish" | "bearish" | null;

export interface SwingPoint {
  index: number;
  price: number;
  type: "high" | "low";
}

export interface MarketStructureResult {
  structureBias: StructureBias;
  /** Most recent Break of Structure (trend continuation) */
  lastBOS: BOSType;
  /** Change of Character (potential trend reversal) */
  choch: BOSType;
  /** -2 to +2 */
  msScore: number;
  swingHighs: SwingPoint[];
  swingLows: SwingPoint[];
}

/**
 * Detect swing pivot highs and lows.
 * A pivot high requires `lookback` bars on each side with lower highs.
 * A pivot low requires `lookback` bars on each side with higher lows.
 */
function detectSwingPoints(
  candles: Candle[],
  lookback: number
): { highs: SwingPoint[]; lows: SwingPoint[] } {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];

  for (let i = lookback; i < candles.length - lookback; i++) {
    const c = candles[i];
    let isHigh = true;
    let isLow = true;

    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= c.high) isHigh = false;
      if (candles[j].low <= c.low) isLow = false;
    }

    if (isHigh) highs.push({ index: i, price: c.high, type: "high" });
    if (isLow) lows.push({ index: i, price: c.low, type: "low" });
  }

  return { highs, lows };
}

/**
 * Analyse market structure using swing pivots.
 *
 * Structure bias:
 *   Bullish = sequence of Higher Highs (HH) + Higher Lows (HL)
 *   Bearish = sequence of Lower Highs (LH) + Lower Lows (LL)
 *
 * BOS (Break of Structure) — trend continuation:
 *   Bullish BOS: in bullish structure, price closes above last swing high
 *   Bearish BOS: in bearish structure, price closes below last swing low
 *
 * CHOCH (Change of Character) — potential reversal:
 *   Bullish CHOCH: in bearish structure, price closes above last swing high
 *   Bearish CHOCH: in bullish structure, price closes below last swing low
 *
 * Score (-2 to +2):
 *   CHOCH (reversal, strong signal):  ±2
 *   BOS   (continuation):             ±1.5 → capped ±2
 *   Structure bias only:              ±1
 */
export function analyzeMarketStructure(
  candles: Candle[],
  lookback = 3
): MarketStructureResult {
  const empty: MarketStructureResult = {
    structureBias: "neutral",
    lastBOS: null,
    choch: null,
    msScore: 0,
    swingHighs: [],
    swingLows: [],
  };

  if (candles.length < lookback * 2 + 10) return empty;

  const { highs, lows } = detectSwingPoints(candles, lookback);
  if (highs.length < 2 || lows.length < 2) {
    return { ...empty, swingHighs: highs, swingLows: lows };
  }

  // Use last 3 pivots of each type to determine structure
  const recentHighs = highs.slice(-3);
  const recentLows = lows.slice(-3);

  let bullishVotes = 0;
  let bearishVotes = 0;

  for (let i = 1; i < recentHighs.length; i++) {
    if (recentHighs[i].price > recentHighs[i - 1].price) bullishVotes++; // HH
    else bearishVotes++;                                                    // LH
  }
  for (let i = 1; i < recentLows.length; i++) {
    if (recentLows[i].price > recentLows[i - 1].price) bullishVotes++;    // HL
    else bearishVotes++;                                                    // LL
  }

  let structureBias: StructureBias = "neutral";
  if (bullishVotes > bearishVotes) structureBias = "bullish";
  else if (bearishVotes > bullishVotes) structureBias = "bearish";

  const currentPrice = candles[candles.length - 1].close;
  const lastSwingHigh = highs[highs.length - 1];
  const lastSwingLow = lows[lows.length - 1];

  let lastBOS: BOSType = null;
  let choch: BOSType = null;

  if (structureBias === "bullish") {
    if (currentPrice > lastSwingHigh.price) {
      lastBOS = "bullish"; // confirms HH, trend continuation
    } else if (currentPrice < lastSwingLow.price) {
      choch = "bearish";   // breaks HL, character change → reversal warning
    }
  } else if (structureBias === "bearish") {
    if (currentPrice < lastSwingLow.price) {
      lastBOS = "bearish"; // confirms LL, trend continuation
    } else if (currentPrice > lastSwingHigh.price) {
      choch = "bullish";   // breaks LH, character change → reversal opportunity
    }
  } else {
    // Neutral: plain break of most recent pivot
    if (currentPrice > lastSwingHigh.price) lastBOS = "bullish";
    else if (currentPrice < lastSwingLow.price) lastBOS = "bearish";
  }

  // Build score — priority order: CHOCH > BOS > structure bias
  let score: number;
  if (choch === "bullish") {
    score = 2;
  } else if (choch === "bearish") {
    score = -2;
  } else if (lastBOS === "bullish") {
    score = 1.5;
  } else if (lastBOS === "bearish") {
    score = -1.5;
  } else {
    score = structureBias === "bullish" ? 1 : structureBias === "bearish" ? -1 : 0;
  }

  return {
    structureBias,
    lastBOS,
    choch,
    msScore: Math.max(-2, Math.min(2, score)),
    swingHighs: highs,
    swingLows: lows,
  };
}

/**
 * Compute a Multi-Timeframe (MTF) trend bias score from higher-TF candles.
 * Uses EMA cross (fast/slow) to determine HTF direction.
 *
 * Returns a score (-2 to +2) representing the HTF trend environment:
 *   +2: strongly bullish HTF (EMA cross bullish AND widening)
 *   +1: mildly bullish HTF
 *    0: neutral / insufficient data
 *   -1: mildly bearish HTF
 *   -2: strongly bearish HTF
 */
export function computeMTFScore(
  htfCandles: Candle[],
  fastPeriod = 20,
  slowPeriod = 50
): number {
  if (htfCandles.length < slowPeriod + 2) return 0;

  // Inline EMA to avoid circular import
  function ema(values: number[], period: number): number[] {
    const result: number[] = new Array(values.length).fill(NaN);
    const k = 2 / (period + 1);
    let prev = NaN;
    for (let i = 0; i < values.length; i++) {
      if (isNaN(prev)) {
        if (i >= period - 1) {
          prev = values.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
          result[i] = prev;
        }
      } else {
        prev = values[i] * k + prev * (1 - k);
        result[i] = prev;
      }
    }
    return result;
  }

  const closes = htfCandles.map((c) => c.close);
  const fastArr = ema(closes, fastPeriod);
  const slowArr = ema(closes, slowPeriod);

  const len = closes.length;
  const fast = fastArr[len - 1];
  const fastPrev = fastArr[len - 2] ?? fast;
  const slow = slowArr[len - 1];
  const slowPrev = slowArr[len - 2] ?? slow;

  if (isNaN(fast) || isNaN(slow)) return 0;

  const gap = fast - slow;
  const prevGap = fastPrev - slowPrev;
  const widening = Math.abs(gap) > Math.abs(prevGap);

  if (gap > 0) return widening ? 2 : 1;
  if (gap < 0) return widening ? -2 : -1;
  return 0;
}
