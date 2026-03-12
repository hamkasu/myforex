import type { Candle, DataProvider, ForexPair, Timeframe } from "@/types";

// ─── Resample Helper ─────────────────────────────────────────────────────────
// Resample 1h candles into higher timeframes

const TF_HOURS: Record<Timeframe, number> = {
  "5m": 1 / 12,
  "15m": 1 / 4,
  "1h": 1,
  "4h": 4,
  "1d": 24,
};

export function resampleCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === "1h") return candles;

  const hours = TF_HOURS[timeframe];
  const periodSeconds = Math.round(hours * 3600);

  const buckets: Map<number, Candle[]> = new Map();

  for (const c of candles) {
    const bucketStart = Math.floor(c.time / periodSeconds) * periodSeconds;
    if (!buckets.has(bucketStart)) buckets.set(bucketStart, []);
    buckets.get(bucketStart)!.push(c);
  }

  const result: Candle[] = [];
  for (const [time, group] of Array.from(buckets.entries()).sort(([a], [b]) => a - b)) {
    result.push({
      time,
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + (c.volume ?? 0), 0),
    });
  }
  return result;
}

// For sub-1h timeframes, interpolate from 1h to simulate finer resolution
export function interpolateCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe !== "5m" && timeframe !== "15m") return candles;

  const subPeriods = timeframe === "5m" ? 12 : 4;
  const periodSeconds = timeframe === "5m" ? 300 : 900;

  const result: Candle[] = [];

  for (const c of candles) {
    const range = c.high - c.low;
    const step = (c.close - c.open) / subPeriods;

    for (let i = 0; i < subPeriods; i++) {
      const subOpen = c.open + step * i + (Math.random() - 0.5) * range * 0.1;
      const subClose = c.open + step * (i + 1) + (Math.random() - 0.5) * range * 0.1;
      const subHigh = Math.max(subOpen, subClose) + Math.abs((Math.random() - 0.5) * range * 0.3);
      const subLow = Math.min(subOpen, subClose) - Math.abs((Math.random() - 0.5) * range * 0.3);

      result.push({
        time: c.time + i * periodSeconds,
        open: Math.round(subOpen * 100000) / 100000,
        high: Math.round(subHigh * 100000) / 100000,
        low: Math.round(subLow * 100000) / 100000,
        close: Math.round(subClose * 100000) / 100000,
        volume: Math.round((c.volume ?? 1000) / subPeriods),
      });
    }
  }

  return result;
}

// ─── Sample Data Provider ────────────────────────────────────────────────────

let cachedEURUSD: Candle[] | null = null;
let cachedGBPJPY: Candle[] | null = null;

async function loadBaseCandles(pair: ForexPair): Promise<Candle[]> {
  if (pair === "EUR/USD") {
    if (!cachedEURUSD) {
      const res = await fetch("/data/eurusd-1h.json");
      cachedEURUSD = await res.json();
    }
    return cachedEURUSD!;
  } else {
    if (!cachedGBPJPY) {
      const res = await fetch("/data/gbpjpy-1h.json");
      cachedGBPJPY = await res.json();
    }
    return cachedGBPJPY!;
  }
}

export const sampleDataProvider: DataProvider = {
  getName: () => "Sample Data (Local)",

  async getCandles(pair: ForexPair, timeframe: Timeframe): Promise<Candle[]> {
    const base = await loadBaseCandles(pair);

    if (timeframe === "5m" || timeframe === "15m") {
      return interpolateCandles(base, timeframe);
    }
    return resampleCandles(base, timeframe);
  },
};

// ─── Active Provider (swap for real API here) ────────────────────────────────

export let activeProvider: DataProvider = sampleDataProvider;

export function setDataProvider(provider: DataProvider) {
  activeProvider = provider;
}

export async function getCandles(pair: ForexPair, timeframe: Timeframe): Promise<Candle[]> {
  return activeProvider.getCandles(pair, timeframe);
}
