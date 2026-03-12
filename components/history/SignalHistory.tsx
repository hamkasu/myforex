"use client";

import { useState } from "react";
import type { StoredSignal } from "@/types";
import { History, Trash2, Download } from "lucide-react";
import { exportSignalsCSV } from "@/lib/storage/storage";
import { signalColor, signalLabel } from "@/components/signal/SignalCard";
import clsx from "clsx";

function SignalRow({ s }: { s: StoredSignal }) {
  const decimals = s.pair === "GBP/JPY" ? 3 : 5;
  const isBuy = s.signal === "BUY" || s.signal === "STRONG_BUY";
  const isSell = s.signal === "SELL" || s.signal === "STRONG_SELL";

  return (
    <div className="px-4 py-3 border-b border-[#1e2d45] last:border-0 hover:bg-[#1e2d45]/40 transition-colors">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className={clsx(
            "shrink-0 px-2 py-0.5 rounded text-xs font-bold",
            signalColor(s.signal)
          )}>
            {signalLabel(s.signal)}
          </span>
          <div className="min-w-0">
            <div className="text-sm text-white font-medium">
              {s.pair} · {s.timeframe}
            </div>
            <div className="text-xs text-slate-500">
              {new Date(s.timestamp * 1000).toLocaleString()}
            </div>
          </div>
        </div>

        <div className="text-right shrink-0">
          <div className="price text-sm font-semibold text-white">
            {s.currentPrice.toFixed(decimals)}
          </div>
          <div className={clsx(
            "text-xs font-medium",
            s.confidence >= 75 ? "text-green-400" :
            s.confidence >= 55 ? "text-yellow-400" :
            "text-slate-400"
          )}>
            {s.confidence}% conf
          </div>
        </div>
      </div>

      {/* Mini reason */}
      {s.reasons[0] && (
        <p className="mt-1.5 text-xs text-slate-500 truncate">{s.reasons[0]}</p>
      )}

      {/* Trade setup mini */}
      <div className="mt-1.5 flex gap-3 text-xs">
        <span className="text-slate-500">
          SL: <span className="price text-red-400">{s.stopLoss.toFixed(decimals)}</span>
        </span>
        <span className="text-slate-500">
          TP: <span className="price text-green-400">{s.takeProfit.toFixed(decimals)}</span>
        </span>
        <span className="text-slate-500">
          RR: <span className="price text-blue-400">1:{s.riskReward.toFixed(1)}</span>
        </span>
      </div>
    </div>
  );
}

export default function SignalHistory({
  history,
  onClear,
}: {
  history: StoredSignal[];
  onClear: () => void;
}) {
  const [confirming, setConfirming] = useState(false);

  const handleClear = () => {
    if (confirming) {
      onClear();
      setConfirming(false);
    } else {
      setConfirming(true);
      setTimeout(() => setConfirming(false), 3000);
    }
  };

  const handleExport = () => {
    const csv = exportSignalsCSV();
    if (!csv) return;
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `forex-signals-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="card fade-in">
      <div className="card-header justify-between">
        <div className="flex items-center gap-2">
          <History className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-300">Signal History</span>
          <span className="text-xs text-slate-500">({history.length})</span>
        </div>
        <div className="flex items-center gap-1">
          {history.length > 0 && (
            <>
              <button
                onClick={handleExport}
                className="p-1.5 rounded hover:bg-[#0a0e1a] text-slate-400 hover:text-blue-400 transition-colors"
                title="Export CSV"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={handleClear}
                className={clsx(
                  "p-1.5 rounded transition-colors text-sm",
                  confirming
                    ? "bg-red-600/30 text-red-300"
                    : "hover:bg-[#0a0e1a] text-slate-400 hover:text-red-400"
                )}
                title={confirming ? "Click again to confirm" : "Clear history"}
              >
                {confirming ? (
                  <span className="text-xs px-1">Confirm?</span>
                ) : (
                  <Trash2 className="w-3.5 h-3.5" />
                )}
              </button>
            </>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="px-4 py-12 text-center text-slate-500 text-sm">
          <History className="w-8 h-8 mx-auto mb-2 opacity-30" />
          <p>No signals saved yet.</p>
          <p className="text-xs mt-1">BUY/SELL signals above minimum confidence are auto-saved.</p>
        </div>
      ) : (
        <div className="divide-y divide-[#1e2d45] max-h-[600px] overflow-y-auto">
          {history.map((s) => (
            <SignalRow key={s.id} s={s} />
          ))}
        </div>
      )}
    </div>
  );
}
