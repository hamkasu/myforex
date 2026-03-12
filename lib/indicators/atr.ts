import type { Candle } from "@/types";

/**
 * Average True Range (ATR-14) using Wilder's smoothing
 */
export function calculateATR(candles: Candle[], period = 14): number[] {
  const result: number[] = new Array(candles.length).fill(NaN);
  if (candles.length < period + 1) return result;

  const trueRanges: number[] = [NaN]; // first bar has no prev close

  for (let i = 1; i < candles.length; i++) {
    const { high, low } = candles[i];
    const prevClose = candles[i - 1].close;
    const tr = Math.max(
      high - low,
      Math.abs(high - prevClose),
      Math.abs(low - prevClose)
    );
    trueRanges.push(tr);
  }

  // Initial ATR = SMA of first `period` true ranges (indices 1..period)
  let atr = 0;
  for (let i = 1; i <= period; i++) atr += trueRanges[i];
  atr /= period;
  result[period] = atr;

  for (let i = period + 1; i < candles.length; i++) {
    atr = (atr * (period - 1) + trueRanges[i]) / period;
    result[i] = atr;
  }

  return result;
}

export function latestATR(candles: Candle[], period = 14): number {
  const atr = calculateATR(candles, period);
  for (let i = atr.length - 1; i >= 0; i--) {
    if (!isNaN(atr[i])) return atr[i];
  }
  return NaN;
}

/** ATR as percentage of price */
export function atrPercent(candles: Candle[], period = 14): number {
  const atr = latestATR(candles, period);
  const price = candles[candles.length - 1].close;
  return (atr / price) * 100;
}

/** True if current ATR is spiking above `threshold` * average ATR */
export function isHighVolatility(
  candles: Candle[],
  period = 14,
  threshold = 2.5
): boolean {
  const atrs = calculateATR(candles, period).filter((v) => !isNaN(v));
  if (atrs.length < 10) return false;
  const recent = atrs[atrs.length - 1];
  const avg = atrs.slice(-20, -1).reduce((s, v) => s + v, 0) / Math.min(19, atrs.length - 1);
  return recent > avg * threshold;
}

/** Suggest stop loss and take profit based on ATR */
export function atrTradeSetup(
  candles: Candle[],
  direction: "long" | "short",
  atrMultiplierSL = 1.5,
  atrMultiplierTP = 2.5,
  period = 14
): { stopLoss: number; takeProfit: number; entry: number; riskReward: number } {
  const atr = latestATR(candles, period);
  const entry = candles[candles.length - 1].close;

  if (isNaN(atr)) {
    return { stopLoss: entry, takeProfit: entry, entry, riskReward: 0 };
  }

  const slDistance = atr * atrMultiplierSL;
  const tpDistance = atr * atrMultiplierTP;

  const stopLoss = direction === "long" ? entry - slDistance : entry + slDistance;
  const takeProfit = direction === "long" ? entry + tpDistance : entry - tpDistance;
  const riskReward = tpDistance / slDistance;

  return { stopLoss, takeProfit, entry, riskReward };
}
