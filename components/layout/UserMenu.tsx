"use client";

import { useState, useRef, useEffect } from "react";
import { signOut, useSession } from "next-auth/react";
import { LogOut, User, ChevronDown } from "lucide-react";
import clsx from "clsx";

export default function UserMenu() {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  if (!session?.user) return null;

  const initials = session.user.name
    ? session.user.name.slice(0, 2).toUpperCase()
    : session.user.email?.slice(0, 2).toUpperCase() ?? "??";

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-lg hover:bg-[#1a2235] transition-colors"
        aria-label="User menu"
      >
        {/* Avatar */}
        <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center text-xs font-bold text-white">
          {initials}
        </div>
        <ChevronDown className={clsx("w-3.5 h-3.5 text-slate-400 transition-transform", open && "rotate-180")} />
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute right-0 top-full mt-1 w-52 bg-[#1a2235] border border-[#1e2d45] rounded-xl shadow-2xl z-50 py-1">
          {/* User info */}
          <div className="px-3 py-2.5 border-b border-[#1e2d45]">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-slate-400 shrink-0" />
              <div className="min-w-0">
                {session.user.name && (
                  <div className="text-sm font-medium text-white truncate">{session.user.name}</div>
                )}
                <div className="text-xs text-slate-400 truncate">{session.user.email}</div>
              </div>
            </div>
          </div>

          {/* Sync status */}
          <div className="px-3 py-2 border-b border-[#1e2d45]">
            <div className="flex items-center gap-1.5 text-xs text-green-400">
              <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
              Cloud sync active
            </div>
          </div>

          {/* Sign out */}
          <button
            onClick={() => signOut({ callbackUrl: "/auth" })}
            className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-slate-300 hover:bg-[#0a0e1a] hover:text-red-400 transition-colors"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      )}
    </div>
  );
}
