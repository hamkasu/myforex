import type { SignalResult } from "@/types";

export async function requestNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;

  const result = await Notification.requestPermission();
  return result === "granted";
}

export function sendBrowserNotification(signal: SignalResult): void {
  if (!("Notification" in window) || Notification.permission !== "granted") return;

  const emoji = signal.signal.includes("BUY") ? "📈" : signal.signal.includes("SELL") ? "📉" : "⏸️";
  const title = `${emoji} ${signal.signal} — ${signal.pair}`;
  const body = `Confidence: ${signal.confidence}% | Price: ${signal.currentPrice.toFixed(5)} | TF: ${signal.timeframe}`;

  try {
    new Notification(title, {
      body,
      icon: "/icons/icon-192x192.png",
      tag: `forex-signal-${signal.pair}-${signal.timeframe}`,
      requireInteraction: false,
    });
  } catch {
    // Notification may fail silently in some environments
  }
}

export function isNotificationSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function getNotificationPermission(): NotificationPermission | "unsupported" {
  if (!isNotificationSupported()) return "unsupported";
  return Notification.permission;
}
