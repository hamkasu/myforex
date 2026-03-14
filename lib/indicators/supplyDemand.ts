import type { Candle } from "@/types";
import type { SDZone, SDAnalysis } from "@/types";
import { calculateATR } from "./atr";

// ─── Internal helpers ────────────────────────────────────────────────────────

function bodySize(c: Candle): number {
  return Math.abs(c.close - c.open);
}

/**
 * Find the "base" (consolidation) before an impulse.
 * A base candle has a small body (< 0.6 × ATR) — indicating indecision/accumulation.
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

/**
 * Remove overlapping zones of the same type, keeping the better one.
 * Input must be pre-sorted best-first (fresh > strong > recent) so the first
 * zone in any overlapping pair is always the one to keep.
 */
function deduplicateZones(zones: SDZone[]): SDZone[] {
  const result: SDZone[] = [];
  for (const zone of zones) {
    const overlaps = result.some(
      (r) => zone.bottom <= r.top && zone.top >= r.bottom
    );
    if (!overlaps) result.push(zone);
    // else: the first (better-ranked) zone already covers this price area
  }
  return result;
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
    const zoneRange  = zoneTop - zoneBottom;

    // Zone must have a meaningful range — not too narrow, not too scattered.
    // A wide base means the candles span too large a price area to represent
    // a tight institutional order cluster.
    if (zoneRange < atr * 0.1) continue;  // too narrow to be meaningful
    if (zoneRange > atr * 1.5) continue;  // too scattered — not a tight consolidation

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

  // Sort: fresh > tested, then strength desc, then recency desc
  const sortZones = (zones: SDZone[]) =>
    zones
      .filter((z) => z.status !== "broken")
      .sort((a, b) => {
        const statusOrder = { fresh: 0, tested: 1, broken: 2 };
        if (statusOrder[a.status] !== statusOrder[b.status]) {
          return statusOrder[a.status] - statusOrder[b.status];
        }
        if (a.strength !== b.strength) return b.strength - a.strength;
        return b.timeIndex - a.timeIndex;
      })
      .slice(0, maxZones);

  // Deduplication runs on the pre-sorted list so the first (better) zone wins
  return {
    supplyZones: deduplicateZones(sortZones(allSupply)),
    demandZones: deduplicateZones(sortZones(allDemand)),
  };
}

// ─── Zone Analysis relative to current price ─────────────────────────────────

/**
 * Analyze supply/demand zones relative to the current price.
 * Returns a structured SDAnalysis with context and scoring.
 *
 * sdScore range: -3 to +3 (continuous, strength-weighted)
 *   × 2 multiplier in scoring.ts gives a final contribution of -6 to +6 (capped ±4)
 *
 * In-zone scoring:
 *   fresh  zone, strength 3 → +3.0  (strongest institutional demand)
 *   fresh  zone, strength 2 → +2.0
 *   fresh  zone, strength 1 → +1.0
 *   tested zone, strength 3 → +1.5  (zone held but partially absorbed)
 *   tested zone, strength 2 → +1.0
 *   tested zone, strength 1 → +0.5
 *
 * Near-zone scoring (not inside):
 *   Continuously graduated by proximity (1 = touching, 0 = at 1 ATR edge),
 *   zone freshness (fresh = 1.0×, tested = 0.6×), and strength (÷3 normalised).
 *   Max near-zone score ≈ 1.0 for a fresh strength-3 zone that price is grazing.
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

  // Active zone: the zone the price is currently inside.
  // Zones are pre-sorted fresh > strong > recent, so the first match is the best.
  const activeDemandZone =
    demandZones.find((z) => price >= z.bottom && price <= z.top) ?? null;
  const activeSupplyZone =
    supplyZones.find((z) => price >= z.bottom && price <= z.top) ?? null;

  const inDemandZone = activeDemandZone !== null;
  const inSupplyZone = activeSupplyZone !== null;

  // Nearest active supply above price
  const freshSupplyAbove =
    supplyZones
      .filter((z) => z.bottom > price)
      .sort((a, b) => a.bottom - b.bottom)[0] ?? null;

  // Nearest active demand below price
  const freshDemandBelow =
    demandZones
      .filter((z) => z.top < price)
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

  // ── SD Score ────────────────────────────────────────────────────────────────
  // Strength-weighted, fresh/tested-differentiated, graduated-proximity score.
  let sdScore = 0;

  if (inDemandZone && activeDemandZone) {
    // Fresh zone = full strength credit; tested = half (orders partially absorbed)
    sdScore =
      activeDemandZone.status === "fresh"
        ? activeDemandZone.strength          // 1, 2, or 3
        : activeDemandZone.strength * 0.5;  // 0.5, 1.0, or 1.5
  } else if (inSupplyZone && activeSupplyZone) {
    sdScore =
      activeSupplyZone.status === "fresh"
        ? -activeSupplyZone.strength
        : -activeSupplyZone.strength * 0.5;
  } else if (nearFreshDemand && freshDemandBelow) {
    // Graduated proximity: 1.0 = touching zone edge, 0.0 = exactly 1 ATR away
    const dist = price - freshDemandBelow.top;
    const distanceFactor  = Math.max(0, 1 - dist / proximity);
    const freshnessFactor = freshDemandBelow.status === "fresh" ? 1.0 : 0.6;
    const strengthFactor  = freshDemandBelow.strength / 3; // 0.33 | 0.67 | 1.0
    sdScore = distanceFactor * freshnessFactor * strengthFactor;
  } else if (nearFreshSupply && freshSupplyAbove) {
    const dist = freshSupplyAbove.bottom - price;
    const distanceFactor  = Math.max(0, 1 - dist / proximity);
    const freshnessFactor = freshSupplyAbove.status === "fresh" ? 1.0 : 0.6;
    const strengthFactor  = freshSupplyAbove.strength / 3;
    sdScore = -(distanceFactor * freshnessFactor * strengthFactor);
  }

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

const strengthLabel = (s: 1 | 2 | 3): string =>
  s === 3 ? "strong " : s === 2 ? "" : "weak ";

export function buildSDReason(sd: SDAnalysis, decimals = 5): string | null {
  if (sd.inDemandZone) {
    const zone = sd.demandZones.find(
      (z) => sd.freshDemandBelow === null || z.bottom <= z.top
    ) ?? sd.demandZones[0];
    const label = zone ? strengthLabel(zone.strength) : "";
    const status = zone?.status === "tested" ? " (tested)" : "";
    return `Price inside ${label}demand zone${status} — high-probability buy area`;
  }
  if (sd.inSupplyZone) {
    const zone = sd.supplyZones.find(
      (z) => sd.freshSupplyAbove === null || z.bottom <= z.top
    ) ?? sd.supplyZones[0];
    const label = zone ? strengthLabel(zone.strength) : "";
    const status = zone?.status === "tested" ? " (tested)" : "";
    return `Price inside ${label}supply zone${status} — high-probability sell area`;
  }
  if (sd.nearFreshDemand && sd.freshDemandBelow) {
    const z = sd.freshDemandBelow;
    return `Approaching ${strengthLabel(z.strength)}demand zone (${z.bottom.toFixed(decimals)}–${z.top.toFixed(decimals)}) — expect potential bullish reaction`;
  }
  if (sd.nearFreshSupply && sd.freshSupplyAbove) {
    const z = sd.freshSupplyAbove;
    return `Approaching ${strengthLabel(z.strength)}supply zone (${z.bottom.toFixed(decimals)}–${z.top.toFixed(decimals)}) — expect potential bearish reaction`;
  }
  return null;
}
