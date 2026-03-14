import type { Candle, MACDResult } from "@/types";

export interface DivergenceResult {
  bullish: boolean;
  bearish: boolean;
  /** -2 to +2: combined RSI + MACD divergence score */
  score: number;
}

type Pivot = { price: number; rsi: number; macdHist: number };

/**
 * Regular divergence detection over a lookback window.
 *
 * Bullish: price makes lower low while RSI/MACD makes higher low  → upward reversal
 * Bearish: price makes higher high while RSI/MACD makes lower high → downward reversal
 *
 * Score: +1 per bullish divergence source (RSI, MACD), -1 per bearish. Clamped to [-2, +2].
 */
export function detectDivergence(
  candles: Candle[],
  rsiArr: number[],
  macdArr: MACDResult[],
  lookback = 20,
): DivergenceResult {
  const n = candles.length;
  if (n < lookback + 2) return { bullish: false, bearish: false, score: 0 };

  const rcndle = candles.slice(-lookback);
  const rrsi   = rsiArr.slice(-lookback);
  const rmacd  = macdArr.slice(-lookback);

  const lows: Pivot[]  = [];
  const highs: Pivot[] = [];

  for (let i = 1; i < rcndle.length - 1; i++) {
    const prev = rcndle[i - 1];
    const curr = rcndle[i];
    const next = rcndle[i + 1];

    if (curr.low <= prev.low && curr.low <= next.low) {
      lows.push({
        price:    curr.low,
        rsi:      rrsi[i],
        macdHist: rmacd[i]?.histogram ?? NaN,
      });
    }
    if (curr.high >= prev.high && curr.high >= next.high) {
      highs.push({
        price:    curr.high,
        rsi:      rrsi[i],
        macdHist: rmacd[i]?.histogram ?? NaN,
      });
    }
  }

  let score = 0;

  // Bullish RSI divergence: price LL, RSI HL
  if (lows.length >= 2) {
    const [p, c] = lows.slice(-2);
    if (c.price < p.price && !isNaN(c.rsi) && !isNaN(p.rsi) && c.rsi > p.rsi) score += 1;
  }

  // Bearish RSI divergence: price HH, RSI LH
  if (highs.length >= 2) {
    const [p, c] = highs.slice(-2);
    if (c.price > p.price && !isNaN(c.rsi) && !isNaN(p.rsi) && c.rsi < p.rsi) score -= 1;
  }

  // Bullish MACD histogram divergence: price LL, MACD HL
  if (lows.length >= 2) {
    const [p, c] = lows.slice(-2);
    if (
      c.price < p.price &&
      !isNaN(c.macdHist) && !isNaN(p.macdHist) &&
      c.macdHist > p.macdHist
    ) score += 1;
  }

  // Bearish MACD histogram divergence: price HH, MACD LH
  if (highs.length >= 2) {
    const [p, c] = highs.slice(-2);
    if (
      c.price > p.price &&
      !isNaN(c.macdHist) && !isNaN(p.macdHist) &&
      c.macdHist < p.macdHist
    ) score -= 1;
  }

  const clamped = Math.max(-2, Math.min(2, score));
  return { bullish: clamped > 0, bearish: clamped < 0, score: clamped };
}
