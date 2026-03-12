"use client";

import { useState, useEffect, useCallback } from "react";
import dynamic from "next/dynamic";
import type { ForexPair, Timeframe, TabId, Candle, AppSettings } from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { getCandles } from "@/lib/data/provider";
import { runSignalEngine } from "@/lib/signals/signalEngine";
import type { EngineOutput } from "@/lib/signals/signalEngine";
import {
  getSettings, saveSettings, saveSignal, getSignalHistory,
  saveLastPair, saveLastTimeframe, getLastPair, getLastTimeframe,
  getLastTab, saveLastTab,
} from "@/lib/storage/storage";
import { sendBrowserNotification } from "@/lib/pwa/notifications";

import TopBar from "@/components/layout/TopBar";
import BottomNav from "@/components/layout/BottomNav";
import OfflineBanner from "@/components/layout/OfflineBanner";
import SignalCard from "@/components/signal/SignalCard";
import TradeSetupPanel from "@/components/signal/TradeSetupPanel";
import SignalHistory from "@/components/history/SignalHistory";
import BacktestPanel from "@/components/backtest/BacktestPanel";
import SettingsPanel from "@/components/settings/SettingsPanel";
import AlertsPanel from "@/components/alerts/AlertsPanel";
import IndicatorsPanel from "@/components/signal/IndicatorsPanel";

// Dynamically import the chart (uses browser APIs)
const CandlestickChart = dynamic(() => import("@/components/chart/CandlestickChart"), {
  ssr: false,
  loading: () => (
    <div className="card h-72 flex items-center justify-center text-slate-500">
      <span className="spin-slow inline-block w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full" />
    </div>
  ),
});

export default function HomePage() {
  const [pair, setPair] = useState<ForexPair>("EUR/USD");
  const [timeframe, setTimeframe] = useState<Timeframe>("1h");
  const [activeTab, setActiveTab] = useState<TabId>("overview");
  const [candles, setCandles] = useState<Candle[]>([]);
  const [signal, setSignal] = useState<EngineOutput | null>(null);
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [signalHistory, setSignalHistory] = useState(getSignalHistory());
  const [isOnline, setIsOnline] = useState(true);

  // ── Load persisted preferences ─────────────────────────────────────────────
  useEffect(() => {
    const savedPair = getLastPair() as ForexPair;
    const savedTF = getLastTimeframe() as Timeframe;
    const savedTab = getLastTab() as TabId;
    const savedSettings = getSettings();

    setPair(savedPair);
    setTimeframe(savedTF);
    setActiveTab(savedTab);
    setSettings(savedSettings);
  }, []);

  // ── Online/offline detection ───────────────────────────────────────────────
  useEffect(() => {
    const setOnline = () => setIsOnline(true);
    const setOffline = () => setIsOnline(false);

    setIsOnline(navigator.onLine);
    window.addEventListener("online", setOnline);
    window.addEventListener("offline", setOffline);
    return () => {
      window.removeEventListener("online", setOnline);
      window.removeEventListener("offline", setOffline);
    };
  }, []);

  // ── Fetch candles + compute signal ────────────────────────────────────────
  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getCandles(pair, timeframe);
      setCandles(data);

      const result = runSignalEngine(data, pair, timeframe, settings);
      setSignal(result);
      setLastUpdated(new Date());

      // Auto-save to history when signal is actionable
      if (result.signal !== "HOLD" && result.confidence >= settings.minConfidence) {
        const stored = {
          ...result,
          id: `${Date.now()}-${pair}-${timeframe}`,
        };
        saveSignal(stored);
        setSignalHistory(getSignalHistory());

        // Browser notification if enabled
        if (settings.enableBrowserNotifications) {
          sendBrowserNotification(result);
        }
      }
    } catch (err) {
      console.error("Failed to load chart data:", err);
    } finally {
      setLoading(false);
    }
  }, [pair, timeframe, settings]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // ── Persist pair/timeframe/tab ────────────────────────────────────────────
  const handlePairChange = (p: ForexPair) => {
    setPair(p);
    saveLastPair(p);
  };

  const handleTimeframeChange = (tf: Timeframe) => {
    setTimeframe(tf);
    saveLastTimeframe(tf);
  };

  const handleTabChange = (tab: TabId) => {
    setActiveTab(tab);
    saveLastTab(tab);
  };

  const handleSettingsChange = (newSettings: AppSettings) => {
    setSettings(newSettings);
    saveSettings(newSettings);
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#0a0e1a]">
      <OfflineBanner isOnline={isOnline} />

      <TopBar
        pair={pair}
        timeframe={timeframe}
        onPairChange={handlePairChange}
        onTimeframeChange={handleTimeframeChange}
        onRefresh={refresh}
        loading={loading}
        lastUpdated={lastUpdated}
        signal={signal}
      />

      {/* Main content area */}
      <main className="flex-1 overflow-y-auto pb-20 lg:pb-0">
        <div className="max-w-7xl mx-auto px-3 py-3 lg:px-6 lg:py-4">

          {/* ── Desktop: side-by-side layout ─────────────────────────────── */}
          <div className="hidden lg:grid lg:grid-cols-3 lg:gap-4">
            {/* Left column: chart + overview */}
            <div className="lg:col-span-2 space-y-4">
              <CandlestickChart
                candles={candles}
                pair={pair}
                signal={signal}
                loading={loading}
              />

              <TabContent
                activeTab={activeTab}
                candles={candles}
                signal={signal}
                settings={settings}
                signalHistory={signalHistory}
                pair={pair}
                timeframe={timeframe}
                onSettingsChange={handleSettingsChange}
                onHistoryUpdate={() => setSignalHistory(getSignalHistory())}
              />
            </div>

            {/* Right column: signal details */}
            <div className="space-y-4">
              {signal && (
                <>
                  <SignalCard signal={signal} />
                  <TradeSetupPanel signal={signal} pair={pair} />
                </>
              )}
              <AlertsPanel settings={settings} onSettingsChange={handleSettingsChange} />
            </div>
          </div>

          {/* ── Mobile: stacked layout with bottom nav ──────────────────── */}
          <div className="lg:hidden space-y-3">
            {activeTab === "overview" && (
              <>
                <CandlestickChart
                  candles={candles}
                  pair={pair}
                  signal={signal}
                  loading={loading}
                />
                {signal && (
                  <>
                    <SignalCard signal={signal} />
                    <TradeSetupPanel signal={signal} pair={pair} />
                  </>
                )}
              </>
            )}

            {activeTab !== "overview" && (
              <TabContent
                activeTab={activeTab}
                candles={candles}
                signal={signal}
                settings={settings}
                signalHistory={signalHistory}
                pair={pair}
                timeframe={timeframe}
                onSettingsChange={handleSettingsChange}
                onHistoryUpdate={() => setSignalHistory(getSignalHistory())}
              />
            )}
          </div>
        </div>
      </main>

      {/* Desktop tab bar */}
      <div className="hidden lg:flex border-b border-[#1e2d45] bg-[#111827] sticky top-0 z-10 px-6 -mt-4 mb-4 order-first">
        {/* rendered inline in the sidebar layout above */}
      </div>

      {/* Mobile bottom navigation */}
      <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
    </div>
  );
}

// ── Tab Content Router ──────────────────────────────────────────────────────
interface TabContentProps {
  activeTab: TabId;
  candles: Candle[];
  signal: EngineOutput | null;
  settings: AppSettings;
  signalHistory: ReturnType<typeof getSignalHistory>;
  pair: ForexPair;
  timeframe: Timeframe;
  onSettingsChange: (s: AppSettings) => void;
  onHistoryUpdate: () => void;
}

function TabContent({
  activeTab, candles, signal, settings, signalHistory,
  pair, timeframe, onSettingsChange, onHistoryUpdate,
}: TabContentProps) {
  if (activeTab === "indicators" || activeTab === "overview") {
    return signal ? <IndicatorsPanel signal={signal} candles={candles} /> : null;
  }
  if (activeTab === "history") {
    return <SignalHistory history={signalHistory} onClear={onHistoryUpdate} />;
  }
  if (activeTab === "backtest") {
    return <BacktestPanel candles={candles} pair={pair} timeframe={timeframe} settings={settings} />;
  }
  if (activeTab === "settings") {
    return <SettingsPanel settings={settings} onSave={onSettingsChange} />;
  }
  return null;
}
