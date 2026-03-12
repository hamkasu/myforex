import { NextRequest, NextResponse } from "next/server";
import path from "path";
import fs from "fs";
import type { ForexPair, Timeframe, Candle } from "@/types";

const VALID_PAIRS: ForexPair[] = ["EUR/USD", "GBP/JPY"];
const VALID_TIMEFRAMES: Timeframe[] = ["5m", "15m", "1h", "4h", "1d"];

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
      open: group[0].open,
      high: Math.max(...group.map((c) => c.high)),
      low: Math.min(...group.map((c) => c.low)),
      close: group[group.length - 1].close,
      volume: group.reduce((s, c) => s + (c.volume ?? 0), 0),
    }));
}

const TF_HOURS: Record<Timeframe, number> = {
  "5m": 1 / 12,
  "15m": 1 / 4,
  "1h": 1,
  "4h": 4,
  "1d": 24,
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const pair = searchParams.get("pair") as ForexPair;
  const timeframe = (searchParams.get("timeframe") ?? "1h") as Timeframe;

  if (!VALID_PAIRS.includes(pair)) {
    return NextResponse.json({ error: "Invalid pair" }, { status: 400 });
  }
  if (!VALID_TIMEFRAMES.includes(timeframe)) {
    return NextResponse.json({ error: "Invalid timeframe" }, { status: 400 });
  }

  const filename = pair === "EUR/USD" ? "eurusd-1h.json" : "gbpjpy-1h.json";
  const filePath = path.join(process.cwd(), "data", filename);

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const candles: Candle[] = JSON.parse(raw);
    const resampled = resample(candles, TF_HOURS[timeframe]);

    return NextResponse.json(resampled, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=120",
      },
    });
  } catch (err) {
    return NextResponse.json({ error: "Data file not found" }, { status: 500 });
  }
}
