"use client";

import type { ForexPair } from "@/types";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import { Target, Shield, TrendingUp, TrendingDown } from "lucide-react";
import clsx from "clsx";

function PriceRow({
  label,
  value,
  pair,
  color,
  icon,
}: {
  label: string;
  value: number;
  pair: ForexPair;
  color: string;
  icon: React.ReactNode;
}) {
  const decimals = pair === "GBP/JPY" ? 3 : 5;
  return (
    <div className="flex items-center justify-between py-2 border-b border-[#1e2d45] last:border-0">
      <div className="flex items-center gap-2 text-sm text-slate-400">
        {icon}
        {label}
      </div>
      <span className={clsx("price font-semibold text-sm", color)}>
        {value.toFixed(decimals)}
      </span>
    </div>
  );
}

export default function TradeSetupPanel({
  signal,
  pair,
}: {
  signal: EngineOutput;
  pair: ForexPair;
}) {
  const isBuy = signal.signal === "BUY" || signal.signal === "STRONG_BUY";
  const decimals = pair === "GBP/JPY" ? 3 : 5;

  const pips = Math.abs(signal.takeProfit - signal.entry) * (pair === "GBP/JPY" ? 100 : 10000);
  const slPips = Math.abs(signal.entry - signal.stopLoss) * (pair === "GBP/JPY" ? 100 : 10000);

  if (signal.signal === "HOLD") return null;

  return (
    <div className="card fade-in">
      <div className="card-header">
        <Target className="w-4 h-4 text-blue-400" />
        <span className="text-sm font-medium text-slate-300">Trade Setup</span>
        <span className={clsx(
          "ml-auto text-xs font-bold",
          isBuy ? "text-green-400" : "text-red-400"
        )}>
          {isBuy ? "▲ LONG" : "▼ SHORT"}
        </span>
      </div>

      <div className="px-4 py-2">
        <PriceRow
          label="Entry"
          value={signal.entry}
          pair={pair}
          color="text-white"
          icon={<div className="w-3 h-3 rounded-full bg-blue-500" />}
        />
        <PriceRow
          label="Stop Loss"
          value={signal.stopLoss}
          pair={pair}
          color="text-red-400"
          icon={<Shield className="w-3 h-3 text-red-400" />}
        />
        <PriceRow
          label="Take Profit"
          value={signal.takeProfit}
          pair={pair}
          color="text-green-400"
          icon={<Target className="w-3 h-3 text-green-400" />}
        />
      </div>

      {/* Stats row */}
      <div className="px-4 pb-4 grid grid-cols-3 gap-2">
        <div className="bg-[#0a0e1a] rounded-lg p-2 text-center">
          <div className="text-xs text-slate-500 mb-0.5">Risk/Reward</div>
          <div className={clsx(
            "price text-sm font-bold",
            signal.riskReward >= 2 ? "text-green-400" : "text-yellow-400"
          )}>
            1:{signal.riskReward.toFixed(1)}
          </div>
        </div>
        <div className="bg-[#0a0e1a] rounded-lg p-2 text-center">
          <div className="text-xs text-slate-500 mb-0.5">TP Pips</div>
          <div className="price text-sm font-bold text-green-400">
            {pips.toFixed(1)}
          </div>
        </div>
        <div className="bg-[#0a0e1a] rounded-lg p-2 text-center">
          <div className="text-xs text-slate-500 mb-0.5">SL Pips</div>
          <div className="price text-sm font-bold text-red-400">
            {slPips.toFixed(1)}
          </div>
        </div>
      </div>

      {/* ATR note */}
      <div className="px-4 pb-4 text-xs text-slate-500">
        ATR({14}): {signal.atrValue?.toFixed(decimals)} · SL/TP based on 1.5×ATR / 2.5×ATR
      </div>
    </div>
  );
}
