"use client";

import { RefreshCw, TrendingUp, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { fmtTime } from "@/lib/utils/time";
import type { ForexPair, Timeframe } from "@/types";
import { FOREX_PAIRS, TIMEFRAMES } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { signalColor, signalLabel } from "@/components/signal/SignalCard";
import { getPairDecimals, getPairCategory } from "@/lib/utils/pairs";
import UserMenu from "@/components/layout/UserMenu";
import clsx from "clsx";

// ── Pair groups ───────────────────────────────────────────────────────────────

const PAIR_GROUPS: { label: string; pairs: ForexPair[] }[] = [
  { label: "Forex",       pairs: FOREX_PAIRS.filter((p) => getPairCategory(p) === "forex") },
  { label: "Indices",     pairs: FOREX_PAIRS.filter((p) => getPairCategory(p) === "indices") },
  { label: "Commodities", pairs: FOREX_PAIRS.filter((p) => getPairCategory(p) === "commodities") },
];

// ── Pair dropdown ─────────────────────────────────────────────────────────────

function PairDropdown({
  pair,
  onPairChange,
}: {
  pair: ForexPair;
  onPairChange: (p: ForexPair) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-3 py-1.5 bg-[#0a0e1a] hover:bg-[#1e2d45] border border-[#1e2d45] rounded-lg text-sm font-semibold text-white transition-colors"
      >
        {pair}
        <ChevronDown className={clsx("w-3.5 h-3.5 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 z-50 bg-[#111827] border border-[#1e2d45] rounded-xl shadow-xl py-1 min-w-[180px]">
          {PAIR_GROUPS.map(({ label, pairs }) => (
            <div key={label}>
              <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                {label}
              </div>
              {pairs.map((p) => (
                <button
                  key={p}
                  onClick={() => { onPairChange(p); setOpen(false); }}
                  className={clsx(
                    "w-full text-left px-4 py-1.5 text-sm font-medium transition-colors",
                    p === pair
                      ? "text-blue-400 bg-blue-500/10"
                      : "text-slate-300 hover:bg-[#1e2d45] hover:text-white"
                  )}
                >
                  {p}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── TopBar ────────────────────────────────────────────────────────────────────

interface TopBarProps {
  pair: ForexPair;
  timeframe: Timeframe;
  onPairChange: (p: ForexPair) => void;
  onTimeframeChange: (tf: Timeframe) => void;
  onRefresh: () => void;
  loading: boolean;
  lastUpdated: Date | null;
  signal: EngineOutput | null;
}

export default function TopBar({
  pair, timeframe, onPairChange, onTimeframeChange,
  onRefresh, loading, lastUpdated, signal,
}: TopBarProps) {
  const decimals = getPairDecimals(pair);

  return (
    <header className="sticky top-0 z-40 bg-[#111827]/95 backdrop-blur border-b border-[#1e2d45]">
      <div className="max-w-7xl mx-auto px-3 lg:px-6">
        {/* ── Top row ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between h-12">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm hidden sm:block text-white">
              Forex Signal Analyzer
            </span>
            <span className="font-semibold text-sm sm:hidden text-white">FSA</span>
          </div>

          {signal && (
            <div className={clsx(
              "px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide",
              signalColor(signal.signal)
            )}>
              {signalLabel(signal.signal)} {signal.confidence}%
            </div>
          )}

          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-xs text-slate-500 hidden md:block">
                {fmtTime(lastUpdated)}
              </span>
            )}
            <button
              onClick={onRefresh}
              disabled={loading}
              className="p-2 rounded-lg hover:bg-[#1a2235] text-slate-400 hover:text-blue-400 transition-colors disabled:opacity-50"
              aria-label="Refresh"
            >
              <RefreshCw className={clsx("w-4 h-4", loading && "spin-slow")} />
            </button>
            <UserMenu />
          </div>
        </div>

        {/* ── Pair + Timeframe selectors ─────────────────────────────────── */}
        <div className="flex items-center gap-2 pb-2 overflow-x-auto no-scrollbar">
          <PairDropdown pair={pair} onPairChange={onPairChange} />

          <div className="h-5 w-px bg-[#1e2d45] shrink-0" />

          <div className="flex items-center gap-1">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf}
                onClick={() => onTimeframeChange(tf)}
                className={clsx(
                  "px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors",
                  tf === timeframe
                    ? "bg-[#1e2d45] text-blue-400 font-semibold"
                    : "text-slate-500 hover:text-slate-300"
                )}
              >
                {tf}
              </button>
            ))}
          </div>

          {signal && (
            <div className="ml-auto text-right shrink-0">
              <div className="price text-base font-semibold text-white">
                {signal.currentPrice.toFixed(decimals)}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
