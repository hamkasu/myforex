"use client";

import {
  LayoutDashboard, Activity, History, TestTube2, Settings,
} from "lucide-react";
import type { TabId } from "@/types";
import clsx from "clsx";

const TABS: { id: TabId; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: "overview",    label: "Overview",    icon: LayoutDashboard },
  { id: "indicators",  label: "Indicators",  icon: Activity },
  { id: "history",     label: "History",     icon: History },
  { id: "backtest",    label: "Backtest",    icon: TestTube2 },
  { id: "settings",    label: "Settings",    icon: Settings },
];

export default function DesktopTabs({
  activeTab,
  onTabChange,
}: {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}) {
  return (
    <div className="hidden lg:flex items-center gap-1 bg-[#111827] rounded-xl p-1 border border-[#1e2d45]">
      {TABS.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={clsx(
            "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex-1 justify-center",
            activeTab === id
              ? "bg-blue-600 text-white"
              : "text-slate-400 hover:text-slate-200 hover:bg-[#1e2d45]"
          )}
        >
          <Icon className="w-3.5 h-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}
