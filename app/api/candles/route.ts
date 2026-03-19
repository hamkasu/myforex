import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { isSubscribed } from "@/lib/subscription";
import type { ForexPair, Timeframe, Candle } from "@/types";
import { FOREX_PAIRS } from "@/types";

const VALID_TIMEFRAMES: Timeframe[] = ["1h", "4h", "1d"];

const CACHE_TTL_MS: Record<Timeframe, number> = {
  "1h":  60 * 60 * 1000,
  "4h":  4  * 60 * 60 * 1000,
  "1d":  24 * 60 * 60 * 1000,
};

const cache = new Map<string, { candles: Candle[]; fetchedAt: number }>();

// ── Resample helper ───────────────────────────────────────────────────────────

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

// ── FreeForexAPI (live price) ─────────────────────────────────────────────────

/** Maps ForexPair to the pair code used by FreeForexAPI */
const FFAPI_PAIR: Record<ForexPair, string> = {
  "EUR/USD": "EURUSD",
  "GBP/USD": "GBPUSD",
  "USD/JPY": "USDJPY",
  "GBP/JPY": "GBPJPY",
  "AUD/USD": "AUDUSD",
  "USD/CAD": "USDCAD",
  "EUR/JPY": "EURJPY",
  "EUR/GBP": "EURGBP",
  "XAU/USD": "XAUUSD",
};

/**
 * Fetches the current live rate from FreeForexAPI (no API key required).
 * Returns the current mid price, or throws on failure.
 */
async function fetchLivePrice(pair: ForexPair): Promise<number> {
  const code = FFAPI_PAIR[pair];
  const url = `https://www.freeforexapi.com/api/live?pairs=${code}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`FreeForexAPI HTTP ${res.status}`);
  const data = await res.json();
  const rate = (data?.rates?.[code]?.rate) as number | undefined;
  if (!rate) throw new Error(`FreeForexAPI: no rate for ${pair}`);
  return rate;
}

// ── Static fallback (forex only) ──────────────────────────────────────────────

const STATIC_FILE: Partial<Record<ForexPair, string>> = {
  "EUR/USD": "eurusd-1h.json",
  "GBP/USD": "eurusd-1h.json",
  "USD/JPY": "gbpjpy-1h.json",
  "GBP/JPY": "gbpjpy-1h.json",
  "AUD/USD": "eurusd-1h.json",
  "USD/CAD": "eurusd-1h.json",
  "EUR/JPY": "gbpjpy-1h.json",
  "EUR/GBP": "eurusd-1h.json",
};

function loadStaticCandles(pair: ForexPair, timeframe: Timeframe): Candle[] {
  const filename = STATIC_FILE[pair];
  if (!filename) throw new Error(`No static data for ${pair}`);

  const raw = fs.readFileSync(path.join(process.cwd(), "public", "data", filename), "utf-8");
  const candles = resample(JSON.parse(raw) as Candle[], TF_HOURS[timeframe]);
  if (candles.length === 0) return candles;

  const periodSec = TF_HOURS[timeframe] * 3600;
  const targetLast = Math.floor(Date.now() / 1000 / periodSec) * periodSec;
  const shift = Math.max(0, targetLast - candles[candles.length - 1].time);
  return shift === 0 ? candles : candles.map((c) => ({ ...c, time: c.time + shift }));
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId  = (session?.user as any)?.id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ok = await isSubscribed(userId);
  if (!ok) return NextResponse.json({ error: "Subscription required" }, { status: 402 });

  const { searchParams } = new URL(req.url);
  const pair      = searchParams.get("pair") as ForexPair;
  const timeframe = (searchParams.get("timeframe") ?? "1h") as Timeframe;

  if (!FOREX_PAIRS.includes(pair))
    return NextResponse.json({ error: "Invalid pair" }, { status: 400 });
  if (!VALID_TIMEFRAMES.includes(timeframe))
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });

  const cacheKey = `${pair}:${timeframe}`;
  const hit = cache.get(cacheKey);
  if (hit && Date.now() - hit.fetchedAt < CACHE_TTL_MS[timeframe]) {
    return NextResponse.json(hit.candles, {
      headers: { "X-Cache": "HIT", "Cache-Control": "no-store" },
    });
  }

  // 1) Load static historical candles
  let candles: Candle[];
  try {
    candles = loadStaticCandles(pair, timeframe);
  } catch (e) {
    console.error("[candles] static fallback failed:", (e as Error).message);
    return NextResponse.json({ error: "Failed to load market data" }, { status: 500 });
  }

  // 2) Inject live price from FreeForexAPI as the latest candle close
  try {
    const livePrice = await fetchLivePrice(pair);
    const nowSec = Math.floor(Date.now() / 1000);
    const periodSec = TF_HOURS[timeframe] * 3600;
    const bucketTime = Math.floor(nowSec / periodSec) * periodSec;

    const last = candles[candles.length - 1];
    if (last && last.time === bucketTime) {
      // Update the current bucket's close (and high/low if needed)
      candles[candles.length - 1] = {
        ...last,
        close: livePrice,
        high: Math.max(last.high, livePrice),
        low:  Math.min(last.low, livePrice),
      };
    } else {
      // Append a new candle for the current period
      candles.push({
        time:   bucketTime,
        open:   livePrice,
        high:   livePrice,
        low:    livePrice,
        close:  livePrice,
      });
    }
    cache.set(cacheKey, { candles, fetchedAt: Date.now() });
    return NextResponse.json(candles, {
      headers: { "X-Cache": "MISS", "X-Data-Source": "freeforexapi", "Cache-Control": "no-store" },
    });
  } catch (e) {
    console.error("[candles] FreeForexAPI failed:", (e as Error).message);
    // Return static data without live price update
    return NextResponse.json(candles, {
      headers: {
        "X-Data-Source": "static-fallback",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  }
}
