"use client";

import type { Candle, SDZone } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { getPairDecimals } from "@/lib/utils/pairs";
import { Activity, Layers } from "lucide-react";
import clsx from "clsx";

// ─── Shared row component ─────────────────────────────────────────────────────

interface IndicatorRowProps {
  label: string;
  value: string | number;
  subtext?: string;
  badge?: { text: string; color: string };
}

function IndicatorRow({ label, value, subtext, badge }: IndicatorRowProps) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-[#1e2d45] last:border-0">
      <div>
        <div className="text-sm text-slate-300">{label}</div>
        {subtext && <div className="text-xs text-slate-500">{subtext}</div>}
      </div>
      <div className="flex items-center gap-2">
        {badge && (
          <span className={clsx("text-xs px-2 py-0.5 rounded-full", badge.color)}>
            {badge.text}
          </span>
        )}
        <span className="price font-semibold text-white text-sm">{value}</span>
      </div>
    </div>
  );
}

// ─── Status helpers ───────────────────────────────────────────────────────────

function rsiStatus(rsi: number): { text: string; color: string } {
  if (rsi < 30) return { text: "Oversold",   color: "bg-green-600/30 text-green-300" };
  if (rsi < 45) return { text: "Bearish",    color: "bg-red-600/30 text-red-300" };
  if (rsi < 55) return { text: "Neutral",    color: "bg-slate-600/30 text-slate-300" };
  if (rsi < 70) return { text: "Bullish",    color: "bg-green-600/30 text-green-300" };
  return           { text: "Overbought", color: "bg-red-600/30 text-red-300" };
}

function macdStatus(h: number): { text: string; color: string } {
  if (h > 0) return { text: "Bullish", color: "bg-green-600/30 text-green-300" };
  if (h < 0) return { text: "Bearish", color: "bg-red-600/30 text-red-300" };
  return           { text: "Neutral", color: "bg-slate-600/30 text-slate-300" };
}

function adxStatus(adx: number): { text: string; color: string } {
  if (isNaN(adx)) return { text: "—", color: "bg-slate-600/30 text-slate-400" };
  if (adx > 40)   return { text: "Strong Trend", color: "bg-blue-600/30 text-blue-300" };
  if (adx > 25)   return { text: "Trending",     color: "bg-green-600/30 text-green-300" };
  if (adx > 20)   return { text: "Developing",   color: "bg-yellow-600/30 text-yellow-300" };
  return                 { text: "Ranging",       color: "bg-slate-600/30 text-slate-400" };
}

function stochStatus(k: number): { text: string; color: string } {
  if (isNaN(k))  return { text: "—",          color: "bg-slate-600/30 text-slate-400" };
  if (k < 20)    return { text: "Oversold",   color: "bg-green-600/30 text-green-300" };
  if (k < 40)    return { text: "Weak",       color: "bg-red-600/30 text-red-300" };
  if (k < 60)    return { text: "Neutral",    color: "bg-slate-600/30 text-slate-300" };
  if (k < 80)    return { text: "Strong",     color: "bg-green-600/30 text-green-300" };
  return                { text: "Overbought", color: "bg-red-600/30 text-red-300" };
}

function bbStatus(pB: number): { text: string; color: string } {
  if (isNaN(pB))  return { text: "—",             color: "bg-slate-600/30 text-slate-400" };
  if (pB < 0)     return { text: "Below Band",     color: "bg-green-600/30 text-green-300" };
  if (pB <= 0.1)  return { text: "Near Lower",     color: "bg-green-600/30 text-green-300" };
  if (pB >= 1)    return { text: "Above Band",     color: "bg-red-600/30 text-red-300" };
  if (pB >= 0.9)  return { text: "Near Upper",     color: "bg-red-600/30 text-red-300" };
  return                 { text: "Mid Band",        color: "bg-slate-600/30 text-slate-300" };
}

function emaTrendStatus(ema20: number, ema50: number): { text: string; color: string } {
  if (ema20 > ema50) return { text: "Uptrend",   color: "bg-green-600/30 text-green-300" };
  if (ema20 < ema50) return { text: "Downtrend", color: "bg-red-600/30 text-red-300" };
  return                    { text: "Sideways",  color: "bg-slate-600/30 text-slate-300" };
}

function strengthDots(s: 1 | 2 | 3) {
  return (
    <span className="flex gap-0.5 items-center">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={clsx("w-1.5 h-1.5 rounded-full", i <= s ? "bg-current" : "bg-[#1e2d45]")}
        />
      ))}
    </span>
  );
}

// ─── S&D Zone chip ────────────────────────────────────────────────────────────

function ZoneChip({ zone, decimals }: { zone: SDZone; decimals: number }) {
  const isDemand = zone.type === "demand";
  return (
    <div
      className={clsx(
        "flex items-center justify-between px-2.5 py-1.5 rounded-lg border text-xs",
        isDemand
          ? "bg-green-600/10 border-green-600/30 text-green-300"
          : "bg-red-600/10 border-red-600/30 text-red-300"
      )}
    >
      <div className="flex items-center gap-1.5">
        {strengthDots(zone.strength)}
        <span className="price font-medium">
          {zone.bottom.toFixed(decimals)} – {zone.top.toFixed(decimals)}
        </span>
      </div>
      <span
        className={clsx(
          "px-1.5 py-0.5 rounded text-xs font-medium",
          zone.status === "fresh"
            ? isDemand ? "bg-green-600/30" : "bg-red-600/30"
            : "bg-slate-600/30 text-slate-400"
        )}
      >
        {zone.status}
      </span>
    </div>
  );
}

// ─── S&D Summary banner ───────────────────────────────────────────────────────

function SDContextBanner({ sd }: { sd: EngineOutput["indicators"]["sd"] }) {
  if (!sd) return null;

  if (sd.inDemandZone) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-600/20 border border-green-600/30 rounded-lg text-xs text-green-300">
        <span className="text-base">📍</span>
        <span><strong>Inside Demand Zone</strong> — price is in an institutional buy area</span>
      </div>
    );
  }
  if (sd.inSupplyZone) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-600/20 border border-red-600/30 rounded-lg text-xs text-red-300">
        <span className="text-base">📍</span>
        <span><strong>Inside Supply Zone</strong> — price is in an institutional sell area</span>
      </div>
    );
  }
  if (sd.nearFreshDemand && sd.freshDemandBelow) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-green-600/10 border border-green-600/20 rounded-lg text-xs text-green-400">
        <span className="text-base">↓</span>
        <span>Approaching demand zone below — potential bullish reaction ahead</span>
      </div>
    );
  }
  if (sd.nearFreshSupply && sd.freshSupplyAbove) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-600/10 border border-red-600/20 rounded-lg text-xs text-red-400">
        <span className="text-base">↑</span>
        <span>Approaching supply zone above — potential bearish reaction ahead</span>
      </div>
    );
  }
  return (
    <div className="px-3 py-2 bg-[#0a0e1a] rounded-lg text-xs text-slate-500">
      Price is between zones — no immediate S&D context
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function IndicatorsPanel({
  signal,
  candles,
}: {
  signal: EngineOutput;
  candles: Candle[];
}) {
  const ind      = signal.indicators;
  const decimals = getPairDecimals(signal.pair);
  const sd       = ind.sd;

  return (
    <div className="space-y-3">
      {/* ── Classic indicators ─────────────────────────────────────────────── */}
      <div className="card fade-in">
        <div className="card-header">
          <Activity className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-300">Technical Indicators</span>
        </div>

        <div className="px-4 py-1">
          <IndicatorRow
            label="EMA 20"
            value={ind.ema20?.toFixed(decimals) ?? "—"}
            subtext={`EMA 50: ${ind.ema50?.toFixed(decimals) ?? "—"}`}
            badge={emaTrendStatus(ind.ema20, ind.ema50)}
          />
          <IndicatorRow
            label="RSI (14)"
            value={ind.rsi?.toFixed(1) ?? "—"}
            badge={isNaN(ind.rsi) ? undefined : rsiStatus(ind.rsi)}
          />
          <IndicatorRow
            label="MACD"
            value={ind.macdLine?.toFixed(decimals) ?? "—"}
            subtext={`Signal: ${ind.signalLine?.toFixed(decimals) ?? "—"} · Hist: ${ind.histogram?.toFixed(decimals) ?? "—"}`}
            badge={isNaN(ind.histogram) ? undefined : macdStatus(ind.histogram)}
          />
          <IndicatorRow
            label="ATR (14)"
            value={ind.atr?.toFixed(decimals) ?? "—"}
            subtext="Average True Range — volatility measure"
          />
          <IndicatorRow
            label="ADX (14)"
            value={isNaN(ind.adx) ? "—" : ind.adx.toFixed(1)}
            subtext={`+DI: ${isNaN(ind.plusDI) ? "—" : ind.plusDI.toFixed(1)}  ·  -DI: ${isNaN(ind.minusDI) ? "—" : ind.minusDI.toFixed(1)}`}
            badge={adxStatus(ind.adx)}
          />
          <IndicatorRow
            label="Bollinger %B"
            value={isNaN(ind.bbPercentB) ? "—" : ind.bbPercentB.toFixed(2)}
            subtext={`Upper: ${isNaN(ind.bbUpper) ? "—" : ind.bbUpper.toFixed(decimals)}  ·  Lower: ${isNaN(ind.bbLower) ? "—" : ind.bbLower.toFixed(decimals)}`}
            badge={bbStatus(ind.bbPercentB)}
          />
          <IndicatorRow
            label="Stochastic"
            value={isNaN(ind.stochK) ? "—" : ind.stochK.toFixed(1)}
            subtext={`%K: ${isNaN(ind.stochK) ? "—" : ind.stochK.toFixed(1)}  ·  %D: ${isNaN(ind.stochD) ? "—" : ind.stochD.toFixed(1)}`}
            badge={stochStatus(ind.stochK)}
          />

          {/* Pivot-based support */}
          <div className="py-2.5 border-b border-[#1e2d45]">
            <div className="text-sm text-slate-300 mb-1.5">Pivot Support</div>
            {ind.supportLevels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {ind.supportLevels.map((s, i) => (
                  <span key={i} className="price text-xs px-2 py-0.5 bg-green-600/20 border border-green-600/30 text-green-300 rounded">
                    {s.toFixed(decimals)}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-slate-500">None detected</span>
            )}
          </div>

          {/* Pivot-based resistance */}
          <div className="py-2.5">
            <div className="text-sm text-slate-300 mb-1.5">Pivot Resistance</div>
            {ind.resistanceLevels.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {ind.resistanceLevels.map((r, i) => (
                  <span key={i} className="price text-xs px-2 py-0.5 bg-red-600/20 border border-red-600/30 text-red-300 rounded">
                    {r.toFixed(decimals)}
                  </span>
                ))}
              </div>
            ) : (
              <span className="text-xs text-slate-500">None detected</span>
            )}
          </div>
        </div>
      </div>

      {/* ── Supply & Demand Zones ──────────────────────────────────────────── */}
      {sd && (
        <div className="card fade-in">
          <div className="card-header">
            <Layers className="w-4 h-4 text-orange-400" />
            <span className="text-sm font-medium text-slate-300">Supply & Demand Zones</span>
            <span className="ml-auto text-xs text-slate-500">
              {sd.supplyZones.length}S · {sd.demandZones.length}D
            </span>
          </div>

          <div className="px-4 py-3 space-y-3">
            {/* Context banner */}
            <SDContextBanner sd={sd} />

            {/* Supply zones */}
            {sd.supplyZones.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">
                  Supply Zones
                </div>
                <div className="space-y-1.5">
                  {sd.supplyZones.map((z, i) => (
                    <ZoneChip key={i} zone={z} decimals={decimals} />
                  ))}
                </div>
              </div>
            )}

            {/* Demand zones */}
            {sd.demandZones.length > 0 && (
              <div>
                <div className="text-xs font-semibold text-green-400 uppercase tracking-wider mb-2">
                  Demand Zones
                </div>
                <div className="space-y-1.5">
                  {sd.demandZones.map((z, i) => (
                    <ZoneChip key={i} zone={z} decimals={decimals} />
                  ))}
                </div>
              </div>
            )}

            {sd.supplyZones.length === 0 && sd.demandZones.length === 0 && (
              <p className="text-xs text-slate-500 text-center py-2">
                No significant zones detected yet — need more candle history.
              </p>
            )}

            {/* Legend */}
            <div className="pt-2 border-t border-[#1e2d45] text-xs text-slate-600 space-y-0.5">
              <p>Strength: ●●● = strong impulse (&gt;3× ATR), ●●○ = moderate, ●○○ = weak</p>
              <p>Fresh = untested zone  ·  Tested = price touched but bounced</p>
              <p>Zones shown on chart as dashed horizontal lines (S=red, D=green)</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
