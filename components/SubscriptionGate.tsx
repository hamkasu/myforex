"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { TrendingUp } from "lucide-react";

interface SubStatus {
  subscribed: boolean;
  inTrial: boolean;
  trialDaysLeft: number;
  subscriptionStatus: string | null;
  currentPeriodEnd: string | null;
}

/**
 * Fetches the user's subscription status and either:
 *  - Renders children if subscribed / in trial
 *  - Redirects to /pricing if the trial has expired and no active subscription
 */
export default function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<SubStatus | null>(null);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    fetch("/api/subscription/status")
      .then((r) => r.json())
      .then((data: SubStatus) => {
        setStatus(data);
        setChecked(true);
        if (!data.subscribed) {
          router.replace("/pricing");
        }
      })
      .catch(() => {
        // On network error, allow access (fail-open — avoid locking out users on transient errors)
        setChecked(true);
      });
  }, [router]);

  // Show a minimal loading state while checking
  if (!checked) {
    return (
      <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <TrendingUp size={18} className="animate-pulse text-blue-400" />
          <span className="text-sm">Loading…</span>
        </div>
      </div>
    );
  }

  if (!status?.subscribed) return null; // redirect pending

  return (
    <>
      {/* Trial notice banner */}
      {status.inTrial && status.trialDaysLeft <= 3 && (
        <div className="w-full bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-2 text-center text-xs text-yellow-300">
          Free trial ends in{" "}
          <span className="font-semibold">
            {status.trialDaysLeft} day{status.trialDaysLeft !== 1 ? "s" : ""}
          </span>
          .{" "}
          <a href="/pricing" className="underline hover:text-yellow-200 transition-colors">
            Subscribe to keep access
          </a>
        </div>
      )}
      {children}
    </>
  );
}
