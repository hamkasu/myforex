import type { Candle } from "@/types";
import type { SDZone, SDAnalysis } from "@/types";
import { calculateATR } from "./atr";

// ─── Internal helpers ────────────────────────────────────────────────────────

function bodySize(c: Candle): number {
  return Math.abs(c.close - c.open);
}

function candleRange(c: Candle): number {
  return c.high - c.low;
}

/**
 * Find the "base" (consolidation) before an impulse.
 * A base candle has a small body (< 0.5 × ATR) — indicating indecision/accumulation.
 * We look back up to `maxLookback` candles from the impulse start.
 */
function findBase(
  candles: Candle[],
  impulseIndex: number,
  atr: number,
  maxLookback = 5
): Candle[] {
  const base: Candle[] = [];
  const start = Math.max(0, impulseIndex - maxLookback);

  for (let i = start; i < impulseIndex; i++) {
    if (bodySize(candles[i]) <= atr * 0.6) {
      base.push(candles[i]);
    }
  }

  return base;
}

/**
 * Check if a zone has been tested or broken by subsequent candles.
 *  - "tested": price touched the zone but closed within or bounced
 *  - "broken": price closed fully beyond the zone
 *  - "fresh":  price never returned to the zone
 */
function classifyZoneStatus(
  zone: Omit<SDZone, "status">,
  candles: Candle[],
  fromIndex: number
): SDZone["status"] {
  let wasTested = false;

  for (let i = fromIndex; i < candles.length; i++) {
    const c = candles[i];

    if (zone.type === "demand") {
      // Demand zone is broken if a candle closes below the zone bottom
      if (c.close < zone.bottom) return "broken";
      // Tested if low entered the zone
      if (c.low <= zone.top && c.low >= zone.bottom) wasTested = true;
    } else {
      // Supply zone is broken if a candle closes above the zone top
      if (c.close > zone.top) return "broken";
      // Tested if high entered the zone
      if (c.high >= zone.bottom && c.high <= zone.top) wasTested = true;
    }
  }

  return wasTested ? "tested" : "fresh";
}

/**
 * Impulse strength in ATR units → 1, 2, or 3
 */
function impulseStrength(impulseSize: number, atr: number): 1 | 2 | 3 {
  const ratio = impulseSize / atr;
  if (ratio >= 3) return 3;
  if (ratio >= 2) return 2;
  return 1;
}

// ─── Main Detection ───────────────────────────────────────────────────────────

/**
 * Detect supply and demand zones from OHLC data.
 *
 * Supply zone: Consolidation base that was followed by a sharp bearish impulse.
 *   — Price is likely to face selling pressure when it returns here.
 *
 * Demand zone: Consolidation base that was followed by a sharp bullish impulse.
 *   — Price is likely to find buying interest when it returns here.
 *
 * @param candles    Full OHLC array (at least 30 candles recommended)
 * @param atrMultiplier  Minimum impulse size to qualify (default 1.5× ATR)
 * @param maxZones   Max zones per type to return (sorted by freshness/strength)
 */
export function detectSDZones(
  candles: Candle[],
  atrMultiplier = 1.5,
  maxZones = 6
): { supplyZones: SDZone[]; demandZones: SDZone[] } {
  const warmup = 14;
  if (candles.length < warmup + 5) {
    return { supplyZones: [], demandZones: [] };
  }

  const atrArr = calculateATR(candles, 14);
  const allSupply: SDZone[] = [];
  const allDemand: SDZone[] = [];

  for (let i = warmup + 1; i < candles.length - 1; i++) {
    const atr = atrArr[i];
    if (isNaN(atr) || atr === 0) continue;

    const c = candles[i];
    const move = bodySize(c);
    const isImpulse = move > atr * atrMultiplier;
    if (!isImpulse) continue;

    const isBullishImpulse = c.close > c.open;
    const base = findBase(candles, i, atr, 5);
    if (base.length === 0) continue;

    const zoneTop    = Math.max(...base.map((b) => b.high));
    const zoneBottom = Math.min(...base.map((b) => b.low));

    // Sanity: zone must have a meaningful range
    if (zoneTop - zoneBottom < atr * 0.1) continue;

    const zonePartial = {
      type: (isBullishImpulse ? "demand" : "supply") as SDZone["type"],
      top: zoneTop,
      bottom: zoneBottom,
      strength: impulseStrength(move, atr),
      timeIndex: i,
      impulseSize: move / atr,
    };

    const status = classifyZoneStatus(zonePartial, candles, i + 1);

    const zone: SDZone = { ...zonePartial, status };

    if (isBullishImpulse) {
      allDemand.push(zone);
    } else {
      allSupply.push(zone);
    }
  }

  // Sort: fresh > tested > broken, then by strength desc, then by recency
  const sortZones = (zones: SDZone[]) =>
    zones
      .filter((z) => z.status !== "broken") // drop broken zones for chart/signal use
      .sort((a, b) => {
        const statusOrder = { fresh: 0, tested: 1, broken: 2 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        if (a.strength !== b.strength) return b.strength - a.strength;
        return b.timeIndex - a.timeIndex; // more recent first
      })
      .slice(0, maxZones);

  return {
    supplyZones: sortZones(allSupply),
    demandZones: sortZones(allDemand),
  };
}

// ─── Zone Analysis relative to current price ─────────────────────────────────

/**
 * Analyze supply/demand zones relative to the current price.
 * Returns a structured SDAnalysis with context and scoring.
 */
export function analyzeSDZones(
  candles: Candle[],
  atrMultiplier = 1.5
): SDAnalysis {
  const { supplyZones, demandZones } = detectSDZones(candles, atrMultiplier);
  const price = candles[candles.length - 1].close;
  const atrArr = calculateATR(candles, 14).filter((v) => !isNaN(v));
  const atr = atrArr[atrArr.length - 1] ?? 0;
  const proximity = atr * 1.0; // within 1 ATR of a zone boundary counts as "near"

  // Current price inside a zone?
  const inDemandZone = demandZones.some(
    (z) => price >= z.bottom && price <= z.top && z.status !== "broken"
  );
  const inSupplyZone = supplyZones.some(
    (z) => price >= z.bottom && price <= z.top && z.status !== "broken"
  );

  // Nearest fresh/tested supply above price
  const freshSupplyAbove =
    supplyZones
      .filter((z) => z.bottom > price && z.status !== "broken")
      .sort((a, b) => a.bottom - b.bottom)[0] ?? null;

  // Nearest fresh/tested demand below price
  const freshDemandBelow =
    demandZones
      .filter((z) => z.top < price && z.status !== "broken")
      .sort((a, b) => b.top - a.top)[0] ?? null;

  // Proximity checks
  const nearFreshDemand =
    !inDemandZone &&
    freshDemandBelow !== null &&
    price - freshDemandBelow.top < proximity;

  const nearFreshSupply =
    !inSupplyZone &&
    freshSupplyAbove !== null &&
    freshSupplyAbove.bottom - price < proximity;

  // SD score: -2 to +2
  let sdScore = 0;
  if (inDemandZone) sdScore = 2;       // price inside demand → strong bullish
  else if (inSupplyZone) sdScore = -2; // price inside supply → strong bearish
  else if (nearFreshDemand) sdScore = 1;
  else if (nearFreshSupply) sdScore = -1;

  return {
    supplyZones,
    demandZones,
    inSupplyZone,
    inDemandZone,
    freshSupplyAbove,
    freshDemandBelow,
    nearFreshDemand,
    nearFreshSupply,
    sdScore,
  };
}

// ─── Reason builder ───────────────────────────────────────────────────────────

export function buildSDReason(sd: SDAnalysis, decimals = 5): string | null {
  if (sd.inDemandZone) {
    return `Price inside demand zone — high-probability buy area (accumulated orders likely here)`;
  }
  if (sd.inSupplyZone) {
    return `Price inside supply zone — high-probability sell area (sell orders likely resting here)`;
  }
  if (sd.nearFreshDemand && sd.freshDemandBelow) {
    return `Approaching demand zone (${sd.freshDemandBelow.bottom.toFixed(decimals)}–${sd.freshDemandBelow.top.toFixed(decimals)}) — expect potential bullish reaction`;
  }
  if (sd.nearFreshSupply && sd.freshSupplyAbove) {
    return `Approaching supply zone (${sd.freshSupplyAbove.bottom.toFixed(decimals)}–${sd.freshSupplyAbove.top.toFixed(decimals)}) — expect potential bearish reaction`;
  }
  return null;
}
