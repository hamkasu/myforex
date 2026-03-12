"use client";

import { WifiOff } from "lucide-react";

export default function OfflineBanner({ isOnline }: { isOnline: boolean }) {
  if (isOnline) return null;

  return (
    <div className="bg-yellow-600/90 text-yellow-100 text-sm flex items-center gap-2 px-4 py-2 sticky top-0 z-50">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>You are offline. Showing cached data and signal history.</span>
    </div>
  );
}
