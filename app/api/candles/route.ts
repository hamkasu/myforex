import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type { ForexPair, Timeframe, Candle } from "@/types";
import { FOREX_PAIRS } from "@/types";

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

// Forex pairs → C:XXXYYY (currency), Indices → I:XXX, Gold → C:XAUUSD
const POLYGON_TICKER: Record<ForexPair, string> = {
  "EUR/USD": "C:EURUSD",
  "GBP/USD": "C:GBPUSD",
  "USD/JPY": "C:USDJPY",
  "GBP/JPY": "C:GBPJPY",
  "AUD/USD": "C:AUDUSD",
  "USD/CAD": "C:USDCAD",
  "EUR/JPY": "C:EURJPY",
  "EUR/GBP": "C:EURGBP",
  "XAU/USD": "C:XAUUSD",
  "SPX500":  "I:SPX",
  "NAS100":  "I:NDX",
  "GER40":   "I:DAX",
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

type AVConfig =
  | { type: "fx";    from: string; to: string }
  | { type: "stock"; symbol: string }
  | null; // not supported via AV

const AV_CONFIG: Record<ForexPair, AVConfig> = {
  "EUR/USD": { type: "fx", from: "EUR", to: "USD" },
  "GBP/USD": { type: "fx", from: "GBP", to: "USD" },
  "USD/JPY": { type: "fx", from: "USD", to: "JPY" },
  "GBP/JPY": { type: "fx", from: "GBP", to: "JPY" },
  "AUD/USD": { type: "fx", from: "AUD", to: "USD" },
  "USD/CAD": { type: "fx", from: "USD", to: "CAD" },
  "EUR/JPY": { type: "fx", from: "EUR", to: "JPY" },
  "EUR/GBP": { type: "fx", from: "EUR", to: "GBP" },
  "XAU/USD": { type: "fx", from: "XAU", to: "USD" },
  // ETF proxies for indices on AV free tier
  "SPX500":  { type: "stock", symbol: "SPY" },
  "NAS100":  { type: "stock", symbol: "QQQ" },
  "GER40":   null, // no free AV proxy for German DAX
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

  const cfg = AV_CONFIG[pair];
  if (!cfg) throw new Error(`Alpha Vantage: no config for ${pair}`);

  let url: string;
  let seriesKey: string;

  if (cfg.type === "fx") {
    if (timeframe === "1d") {
      url = `https://www.alphavantage.co/query?function=FX_DAILY&from_symbol=${cfg.from}&to_symbol=${cfg.to}&outputsize=full&apikey=${apiKey}`;
      seriesKey = "Time Series FX (Daily)";
    } else {
      url = `https://www.alphavantage.co/query?function=FX_INTRADAY&from_symbol=${cfg.from}&to_symbol=${cfg.to}&interval=60min&outputsize=full&apikey=${apiKey}`;
      seriesKey = "Time Series FX (60min)";
    }
  } else {
    // stock/ETF proxy
    if (timeframe === "1d") {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${cfg.symbol}&outputsize=full&apikey=${apiKey}`;
      seriesKey = "Time Series (Daily)";
    } else {
      url = `https://www.alphavantage.co/query?function=TIME_SERIES_INTRADAY&symbol=${cfg.symbol}&interval=60min&outputsize=full&apikey=${apiKey}`;
      seriesKey = "Time Series (60min)";
    }
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

// ── Static fallback (forex only — EUR/USD shape used for all forex pairs) ─────

const STATIC_FILE: Partial<Record<ForexPair, string>> = {
  "EUR/USD": "eurusd-1h.json",
  "GBP/USD": "eurusd-1h.json",
  "USD/JPY": "gbpjpy-1h.json",
  "GBP/JPY": "gbpjpy-1h.json",
  "AUD/USD": "eurusd-1h.json",
  "USD/CAD": "eurusd-1h.json",
  "EUR/JPY": "gbpjpy-1h.json",
  "EUR/GBP": "eurusd-1h.json",
  // Indices & gold have no suitable static data shape
};

function loadStaticCandles(pair: ForexPair, timeframe: Timeframe): Candle[] {
  const filename = STATIC_FILE[pair];
  if (!filename) throw new Error(`No static data for ${pair}`);

  // In standalone build cwd is .next/standalone; public/ is copied there by postbuild
  const raw = fs.readFileSync(path.join(process.cwd(), "public", "data", filename), "utf-8");
  const candles = resample(JSON.parse(raw) as Candle[], TF_HOURS[timeframe]);
  if (candles.length === 0) return candles;

  // Shift timestamps forward only — never backward — so last candle aligns with "now".
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

  if (!FOREX_PAIRS.includes(pair))
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

  // 3) Static bundled fallback (forex only)
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
