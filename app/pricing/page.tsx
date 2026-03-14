"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import {
  TrendingUp,
  CheckCircle,
  Zap,
  BarChart2,
  ShieldCheck,
  Bell,
  LogOut,
} from "lucide-react";

const FEATURES = [
  { icon: TrendingUp,  text: "Real-time forex signal analysis (EUR/USD, GBP/JPY & more)" },
  { icon: BarChart2,   text: "Full backtest engine with walk-forward validation" },
  { icon: ShieldCheck, text: "Supply & demand zone detection (highest-weight factor)" },
  { icon: Zap,         text: "Multi-timeframe alignment (1h, 4h, daily)" },
  { icon: Bell,        text: "Browser push notifications for high-confidence signals" },
];

export default function PricingPage() {
  return (
    <Suspense>
      <PricingContent />
    </Suspense>
  );
}

function PricingContent() {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { data: session } = useSession();
  const canceled     = searchParams.get("canceled") === "1";

  const [billing, setBilling]   = useState<"monthly" | "yearly">("yearly");
  const [loading, setLoading]   = useState<"monthly" | "yearly" | null>(null);

  async function subscribe(plan: "monthly" | "yearly") {
    setLoading(plan);
    try {
      const res  = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } catch {
      // network error — stay on page
    } finally {
      setLoading(null);
    }
  }

  const monthlyPrice = 14.99;
  const yearlyTotal  = 129;
  const yearlyPerMonth = (yearlyTotal / 12).toFixed(2);
  const yearlySaving  = Math.round(100 - (yearlyTotal / (monthlyPrice * 12)) * 100);

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-slate-100 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
        <div className="flex items-center gap-2">
          <TrendingUp className="text-blue-400" size={22} />
          <span className="font-semibold text-slate-100">Forex Signal Analyzer</span>
        </div>
        {session && (
          <button
            onClick={() => signOut({ callbackUrl: "/auth" })}
            className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
          >
            <LogOut size={14} />
            Sign out
          </button>
        )}
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12 gap-10">
        <div className="text-center max-w-xl">
          {canceled && (
            <div className="mb-5 px-4 py-2.5 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm">
              Payment was not completed. Choose a plan below to get started.
            </div>
          )}
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Professional Forex Signal Analysis
          </h1>
          <p className="text-slate-400 text-sm leading-relaxed">
            Rule-based technical analysis powered by supply &amp; demand zones, multi-timeframe
            alignment, and backtest-validated signals. No guesswork — just data.
          </p>
        </div>

        {/* Features */}
        <ul className="grid sm:grid-cols-2 gap-3 w-full max-w-lg">
          {FEATURES.map(({ icon: Icon, text }) => (
            <li key={text} className="flex items-start gap-3 text-sm text-slate-300">
              <Icon size={15} className="text-blue-400 mt-0.5 shrink-0" />
              {text}
            </li>
          ))}
        </ul>

        {/* Billing toggle */}
        <div className="flex items-center gap-1 bg-slate-800 rounded-full p-1 text-xs font-medium">
          <button
            onClick={() => setBilling("monthly")}
            className={`px-4 py-1.5 rounded-full transition-colors ${
              billing === "monthly"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`px-4 py-1.5 rounded-full transition-colors flex items-center gap-1.5 ${
              billing === "yearly"
                ? "bg-blue-600 text-white"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Annual
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full font-semibold ${
                billing === "yearly"
                  ? "bg-white/20 text-white"
                  : "bg-green-500/20 text-green-400"
              }`}
            >
              -{yearlySaving}%
            </span>
          </button>
        </div>

        {/* Pricing card */}
        <div className="w-full max-w-sm bg-[#111827] border border-slate-700 rounded-2xl overflow-hidden shadow-xl">
          <div className="bg-gradient-to-r from-blue-600/20 to-purple-600/20 border-b border-slate-700 px-6 py-5">
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold">
                ${billing === "monthly" ? monthlyPrice : yearlyPerMonth}
              </span>
              <span className="text-slate-400 text-sm">/ month</span>
            </div>
            {billing === "yearly" && (
              <p className="text-xs text-slate-400 mt-1">
                Billed annually — ${yearlyTotal}/yr
              </p>
            )}
          </div>

          <div className="px-6 py-5 space-y-3">
            {[
              "Unlimited signal analysis",
              "All currency pairs & timeframes",
              "Full backtest with walk-forward",
              "Supply & demand zone detection",
              "Browser push notifications",
              "Signal history (200 entries)",
            ].map((f) => (
              <div key={f} className="flex items-center gap-2.5 text-sm text-slate-300">
                <CheckCircle size={14} className="text-green-400 shrink-0" />
                {f}
              </div>
            ))}
          </div>

          <div className="px-6 pb-6">
            <button
              onClick={() => subscribe(billing)}
              disabled={loading !== null}
              className="w-full py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed font-semibold text-sm transition-colors"
            >
              {loading === billing ? "Redirecting…" : "Start subscription"}
            </button>
            <p className="text-center text-[11px] text-slate-500 mt-3">
              Secure payment via Stripe · Cancel anytime
            </p>
          </div>
        </div>

        <p className="text-xs text-slate-500 max-w-sm text-center">
          Educational tool only. Past signal performance does not guarantee future results.
          Trading forex involves significant risk of loss.
        </p>
      </main>
    </div>
  );
}
