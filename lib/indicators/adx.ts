import type { Candle } from "@/types";

export interface ADXResult {
  adx: number;
  plusDI: number;   // +DI: measures upward pressure
  minusDI: number;  // -DI: measures downward pressure
}

/**
 * Wilder's Average Directional Index (default period = 14).
 * ADX < 20  → ranging/weak trend (use caution with trend-following signals)
 * ADX 20–25 → trend developing
 * ADX > 25  → trending (trust EMA/MACD signals)
 * ADX > 40  → strong trend
 */
export function calculateADX(candles: Candle[], period = 14): ADXResult[] {
  const n   = candles.length;
  const nan = { adx: NaN, plusDI: NaN, minusDI: NaN };
  const out: ADXResult[] = new Array(n).fill(null).map(() => ({ ...nan }));

  if (n < period * 2 + 1) return out;

  // True Range, +DM, -DM per bar
  const tr  = new Array(n).fill(NaN);
  const pdm = new Array(n).fill(NaN);
  const ndm = new Array(n).fill(NaN);

  for (let i = 1; i < n; i++) {
    const { high: h, low: l } = candles[i];
    const pc = candles[i - 1].close;
    const ph = candles[i - 1].high;
    const pl = candles[i - 1].low;

    tr[i]  = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    const up = h - ph, dn = pl - l;
    pdm[i] = up > dn && up > 0 ? up : 0;
    ndm[i] = dn > up && dn > 0 ? dn : 0;
  }

  // Wilder's cumulative smoothing
  function wilderSmooth(arr: number[]): number[] {
    const res = new Array(n).fill(NaN);
    let sum = 0;
    for (let i = 1; i <= period; i++) sum += arr[i];
    res[period] = sum;
    for (let i = period + 1; i < n; i++) {
      res[i] = res[i - 1] - res[i - 1] / period + arr[i];
    }
    return res;
  }

  const sTR  = wilderSmooth(tr);
  const sPDM = wilderSmooth(pdm);
  const sNDM = wilderSmooth(ndm);

  const pdi = new Array(n).fill(NaN);
  const ndi = new Array(n).fill(NaN);
  const dx  = new Array(n).fill(NaN);

  for (let i = period; i < n; i++) {
    if (!sTR[i] || sTR[i] === 0) continue;
    pdi[i] = (sPDM[i] / sTR[i]) * 100;
    ndi[i] = (sNDM[i] / sTR[i]) * 100;
    const s = pdi[i] + ndi[i];
    dx[i] = s === 0 ? 0 : (Math.abs(pdi[i] - ndi[i]) / s) * 100;
  }

  // Seed ADX with simple mean of first `period` DX values, then Wilder-smooth
  const adxStart = period * 2;
  if (adxStart >= n) return out;

  const seedDX = dx.slice(period, adxStart).filter(v => !isNaN(v));
  if (seedDX.length < period) return out;

  let adxVal = seedDX.reduce((a, b) => a + b, 0) / period;
  out[adxStart - 1] = { adx: adxVal, plusDI: pdi[adxStart - 1], minusDI: ndi[adxStart - 1] };

  for (let i = adxStart; i < n; i++) {
    if (!isNaN(dx[i])) adxVal = (adxVal * (period - 1) + dx[i]) / period;
    out[i] = { adx: adxVal, plusDI: pdi[i], minusDI: ndi[i] };
  }

  return out;
}
