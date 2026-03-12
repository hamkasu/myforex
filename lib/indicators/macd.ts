import { calculateEMA } from "./ema";
import type { MACDResult } from "@/types";

/**
 * MACD: (EMA12 - EMA26), Signal: EMA9 of MACD, Histogram: MACD - Signal
 */
export function calculateMACD(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): MACDResult[] {
  const emaFast = calculateEMA(closes, fastPeriod);
  const emaSlow = calculateEMA(closes, slowPeriod);

  // MACD line (only where both EMAs are valid)
  const macdLine: number[] = closes.map((_, i) => {
    if (isNaN(emaFast[i]) || isNaN(emaSlow[i])) return NaN;
    return emaFast[i] - emaSlow[i];
  });

  // Signal line = EMA9 of MACD line (skip NaN leading values)
  const firstValid = macdLine.findIndex((v) => !isNaN(v));
  const signalLine: number[] = new Array(closes.length).fill(NaN);

  if (firstValid >= 0) {
    const validMacd = macdLine.slice(firstValid);
    const sig = calculateEMA(validMacd, signalPeriod);
    sig.forEach((v, i) => {
      signalLine[firstValid + i] = v;
    });
  }

  return closes.map((_, i) => ({
    macdLine: macdLine[i],
    signalLine: signalLine[i],
    histogram: isNaN(macdLine[i]) || isNaN(signalLine[i])
      ? NaN
      : macdLine[i] - signalLine[i],
  }));
}

export function latestMACD(closes: number[]): MACDResult {
  const results = calculateMACD(closes);
  for (let i = results.length - 1; i >= 0; i--) {
    if (!isNaN(results[i].histogram)) return results[i];
  }
  return { macdLine: NaN, signalLine: NaN, histogram: NaN };
}

/** True if MACD line crossed above signal line on the most recent candle */
export function macdBullishCross(macd: MACDResult[]): boolean {
  if (macd.length < 2) return false;
  const cur = macd[macd.length - 1];
  const prev = macd[macd.length - 2];
  return (
    !isNaN(cur.macdLine) &&
    !isNaN(prev.macdLine) &&
    prev.macdLine <= prev.signalLine &&
    cur.macdLine > cur.signalLine
  );
}

/** True if MACD line crossed below signal line on the most recent candle */
export function macdBearishCross(macd: MACDResult[]): boolean {
  if (macd.length < 2) return false;
  const cur = macd[macd.length - 1];
  const prev = macd[macd.length - 2];
  return (
    !isNaN(cur.macdLine) &&
    !isNaN(prev.macdLine) &&
    prev.macdLine >= prev.signalLine &&
    cur.macdLine < cur.signalLine
  );
}

/** Histogram trend: positive means gaining momentum, negative losing */
export function macdMomentum(macd: MACDResult[], lookback = 3): number {
  const valid = macd.filter((m) => !isNaN(m.histogram));
  if (valid.length < lookback + 1) return 0;
  const recent = valid.slice(-lookback);
  let trend = 0;
  for (let i = 1; i < recent.length; i++) {
    trend += recent[i].histogram - recent[i - 1].histogram;
  }
  return trend;
}
