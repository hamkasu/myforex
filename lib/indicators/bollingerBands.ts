export interface BBResult {
  upper: number;
  middle: number;    // SMA(period)
  lower: number;
  width: number;     // (upper - lower) / middle — normalized volatility measure
  percentB: number;  // 0 = at lower band, 0.5 = at middle, 1 = at upper band
                     // negative = below lower, >1 = above upper
}

/**
 * Bollinger Bands (default: 20-period SMA ± 2 std deviations).
 *
 * How to read:
 *  width < 0.003 → squeeze (low volatility, breakout approaching)
 *  percentB < 0   → price below lower band (oversold)
 *  percentB > 1   → price above upper band (overbought/strong trend)
 *  percentB ≈ 0   → at support (lower band)
 *  percentB ≈ 1   → at resistance (upper band)
 */
export function calculateBollingerBands(
  closes: number[],
  period = 20,
  k = 2,
): BBResult[] {
  const nan: BBResult = { upper: NaN, middle: NaN, lower: NaN, width: NaN, percentB: NaN };

  return closes.map((price, i) => {
    if (i < period - 1) return { ...nan };

    const slice = closes.slice(i - period + 1, i + 1);
    const mean  = slice.reduce((a, b) => a + b, 0) / period;
    const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
    const std   = Math.sqrt(variance);

    const upper    = mean + k * std;
    const lower    = mean - k * std;
    const width    = mean === 0 ? NaN : (upper - lower) / mean;
    const percentB = upper === lower ? 0.5 : (price - lower) / (upper - lower);

    return { upper, middle: mean, lower, width, percentB };
  });
}
