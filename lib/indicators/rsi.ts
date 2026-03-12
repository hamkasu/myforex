/**
 * Relative Strength Index (RSI-14)
 * Uses Wilder's smoothing (RMA) for avg gain/loss.
 */
export function calculateRSI(closes: number[], period = 14): number[] {
  const result: number[] = new Array(closes.length).fill(NaN);
  if (closes.length < period + 1) return result;

  // Initial avg gain/loss over first `period` bars
  let avgGain = 0;
  let avgLoss = 0;

  for (let i = 1; i <= period; i++) {
    const change = closes[i] - closes[i - 1];
    if (change > 0) avgGain += change;
    else avgLoss += Math.abs(change);
  }
  avgGain /= period;
  avgLoss /= period;

  const calcRSI = (g: number, l: number) =>
    l === 0 ? 100 : 100 - 100 / (1 + g / l);

  result[period] = calcRSI(avgGain, avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i] - closes[i - 1];
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;

    result[i] = calcRSI(avgGain, avgLoss);
  }

  return result;
}

export function latestRSI(closes: number[], period = 14): number {
  const rsi = calculateRSI(closes, period);
  for (let i = rsi.length - 1; i >= 0; i--) {
    if (!isNaN(rsi[i])) return rsi[i];
  }
  return NaN;
}

export type RSIZone = "oversold" | "bearish" | "neutral" | "bullish" | "overbought";

export function getRSIZone(
  rsi: number,
  oversold = 30,
  overbought = 70
): RSIZone {
  if (rsi <= oversold) return "oversold";
  if (rsi <= 45) return "bearish";
  if (rsi <= 55) return "neutral";
  if (rsi < overbought) return "bullish";
  return "overbought";
}
