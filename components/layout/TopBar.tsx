"use client";

import { RefreshCw, TrendingUp } from "lucide-react";
import { fmtTime } from "@/lib/utils/time";
import type { ForexPair, Timeframe } from "@/types";
import { FOREX_PAIRS, TIMEFRAMES } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { signalColor, signalLabel } from "@/components/signal/SignalCard";
import UserMenu from "@/components/layout/UserMenu";
import clsx from "clsx";

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
  return (
    <header className="sticky top-0 z-40 bg-[#111827]/95 backdrop-blur border-b border-[#1e2d45]">
      <div className="max-w-7xl mx-auto px-3 lg:px-6">
        {/* ── Top row ──────────────────────────────────────────────────────── */}
        <div className="flex items-center justify-between h-12">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-400" />
            <span className="font-semibold text-sm hidden sm:block text-white">
              Forex Signal Analyzer
            </span>
            <span className="font-semibold text-sm sm:hidden text-white">FSA</span>
          </div>

          {/* Current signal badge */}
          {signal && (
            <div className={clsx(
              "px-2.5 py-1 rounded-lg text-xs font-bold tracking-wide",
              signalColor(signal.signal)
            )}>
              {signalLabel(signal.signal)} {signal.confidence}%
            </div>
          )}

          {/* Refresh + last updated + user menu */}
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
          {/* Pair selector */}
          <div className="flex items-center gap-1 bg-[#0a0e1a] rounded-lg p-0.5">
            {FOREX_PAIRS.map((p) => (
              <button
                key={p}
                onClick={() => onPairChange(p)}
                className={clsx(
                  "px-3 py-1.5 rounded-md text-sm font-medium whitespace-nowrap transition-colors",
                  p === pair
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {p}
              </button>
            ))}
          </div>

          {/* Divider */}
          <div className="h-5 w-px bg-[#1e2d45]" />

          {/* Timeframe selector */}
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

          {/* Price display */}
          {signal && (
            <div className="ml-auto text-right shrink-0">
              <div className="price text-base font-semibold text-white">
                {signal.currentPrice.toFixed(pair === "GBP/JPY" ? 3 : 5)}
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
