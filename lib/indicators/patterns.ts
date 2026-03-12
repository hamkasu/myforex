import type { Candle, CandlePattern } from "@/types";

/** Body size relative to total range */
function bodyRatio(c: Candle): number {
  const range = c.high - c.low;
  if (range === 0) return 0;
  return Math.abs(c.close - c.open) / range;
}

/** Upper wick as fraction of total range */
function upperWickRatio(c: Candle): number {
  const range = c.high - c.low;
  if (range === 0) return 0;
  return (c.high - Math.max(c.open, c.close)) / range;
}

/** Lower wick as fraction of total range */
function lowerWickRatio(c: Candle): number {
  const range = c.high - c.low;
  if (range === 0) return 0;
  return (Math.min(c.open, c.close) - c.low) / range;
}

function isBullish(c: Candle) { return c.close > c.open; }
function isBearish(c: Candle) { return c.close < c.open; }

/** Bullish or bearish engulfing */
function detectEngulfing(prev: Candle, curr: Candle): CandlePattern | null {
  const bullish =
    isBearish(prev) &&
    isBullish(curr) &&
    curr.open <= prev.close &&
    curr.close >= prev.open;

  const bearish =
    isBullish(prev) &&
    isBearish(curr) &&
    curr.open >= prev.close &&
    curr.close <= prev.open;

  if (bullish) return { index: -1, type: "engulfing", direction: "bullish" };
  if (bearish) return { index: -1, type: "engulfing", direction: "bearish" };
  return null;
}

/** Pin bar (hammer or shooting star) */
function detectPinBar(c: Candle): CandlePattern | null {
  const body = bodyRatio(c);
  const lower = lowerWickRatio(c);
  const upper = upperWickRatio(c);

  // Bullish pin: long lower wick, small body at top
  if (lower > 0.6 && body < 0.25) {
    return { index: -1, type: "pin_bar", direction: "bullish" };
  }
  // Bearish pin: long upper wick, small body at bottom
  if (upper > 0.6 && body < 0.25) {
    return { index: -1, type: "pin_bar", direction: "bearish" };
  }
  return null;
}

/** Doji: body less than 10% of range */
function detectDoji(c: Candle): CandlePattern | null {
  if (bodyRatio(c) < 0.1 && c.high - c.low > 0) {
    return { index: -1, type: "doji", direction: "neutral" };
  }
  return null;
}

/** Hammer: bullish reversal – long lower wick, small upper wick */
function detectHammer(c: Candle): CandlePattern | null {
  const lower = lowerWickRatio(c);
  const upper = upperWickRatio(c);
  const body = bodyRatio(c);
  if (lower > 0.5 && upper < 0.1 && body > 0.2) {
    return { index: -1, type: "hammer", direction: "bullish" };
  }
  return null;
}

/** Shooting star: bearish reversal – long upper wick, small lower wick */
function detectShootingStar(c: Candle): CandlePattern | null {
  const upper = upperWickRatio(c);
  const lower = lowerWickRatio(c);
  const body = bodyRatio(c);
  if (upper > 0.5 && lower < 0.1 && body > 0.2) {
    return { index: -1, type: "shooting_star", direction: "bearish" };
  }
  return null;
}

/** Scan last N candles for patterns */
export function detectPatterns(candles: Candle[], lookback = 3): CandlePattern[] {
  const patterns: CandlePattern[] = [];
  const start = Math.max(1, candles.length - lookback);

  for (let i = start; i < candles.length; i++) {
    const c = candles[i];
    const prev = candles[i - 1];

    const engulf = detectEngulfing(prev, c);
    if (engulf) patterns.push({ ...engulf, index: i });

    const pin = detectPinBar(c);
    if (pin) patterns.push({ ...pin, index: i });

    const doji = detectDoji(c);
    if (doji) patterns.push({ ...doji, index: i });

    const hammer = detectHammer(c);
    if (hammer) patterns.push({ ...hammer, index: i });

    const star = detectShootingStar(c);
    if (star) patterns.push({ ...star, index: i });
  }

  return patterns;
}

export function patternLabel(p: CandlePattern): string {
  const labels: Record<string, string> = {
    engulfing: "Engulfing",
    pin_bar: "Pin Bar",
    doji: "Doji",
    hammer: "Hammer",
    shooting_star: "Shooting Star",
  };
  return `${p.direction === "bullish" ? "Bullish" : p.direction === "bearish" ? "Bearish" : ""} ${labels[p.type] || p.type}`.trim();
}
