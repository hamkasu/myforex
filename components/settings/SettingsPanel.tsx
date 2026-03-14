"use client";

import { useState } from "react";
import type { AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { Settings, RotateCcw, Save, CreditCard } from "lucide-react";
import clsx from "clsx";

interface SliderRowProps {
  label: string;
  description?: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
}

function SliderRow({
  label, description, value, min, max, step = 1, onChange, format,
}: SliderRowProps) {
  return (
    <div className="py-3 border-b border-[#1e2d45] last:border-0">
      <div className="flex justify-between items-center mb-1">
        <div>
          <div className="text-sm text-slate-300">{label}</div>
          {description && <div className="text-xs text-slate-500">{description}</div>}
        </div>
        <span className="price text-sm font-semibold text-blue-400 min-w-[3rem] text-right">
          {format ? format(value) : value}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-[#1e2d45] accent-blue-500"
      />
      <div className="flex justify-between text-xs text-slate-600 mt-0.5">
        <span>{format ? format(min) : min}</span>
        <span>{format ? format(max) : max}</span>
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  value,
  onChange,
}: {
  label: string;
  description?: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#1e2d45] last:border-0">
      <div>
        <div className="text-sm text-slate-300">{label}</div>
        {description && <div className="text-xs text-slate-500">{description}</div>}
      </div>
      <button
        onClick={() => onChange(!value)}
        className={clsx(
          "relative inline-flex h-6 w-11 items-center rounded-full transition-colors",
          value ? "bg-blue-600" : "bg-[#1e2d45]"
        )}
      >
        <span
          className={clsx(
            "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
            value ? "translate-x-6" : "translate-x-1"
          )}
        />
      </button>
    </div>
  );
}

export default function SettingsPanel({
  settings,
  onSave,
}: {
  settings: AppSettings;
  onSave: (s: AppSettings) => void;
}) {
  const [local, setLocal] = useState<AppSettings>({ ...settings });
  const [saved, setSaved] = useState(false);

  const update = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setLocal((prev) => ({ ...prev, [key]: value }));
    setSaved(false);
  };

  const handleSave = () => {
    onSave(local);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleReset = () => {
    setLocal({ ...DEFAULT_SETTINGS });
    setSaved(false);
  };

  return (
    <div className="card fade-in">
      <div className="card-header justify-between">
        <div className="flex items-center gap-2">
          <Settings className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-slate-300">Settings</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleReset}
            className="flex items-center gap-1 px-2.5 py-1.5 text-xs text-slate-400 hover:text-white rounded-lg hover:bg-[#0a0e1a] transition-colors"
          >
            <RotateCcw className="w-3 h-3" /> Reset
          </button>
          <button
            onClick={handleSave}
            className={clsx(
              "flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg transition-colors",
              saved
                ? "bg-green-600/30 text-green-300"
                : "bg-blue-600 hover:bg-blue-700 text-white"
            )}
          >
            <Save className="w-3 h-3" />
            {saved ? "Saved!" : "Save"}
          </button>
        </div>
      </div>

      <div className="px-4 py-2 space-y-0">
        {/* Section: RSI */}
        <div className="pt-3 pb-1">
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            RSI Settings
          </div>
        </div>
        <SliderRow
          label="RSI Oversold"
          description="Below this = oversold"
          value={local.rsiOversold}
          min={20} max={40}
          onChange={(v) => update("rsiOversold", v)}
        />
        <SliderRow
          label="RSI Overbought"
          description="Above this = overbought"
          value={local.rsiOverbought}
          min={60} max={80}
          onChange={(v) => update("rsiOverbought", v)}
        />

        {/* Section: EMA */}
        <div className="pt-3 pb-1">
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            EMA Settings
          </div>
        </div>
        <SliderRow
          label="Fast EMA Period"
          description="Default: 20"
          value={local.ema1Period}
          min={5} max={50}
          onChange={(v) => update("ema1Period", v)}
        />
        <SliderRow
          label="Slow EMA Period"
          description="Default: 50"
          value={local.ema2Period}
          min={20} max={200}
          onChange={(v) => update("ema2Period", v)}
        />

        {/* Section: ATR */}
        <div className="pt-3 pb-1">
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            ATR / Trade Setup
          </div>
        </div>
        <SliderRow
          label="SL Multiplier"
          description="Stop loss = ATR × this"
          value={local.atrMultiplierSL}
          min={0.5} max={3}
          step={0.1}
          onChange={(v) => update("atrMultiplierSL", v)}
          format={(v) => `${v.toFixed(1)}×`}
        />
        <SliderRow
          label="TP Multiplier"
          description="Take profit = ATR × this"
          value={local.atrMultiplierTP}
          min={1} max={5}
          step={0.1}
          onChange={(v) => update("atrMultiplierTP", v)}
          format={(v) => `${v.toFixed(1)}×`}
        />

        {/* Section: Signal */}
        <div className="pt-3 pb-1">
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            Signal Filters
          </div>
        </div>
        <SliderRow
          label="Min Confidence"
          description="Signals below this become HOLD"
          value={local.minConfidence}
          min={30} max={90}
          onChange={(v) => update("minConfidence", v)}
          format={(v) => `${v}%`}
        />
        <SliderRow
          label="Volatility Threshold"
          description="ATR spike multiplier to trigger volatility filter"
          value={local.volatilityThreshold}
          min={1.5} max={5}
          step={0.1}
          onChange={(v) => update("volatilityThreshold", v)}
          format={(v) => `${v.toFixed(1)}×`}
        />

        {/* Section: Alerts */}
        <div className="pt-3 pb-1">
          <div className="text-xs font-semibold text-blue-400 uppercase tracking-wider mb-1">
            Alerts
          </div>
        </div>
        <SliderRow
          label="Alert Min Confidence"
          description="Only notify when confidence ≥ this"
          value={local.alertMinConfidence}
          min={50} max={90}
          onChange={(v) => update("alertMinConfidence", v)}
          format={(v) => `${v}%`}
        />
        <ToggleRow
          label="Browser Notifications"
          description="Show OS notifications for new signals"
          value={local.enableBrowserNotifications}
          onChange={(v) => update("enableBrowserNotifications", v)}
        />
      </div>

      {/* Billing */}
      <div className="mt-4 pt-4 border-t border-[#1e2d45]">
        <p className="text-[11px] text-slate-500 uppercase tracking-wider mb-2 px-1">Billing</p>
        <BillingButton />
      </div>
    </div>
  );
}

function BillingButton() {
  const [loading, setLoading] = useState(false);

  async function openPortal() {
    setLoading(true);
    try {
      const res  = await fetch("/api/stripe/portal", { method: "POST" });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      onClick={openPortal}
      disabled={loading}
      className="flex items-center gap-2 w-full px-3 py-2.5 rounded-lg bg-[#1e2d45] hover:bg-[#253852] text-sm text-slate-300 transition-colors disabled:opacity-50"
    >
      <CreditCard size={14} className="text-blue-400" />
      {loading ? "Opening portal…" : "Manage subscription & billing"}
    </button>
  );
}
