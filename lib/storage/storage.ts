/**
 * Unified storage layer using localStorage with JSON serialization.
 * Designed so IndexedDB can replace it later without changing call sites.
 */
import type { StoredSignal, BacktestResult, AppSettings, AlertConfig } from "@/types";
import { DEFAULT_SETTINGS, TIMEFRAMES } from "@/types";

const KEYS = {
  signals: "fsa:signals",
  backtests: "fsa:backtests",
  settings: "fsa:settings",
  alerts: "fsa:alerts",
  lastPair: "fsa:lastPair",
  lastTimeframe: "fsa:lastTimeframe",
  lastTab: "fsa:lastTab",
} as const;

function load<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage quota exceeded — silently fail
  }
}

// ─── Signal History ──────────────────────────────────────────────────────────

export function getSignalHistory(): StoredSignal[] {
  return load<StoredSignal[]>(KEYS.signals, []);
}

export function saveSignal(signal: StoredSignal): void {
  const history = getSignalHistory();
  // Keep newest 200 signals
  const updated = [signal, ...history].slice(0, 200);
  save(KEYS.signals, updated);
}

export function clearSignalHistory(): void {
  save(KEYS.signals, []);
}

export function exportSignalsCSV(): string {
  const signals = getSignalHistory();
  if (signals.length === 0) return "";

  const headers = [
    "ID", "Timestamp", "Pair", "Timeframe", "Signal",
    "Confidence", "Price", "Entry", "StopLoss", "TakeProfit", "RiskReward",
  ];

  const rows = signals.map((s) => [
    s.id,
    new Date(s.timestamp * 1000).toISOString(),
    s.pair,
    s.timeframe,
    s.signal,
    s.confidence,
    s.currentPrice,
    s.entry,
    s.stopLoss,
    s.takeProfit,
    s.riskReward.toFixed(2),
  ].join(","));

  return [headers.join(","), ...rows].join("\n");
}

// ─── Backtest Results ────────────────────────────────────────────────────────

export function getBacktestResults(): BacktestResult[] {
  return load<BacktestResult[]>(KEYS.backtests, []);
}

export function saveBacktestResult(result: BacktestResult): void {
  const results = getBacktestResults();
  const updated = [result, ...results].slice(0, 20);
  save(KEYS.backtests, updated);
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSettings(): AppSettings {
  return { ...DEFAULT_SETTINGS, ...load<Partial<AppSettings>>(KEYS.settings, {}) };
}

export function saveSettings(settings: AppSettings): void {
  save(KEYS.settings, settings);
}

// ─── Alert Config ────────────────────────────────────────────────────────────

export function getAlertConfig(): AlertConfig[] {
  return load<AlertConfig[]>(KEYS.alerts, []);
}

export function saveAlertConfig(configs: AlertConfig[]): void {
  save(KEYS.alerts, configs);
}

// ─── UI Preferences ──────────────────────────────────────────────────────────

export function getLastPair(): string {
  return load<string>(KEYS.lastPair, "EUR/USD");
}

export function saveLastPair(pair: string): void {
  save(KEYS.lastPair, pair);
}

export function getLastTimeframe(): string {
  const tf = load<string>(KEYS.lastTimeframe, "1h");
  // Guard against stale values (e.g. "5m"/"15m" removed in a past release)
  return (TIMEFRAMES as readonly string[]).includes(tf) ? tf : "1h";
}

export function saveLastTimeframe(tf: string): void {
  save(KEYS.lastTimeframe, tf);
}

export function getLastTab(): string {
  return load<string>(KEYS.lastTab, "overview");
}

export function saveLastTab(tab: string): void {
  save(KEYS.lastTab, tab);
}
