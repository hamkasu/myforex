/**
 * Exponential Moving Average
 * EMA(t) = price(t) * k + EMA(t-1) * (1 - k), where k = 2 / (period + 1)
 */
export function calculateEMA(prices: number[], period: number): number[] {
  if (prices.length < period) return new Array(prices.length).fill(NaN);

  const k = 2 / (period + 1);
  const result: number[] = new Array(prices.length).fill(NaN);

  // Seed with SMA of first `period` prices
  let sum = 0;
  for (let i = 0; i < period; i++) sum += prices[i];
  result[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    result[i] = prices[i] * k + result[i - 1] * (1 - k);
  }

  return result;
}

/** Returns the latest non-NaN EMA value, or NaN if unavailable */
export function latestEMA(prices: number[], period: number): number {
  const ema = calculateEMA(prices, period);
  for (let i = ema.length - 1; i >= 0; i--) {
    if (!isNaN(ema[i])) return ema[i];
  }
  return NaN;
}

/** Check if EMA1 crossed above EMA2 on last candle */
export function emaCrossedAbove(ema1: number[], ema2: number[]): boolean {
  const len = Math.min(ema1.length, ema2.length);
  if (len < 2) return false;
  const i = len - 1;
  return (
    !isNaN(ema1[i]) &&
    !isNaN(ema2[i]) &&
    !isNaN(ema1[i - 1]) &&
    !isNaN(ema2[i - 1]) &&
    ema1[i - 1] <= ema2[i - 1] &&
    ema1[i] > ema2[i]
  );
}

/** Check if EMA1 crossed below EMA2 on last candle */
export function emaCrossedBelow(ema1: number[], ema2: number[]): boolean {
  const len = Math.min(ema1.length, ema2.length);
  if (len < 2) return false;
  const i = len - 1;
  return (
    !isNaN(ema1[i]) &&
    !isNaN(ema2[i]) &&
    !isNaN(ema1[i - 1]) &&
    !isNaN(ema2[i - 1]) &&
    ema1[i - 1] >= ema2[i - 1] &&
    ema1[i] < ema2[i]
  );
}
