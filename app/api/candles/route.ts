import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type { ForexPair, Timeframe, Candle } from "@/types";

const VALID_PAIRS: ForexPair[] = ["EUR/USD", "GBP/JPY"];
const VALID_TIMEFRAMES: Timeframe[] = ["1h", "4h", "1d"];

// How long to cache each timeframe (matches the candle period)
const CACHE_TTL_MS: Record<Timeframe, number> = {
  "1h":  60 * 60 * 1000,
  "4h":  4  * 60 * 60 * 1000,
  "1d":  24 * 60 * 60 * 1000,
};

// Server-side in-memory cache — shared across all requests in the same container
const cache = new Map<string, { candles: Candle[]; fetchedAt: number }>();

// ── Resample helper (shared by AV 4h and static fallback) ─────────────────────

const TF_HOURS: Record<Timeframe, number> = {
  "1h": 1, "4h": 4, "1d": 24,
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

// ── Provider 1: Massive.com (rebranded Polygon.io) ────────────────────────────

const POLYGON_TICKER: Record<ForexPair, string> = {
  "EUR/USD": "C:EURUSD",
  "GBP/JPY": "C:GBPJPY",
};

const POLYGON_TF: Record<Timeframe, { multiplier: number; timespan: string }> = {
  "1h":  { multiplier: 1,  timespan: "hour" },
  "4h":  { multiplier: 4,  timespan: "hour" },
  "1d":  { multiplier: 1,  timespan: "day"  },
};

const LOOKBACK_DAYS: Record<Timeframe, number> = {
  "1h":  18,
  "4h":  60,
  "1d":  320,
};

function dateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

async function fetchFromMassive(pair: ForexPair, timeframe: Timeframe): Promise<Candle[]> {
  // Massive.com (formerly Polygon.io). Accept either key name.
  const apiKey = process.env.POLYGON_API_KEY ?? process.env.MASSIVE_API_KEY;
  if (!apiKey) throw new Error("No Massive/Polygon key configured");

  const ticker = POLYGON_TICKER[pair];
  const { multiplier, timespan } = POLYGON_TF[timeframe];
  const to   = new Date();
  const from = new Date(Date.now() - LOOKBACK_DAYS[timeframe] * 24 * 3600 * 1000);

  const url =
    `https://api.massive.com/v2/aggs/ticker/${ticker}/range/${multiplier}/${timespan}` +
    `/${dateStr(from)}/${dateStr(to)}` +
    `?adjusted=false&sort=asc&limit=200&apiKey=${apiKey}`;

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Massive HTTP ${res.status}`);

  const data = await res.json();
  if (data.status === "ERROR") throw new Error(`Massive: ${data.error ?? data.message}`);
  if (!Array.isArray(data.results) || data.results.length === 0)
    throw new Error("Massive: no results");

  return (data.results as Record<string, number>[]).map((v) => ({
    time:   Math.floor(v.t / 1000),
    open:   v.o, high: v.h, low: v.l, close: v.c,
    volume: v.v || undefined,
  }));
}

// ── Provider 2: Alpha Vantage ─────────────────────────────────────────────────

const AV_PAIR: Record<ForexPair, { from: string; to: string }> = {
  "EUR/USD": { from: "EUR", to: "USD" },
  "GBP/JPY": { from: "GBP", to: "JPY" },
};

/**
 * Parse Alpha Vantage timestamp strings to Unix seconds.
 * Intraday: "YYYY-MM-DD HH:MM:SS" in US/Eastern → convert to UTC (+5h for EST).
 * Daily:    "YYYY-MM-DD"          → midnight UTC.
 */
function parseAVTime(dt: string): number {
  if (!dt.includes(" ")) {
    const [y, mo, d] = dt.split("-").map(Number);
    return Math.floor(Date.UTC(y, mo - 1, d) / 1000);
  }
  const [datePart, timePart] = dt.split(" ");
  const [y, mo, d] = datePart.split("-").map(Number);
  const [h, m, s] = timePart.split(":").map(Number);
  // Eastern Time → UTC: add 5h (EST). 1h error during EDT is acceptable.
  return Math.floor(Date.UTC(y, mo - 1, d, h + 5, m, s ?? 0) / 1000);
}

async function fetchFromAlphaVantage(pair: ForexPair, timeframe: Timeframe): Promise<Candle[]> {
  const apiKey = process.env.ALPHA_VANTAGE_API_KEY;
  if (!apiKey) throw new Error("ALPHA_VANTAGE_API_KEY not configured");

  const { from, to } = AV_PAIR[pair];

  let url: string;
  let seriesKey: string;

  if (timeframe === "1d") {
    url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${from}&to_symbol=${to}&outputsize=full&apikey=${apiKey}`;
    seriesKey = "Time Series FX (Daily)";
  } else {
    // Fetch 1h data; resample to 4h if needed
    url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${from}&to_symbol=${to}&interval=60min&outputsize=full&apikey=${apiKey}`;
    seriesKey = "Time Series FX (60min)";
  }

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`Alpha Vantage HTTP ${res.status}`);

  const data = await res.json();
  if (data["Error Message"]) throw new Error(`Alpha Vantage: ${data["Error Message"] as string}`);
  if (data["Information"])   throw new Error(`Alpha Vantage rate limit hit`);

  const series = data[seriesKey] as Record<string, Record<string, string>> | undefined;
  if (!series) throw new Error("Alpha Vantage: unexpected response — check your API key");

  const candles: Candle[] = Object.entries(series)
    .map(([dt, v]) => ({
      time:  parseAVTime(dt),
      open:  parseFloat(v["1. open"]),
      high:  parseFloat(v["2. high"]),
      low:   parseFloat(v["3. low"]),
      close: parseFloat(v["4. close"]),
    }))
    .sort((a, b) => a.time - b.time);

  if (candles.length === 0) throw new Error("Alpha Vantage: empty response");

  // Limit to last 200 candles (daily can return 20+ years)
  const trimmed = candles.slice(-200);

  return timeframe === "4h" ? resample(trimmed, 4) : trimmed;
}

// ── Static fallback ───────────────────────────────────────────────────────────

function loadStaticCandles(pair: ForexPair, timeframe: Timeframe): Candle[] {
  const filename = pair === "EUR/USD" ? "eurusd-1h.json" : "gbpjpy-1h.json";
  // In standalone build cwd is .next/standalone; public/ is copied there by postbuild
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "data", filename), "utf-8");
  const candles = resample(JSON.parse(raw) as Candle[], TF_HOURS[timeframe]);
  if (candles.length === 0) return candles;

  // Shift timestamps forward only — never backward — so last candle aligns with "now".
  // This keeps static data looking current as time passes.
  const periodSec = TF_HOURS[timeframe] * 3600;
  const targetLast = Math.floor(Date.now() / 1000 / periodSec) * periodSec;
  const shift = Math.max(0, targetLast - candles[candles.length - 1].time);
  return shift === 0 ? candles : candles.map((c) => ({ ...c, time: c.time + shift }));
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

  // 1) Try Massive.com (rebranded Polygon.io)
  try {
    const candles = await fetchFromMassive(pair, timeframe);
    cache.set(cacheKey, { candles, fetchedAt: Date.now() });
    return NextResponse.json(candles, {
      headers: { "X-Cache": "MISS", "X-Data-Source": "massive", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[candles] Massive failed:", (e as Error).message);
  }

  // 2) Try Alpha Vantage
  try {
    const candles = await fetchFromAlphaVantage(pair, timeframe);
    cache.set(cacheKey, { candles, fetchedAt: Date.now() });
    return NextResponse.json(candles, {
      headers: { "X-Cache": "MISS", "X-Data-Source": "alpha-vantage", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[candles] Alpha Vantage failed:", (e as Error).message);
  }

  // 3) Static bundled fallback
  try {
    const candles = loadStaticCandles(pair, timeframe);
    return NextResponse.json(candles, {
      headers: {
        "X-Data-Source": "static-fallback",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (e) {
    console.error("[candles] static fallback failed:", (e as Error).message);
    return NextResponse.json({ error: "Failed to load market data" }, { status: 500 });
  }
}
