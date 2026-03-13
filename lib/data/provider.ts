import type { Candle, DataProvider, ForexPair, Timeframe } from "@/types";

// ─── Resample Helper ─────────────────────────────────────────────────────────
// Resample 1h candles into higher timeframes

const TF_HOURS: Record<Timeframe, number> = {
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


// ─── Default Data Provider (calls server-side /api/candles) ─────────────────

export const sampleDataProvider: DataProvider = {
  getName: () => "Live Market Data",

  async getCandles(pair: ForexPair, timeframe: Timeframe): Promise<Candle[]> {
    const res = await fetch(
      `/api/candles?pair=${encodeURIComponent(pair)}&timeframe=${timeframe}`
    );
    if (!res.ok) throw new Error(`candles API error: ${res.status}`);
    return res.json() as Promise<Candle[]>;
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
