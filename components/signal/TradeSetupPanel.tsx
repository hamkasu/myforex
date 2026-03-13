"use client";

import type { ForexPair } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { getPairDecimals, getPipFactor, getPipLabel } from "@/lib/utils/pairs";
import { Target, Shield, ArrowUpRight, ArrowDownRight } from "lucide-react";
import clsx from "clsx";

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmt(v: number, decimals: number) {
  return v.toFixed(decimals);
}

function pips(a: number, b: number, pair: ForexPair) {
  return Math.abs(a - b) * getPipFactor(pair);
}

function rr(tpDist: number, slDist: number) {
  if (!slDist) return 0;
  return tpDist / slDist;
}

// ── Level row ─────────────────────────────────────────────────────────────────

function LevelRow({
  label,
  badge,
  price,
  pipDist,
  pipLabel,
  rrRatio,
  decimals,
  color,
  dotColor,
}: {
  label: string;
  badge?: string;
  price: number;
  pipDist?: number;
  pipLabel?: string;
  rrRatio?: number;
  decimals: number;
  color: string;
  dotColor: string;
}) {
  return (
    <div className="flex items-center gap-3 py-1.5">
      <div className={clsx("w-2 h-2 rounded-full shrink-0 mt-0.5", dotColor)} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-slate-400">{label}</span>
          {badge && (
            <span className="text-[10px] px-1.5 py-0 rounded bg-[#1e2d45] text-slate-400 font-medium">
              {badge}
            </span>
          )}
        </div>
        <span className={clsx("price font-bold text-sm tracking-wide", color)}>
          {fmt(price, decimals)}
        </span>
      </div>
      <div className="text-right shrink-0">
        {pipDist !== undefined && (
          <div className={clsx("price text-xs font-semibold", color)}>
            {pipDist.toFixed(1)} {pipLabel ?? "pips"}
          </div>
        )}
        {rrRatio !== undefined && (
          <div className="text-[10px] text-slate-500 mt-0.5">
            1:{rrRatio.toFixed(1)}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Visual ladder ─────────────────────────────────────────────────────────────

function PriceLadder({
  sl, entry, tp1, tp2, tp3, isBuy,
}: {
  sl: number; entry: number; tp1: number; tp2: number; tp3: number; isBuy: boolean;
}) {
  const levels = isBuy
    ? [tp3, tp2, tp1, entry, sl]
    : [sl, entry, tp1, tp2, tp3];

  const min = Math.min(...levels);
  const max = Math.max(...levels);
  const range = max - min || 1;

  function pct(v: number) {
    return isBuy
      ? ((v - min) / range) * 100
      : (1 - (v - min) / range) * 100;
  }

  const items = [
    { v: isBuy ? tp3 : sl,    color: isBuy ? "bg-emerald-400" : "bg-red-500",     label: isBuy ? "TP3" : "SL" },
    { v: isBuy ? tp2 : tp3,   color: isBuy ? "bg-green-400" : "bg-red-400",       label: isBuy ? "TP2" : "TP3" },
    { v: isBuy ? tp1 : tp2,   color: isBuy ? "bg-green-300/80" : "bg-red-300/80", label: isBuy ? "TP1" : "TP2" },
    { v: isBuy ? entry : tp1, color: isBuy ? "bg-green-300/50" : "bg-red-300/50", label: isBuy ? "Entry" : "TP1" },
    { v: isBuy ? sl : entry,  color: "bg-slate-400",                              label: isBuy ? "SL" : "Entry" },
  ];

  return (
    <div className="relative h-32 mx-1 my-1">
      {/* Track */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-[#1e2d45]" />

      {items.map((item, i) => (
        <div
          key={i}
          className="absolute flex items-center gap-2"
          style={{ top: `${100 - pct(item.v)}%`, transform: "translateY(-50%)" }}
        >
          <div className={clsx("w-2 h-2 rounded-full z-10", item.color)} />
          <span className="text-[10px] text-slate-500 font-medium">{item.label}</span>
        </div>
      ))}

      {/* Fill: entry to tp2 */}
      <div
        className={clsx(
          "absolute left-3 w-px",
          isBuy ? "bg-green-500/40" : "bg-red-500/40",
        )}
        style={{
          top: `${100 - pct(isBuy ? tp2 : tp2)}%`,
          bottom: `${pct(isBuy ? entry : entry)}%`,
        }}
      />
      {/* Fill: entry to sl */}
      <div
        className="absolute left-3 w-px bg-red-500/40"
        style={{
          top: `${100 - pct(isBuy ? entry : sl)}%`,
          bottom: `${pct(isBuy ? sl : entry)}%`,
        }}
      />
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function TradeSetupPanel({
  signal,
  pair,
}: {
  signal: EngineOutput;
  pair: ForexPair;
}) {
  if (signal.signal === "HOLD") return null;

  const isBuy    = signal.signal === "BUY" || signal.signal === "STRONG_BUY";
  const decimals = getPairDecimals(pair);
  const pipLbl   = getPipLabel(pair);
  const atr      = signal.atrValue;
  const entry    = signal.entry;

  // Entry zone: ±0.3 ATR around entry (where to realistically fill)
  const entryLow  = isBuy  ? entry - atr * 0.3 : entry;
  const entryHigh = isBuy  ? entry : entry + atr * 0.3;

  // Multi-level take profits
  const tp1 = isBuy ? entry + atr * 1.0 : entry - atr * 1.0;   // conservative 1:0.67
  const tp2 = signal.takeProfit;                                  // main (2.5×ATR)
  const tp3 = isBuy ? entry + atr * 4.0 : entry - atr * 4.0;   // extended 1:2.67

  const sl   = signal.stopLoss;
  const slD  = pips(entry, sl,  pair);
  const tp1D = pips(entry, tp1, pair);
  const tp2D = pips(entry, tp2, pair);
  const tp3D = pips(entry, tp3, pair);

  return (
    <div className="card fade-in">
      {/* Header */}
      <div className="card-header">
        <Target className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-slate-300">Trade Setup</span>
        <span className={clsx(
          "ml-auto flex items-center gap-1 text-xs font-bold",
          isBuy ? "text-green-400" : "text-red-400",
        )}>
          {isBuy
            ? <><ArrowUpRight className="w-3.5 h-3.5" /> LONG</>
            : <><ArrowDownRight className="w-3.5 h-3.5" /> SHORT</>}
        </span>
      </div>

      <div className="px-4 pb-1 pt-2 flex gap-3">
        {/* Ladder */}
        <PriceLadder sl={sl} entry={entry} tp1={tp1} tp2={tp2} tp3={tp3} isBuy={isBuy} />

        {/* Levels */}
        <div className="flex-1 space-y-0">

          {/* Stop Loss */}
          <LevelRow
            label="Stop Loss"
            price={sl}
            pipDist={slD} pipLabel={pipLbl}
            decimals={decimals}
            color="text-red-400"
            dotColor="bg-red-500"
          />

          <div className="border-t border-[#1e2d45] my-1" />

          {/* Entry Zone */}
          <div className="py-1">
            <div className="flex items-center gap-1.5 mb-0.5">
              <div className="w-2 h-2 rounded-full bg-blue-400 shrink-0" />
              <span className="text-xs text-slate-400">Entry Zone</span>
              <span className="text-[10px] px-1.5 rounded bg-[#1e2d45] text-slate-400">±0.3 ATR</span>
            </div>
            <div className="pl-3.5 price font-bold text-sm text-white">
              {fmt(entryLow, decimals)}
              <span className="text-slate-500 font-normal mx-1">–</span>
              {fmt(entryHigh, decimals)}
            </div>
          </div>

          <div className="border-t border-[#1e2d45] my-1" />

          {/* TP1 */}
          <LevelRow
            label="Target 1"  badge="Conservative"
            price={tp1} pipDist={tp1D} pipLabel={pipLbl} rrRatio={rr(tp1D, slD)}
            decimals={decimals} color="text-green-300/80" dotColor="bg-green-300/70"
          />
          {/* TP2 */}
          <LevelRow
            label="Target 2"  badge="Main"
            price={tp2} pipDist={tp2D} pipLabel={pipLbl} rrRatio={rr(tp2D, slD)}
            decimals={decimals} color="text-green-400" dotColor="bg-green-400"
          />
          {/* TP3 */}
          <LevelRow
            label="Target 3"  badge="Extended"
            price={tp3} pipDist={tp3D} pipLabel={pipLbl} rrRatio={rr(tp3D, slD)}
            decimals={decimals} color="text-emerald-400" dotColor="bg-emerald-400"
          />
        </div>
      </div>

      {/* Footer: ATR info */}
      <div className="px-4 pb-3 pt-1 flex items-center justify-between text-xs text-slate-500 border-t border-[#1e2d45] mt-1">
        <span>ATR(14): <span className="price text-slate-400">{fmt(atr, decimals)}</span></span>
        <span>SL = 1.5×ATR · TP1 = 1× · TP2 = 2.5× · TP3 = 4×</span>
      </div>
    </div>
  );
}
