"use client";

import {
  LayoutDashboard, Activity, History, TestTube2, Settings,
} from "lucide-react";
import type { TabId } from "@/types";
import clsx from "clsx";

interface NavItem {
  id: TabId;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const NAV_ITEMS: NavItem[] = [
  { id: "overview",    label: "Overview",  icon: LayoutDashboard },
  { id: "indicators", label: "Indicators", icon: Activity },
  { id: "history",    label: "History",    icon: History },
  { id: "backtest",   label: "Backtest",   icon: TestTube2 },
  { id: "settings",  label: "Settings",   icon: Settings },
];

interface BottomNavProps {
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
}

export default function BottomNav({ activeTab, onTabChange }: BottomNavProps) {
  return (
    <nav
      className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#111827]/95 backdrop-blur border-t border-[#1e2d45]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="flex items-center justify-around px-2 py-1">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => onTabChange(id)}
            className={clsx(
              "bottom-nav-item",
              activeTab === id
                ? "text-blue-400"
                : "text-slate-500 hover:text-slate-300"
            )}
          >
            <Icon className="w-5 h-5" />
            <span>{label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
