"use client";

import { useState } from "react";
import type { AppSettings } from "@/types";
import { Bell, BellOff } from "lucide-react";
import {
  requestNotificationPermission,
  getNotificationPermission,
  isNotificationSupported,
} from "@/lib/pwa/notifications";
import clsx from "clsx";

interface AlertsPanelProps {
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
}

export default function AlertsPanel({ settings, onSettingsChange }: AlertsPanelProps) {
  const [permState, setPermState] = useState(getNotificationPermission);
  const [requesting, setRequesting] = useState(false);

  const handleToggle = async () => {
    if (!settings.enableBrowserNotifications) {
      // Enabling — request permission first
      if (permState !== "granted") {
        setRequesting(true);
        const granted = await requestNotificationPermission();
        setPermState(granted ? "granted" : "denied");
        setRequesting(false);
        if (!granted) return;
      }
    }
    onSettingsChange({
      ...settings,
      enableBrowserNotifications: !settings.enableBrowserNotifications,
    });
  };

  const isActive = settings.enableBrowserNotifications && permState === "granted";

  return (
    <div className="card">
      <div className="card-header">
        {isActive ? (
          <Bell className="w-4 h-4 text-blue-400" />
        ) : (
          <BellOff className="w-4 h-4 text-slate-500" />
        )}
        <span className="text-sm font-medium text-slate-300">Signal Alerts</span>
      </div>

      <div className="px-4 py-3 space-y-3">
        {/* In-app alert indicator */}
        <div className="flex items-center justify-between">
          <div>
            <div className="text-sm text-slate-300">In-App Alerts</div>
            <div className="text-xs text-slate-500">Always active when app is open</div>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <span className="text-xs text-green-400">Active</span>
          </div>
        </div>

        {/* Browser notification toggle */}
        {isNotificationSupported() && (
          <div className="flex items-center justify-between py-2 border-t border-[#1e2d45]">
            <div>
              <div className="text-sm text-slate-300">Browser Notifications</div>
              <div className="text-xs text-slate-500">
                {permState === "denied"
                  ? "Blocked — enable in browser settings"
                  : `Min confidence: ${settings.alertMinConfidence}%`}
              </div>
            </div>
            <button
              onClick={handleToggle}
              disabled={requesting || permState === "denied"}
              className={clsx(
                "relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-40",
                isActive ? "bg-blue-600" : "bg-[#1e2d45]"
              )}
            >
              <span
                className={clsx(
                  "inline-block h-4 w-4 transform rounded-full bg-white transition-transform",
                  isActive ? "translate-x-6" : "translate-x-1"
                )}
              />
            </button>
          </div>
        )}

        {/* Status */}
        <div className={clsx(
          "px-3 py-2 rounded-lg text-xs",
          isActive
            ? "bg-blue-600/20 border border-blue-600/30 text-blue-300"
            : "bg-[#0a0e1a] text-slate-500"
        )}>
          {isActive
            ? `✓ Notifying on signals with ≥${settings.alertMinConfidence}% confidence`
            : "Enable browser notifications to get alerted when away from the app."}
        </div>

        <p className="text-xs text-slate-600 italic">
          Telegram/email/push notification support can be added later.
        </p>
      </div>
    </div>
  );
}
