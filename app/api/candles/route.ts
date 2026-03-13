import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type { ForexPair, Timeframe, Candle } from "@/types";

const VALID_PAIRS: ForexPair[] = ["EUR/USD", "GBP/JPY"];
const VALID_TIMEFRAMES: Timeframe[] = ["5m", "15m", "1h", "4h", "1d"];

// Twelve Data interval names
const TD_INTERVAL: Record<Timeframe, string> = {
  "5m": "5min",
  "15m": "15min",
  "1h": "1h",
  "4h": "4h",
  "1d": "1day",
};

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

// ── Twelve Data ───────────────────────────────────────────────────────────────

async function fetchFromTwelveData(pair: ForexPair, timeframe: Timeframe): Promise<Candle[]> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;
  if (!apiKey) throw new Error("TWELVE_DATA_API_KEY not configured");

  const url =
    `https://api.twelvedata.com/time_series` +
    `?symbol=${encodeURIComponent(pair)}` +
    `&interval=${TD_INTERVAL[timeframe]}` +
    `&outputsize=200` +
    `&apikey=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Twelve Data HTTP ${res.status}`);

  const data = await res.json();
  if (data.status === "error") throw new Error(`Twelve Data: ${data.message}`);
  if (!Array.isArray(data.values)) throw new Error("Unexpected Twelve Data response");

  // API returns newest-first; reverse to oldest-first for charting
  return (data.values as Record<string, string>[]).reverse().map((v) => ({
    time: Math.floor(new Date(v.datetime.replace(" ", "T") + "Z").getTime() / 1000),
    open:  parseFloat(v.open),
    high:  parseFloat(v.high),
    low:   parseFloat(v.low),
    close: parseFloat(v.close),
    volume: v.volume ? parseInt(v.volume) : undefined,
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
  const pair       = searchParams.get("pair") as ForexPair;
  const timeframe  = (searchParams.get("timeframe") ?? "1h") as Timeframe;

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

  // Fetch live data from Twelve Data
  try {
    const candles = await fetchFromTwelveData(pair, timeframe);
    cache.set(cacheKey, { candles, fetchedAt: Date.now() });
    return NextResponse.json(candles, {
      headers: { "X-Cache": "MISS", "X-Data-Source": "twelvedata", "Cache-Control": "no-store" },
    });
  } catch (liveErr) {
    console.error("[candles] live fetch failed, using static fallback:", liveErr);
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
