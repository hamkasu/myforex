import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type { ForexPair, Timeframe, Candle } from "@/types";

const VALID_PAIRS: ForexPair[] = ["EUR/USD", "GBP/JPY"];
const VALID_TIMEFRAMES: Timeframe[] = ["5m", "15m", "1h", "4h", "1d"];

// How long to cache each timeframe (matches the candle period)
const CACHE_TTL_MS: Record<Timeframe, number> = {
  "5m":  5  * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h":  60 * 60 * 1000,
  "4h":  4  * 60 * 60 * 1000,
  "1d":  24 * 60 * 60 * 1000,
};

// Server-side in-memory cache — shared across all requests in the same container
const cache = new Map<string, { candles: Candle[]; fetchedAt: number }>();

// ── Polygon.io ────────────────────────────────────────────────────────────────

// Polygon forex tickers use C: prefix
const POLYGON_TICKER: Record<ForexPair, string> = {
  "EUR/USD": "C:EURUSD",
  "GBP/JPY": "C:GBPJPY",
};

// multiplier + timespan for Polygon /v2/aggs/ticker endpoint
const POLYGON_TF: Record<Timeframe, { multiplier: number; timespan: string }> = {
  "5m":  { multiplier: 5,  timespan: "minute" },
  "15m": { multiplier: 15, timespan: "minute" },
  "1h":  { multiplier: 1,  timespan: "hour"   },
  "4h":  { multiplier: 4,  timespan: "hour"   },
  "1d":  { multiplier: 1,  timespan: "day"    },
};

// How many calendar days to look back to guarantee ~200 candles
// (extra buffer for weekends / market-closed periods)
const LOOKBACK_DAYS: Record<Timeframe, number> = {
  "5m":  4,
  "15m": 7,
  "1h":  18,
  "4h":  60,
  "1d":  320,
};

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0]; // "YYYY-MM-DD"
}

async function fetchFromPolygon(pair: ForexPair, timeframe: Timeframe): Promise<Candle[]> {
  const apiKey = process.env.POLYGON_API_KEY;
  if (!apiKey) throw new Error("POLYGON_API_KEY not configured");

  const ticker = POLYGON_TICKER[pair];
  const { multiplier, timespan } = POLYGON_TF[timeframe];

  const to   = new Date();
  const from = new Date(Date.now() - LOOKBACK_DAYS[timeframe] * 24 * 3600 * 1000);

  const url =
    `https://api.polygon.io/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}` +
    `/${dateStr(from)}/${dateStr(to)}` +
    `?adjusted=false&sort=asc&limit=200&apiKey=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Polygon HTTP ${res.status}`);

  const data = await res.json();
  if (data.status === "ERROR") throw new Error(`Polygon: ${data.error ?? data.message}`);
  if (!Array.isArray(data.results) || data.results.length === 0)
    throw new Error("Polygon returned no results");

  // Polygon timestamps are in milliseconds UTC; convert to seconds
  return (data.results as Record<string, number>[]).map((v) => ({
    time:   Math.floor(v.t / 1000),
    open:   v.o,
    high:   v.h,
    low:    v.l,
    close:  v.c,
    volume: v.v || undefined,
  }));
}

// ── Static fallback ───────────────────────────────────────────────────────────

const TF_HOURS: Record<Timeframe, number> = {
  "5m": 1 / 12, "15m": 1 / 4, "1h": 1, "4h": 4, "1d": 24,
};

function resample(candles: Candle[], tfHours: number): Candle[] {
  if (tfHours === 1) return candles;
  const periodSec = Math.round(tfHours * 3600);
  const buckets = new Map<number, Candle[]>();

  for (const c of candles) {
    const key = Math.floor(c.time / periodSec) * periodSec;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(c);
  }

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a - b)
    .map(([time, group]) => ({
      time,
      open:   group[0].open,
      high:   Math.max(...group.map((c) => c.high)),
      low:    Math.min(...group.map((c) => c.low)),
      close:  group[group.length - 1].close,
      volume: group.reduce((s, c) => s + (c.volume ?? 0), 0),
    }));
}

function loadStaticCandles(pair: ForexPair, timeframe: Timeframe): Candle[] {
  const filename = pair === "EUR/USD" ? "eurusd-1h.json" : "gbpjpy-1h.json";
  const raw = fs.readFileSync(path.join(process.cwd(), "data", filename), "utf-8");
  return resample(JSON.parse(raw) as Candle[], TF_HOURS[timeframe]);
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pair      = searchParams.get("pair") as ForexPair;
  const timeframe = (searchParams.get("timeframe") ?? "1h") as Timeframe;

  if (!VALID_PAIRS.includes(pair))
    return NextResponse.json({ error: "Invalid pair" }, { status: 400 });
  if (!VALID_TIMEFRAMES.includes(timeframe))
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });

  // Return cached data if still fresh
  const cacheKey = `${pair}:${timeframe}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS[timeframe]) {
    return NextResponse.json(hit.candles, {
      headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
    });
  }

  // Fetch live data from Polygon.io
  try {
    const candles = await fetchFromPolygon(pair, timeframe);
    cache.set(cacheKey, { candles, fetchedAt: Date.now() });
    return NextResponse.json(candles, {
      headers: { "X-Cache": "MISS", "X-Data-Source": "polygon", "Cache-Control": "no-store" },
    });
  } catch (liveErr) {
    console.error("[candles] Polygon fetch failed, using static fallback:", liveErr);
  }

  // Fallback to bundled static data
  try {
    const candles = loadStaticCandles(pair, timeframe);
    return NextResponse.json(candles, {
      headers: {
        "X-Data-Source": "static-fallback",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (staticErr) {
    console.error("[candles] static fallback failed:", staticErr);
    return NextResponse.json({ error: "Failed to load market data" }, { status: 500 });
  }
}
