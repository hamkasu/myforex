"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { TrendingUp, Mail, Lock, User, Eye, EyeOff, AlertCircle } from "lucide-react";
import clsx from "clsx";

type Mode = "signin" | "register";

export default function AuthForm() {
  const router = useRouter();
  const [mode, setMode]       = useState<Mode>("signin");
  const [name, setName]       = useState("");
  const [email, setEmail]     = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === "register") {
        // Register first, then sign in
        const res = await fetch("/api/auth/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        const data = await res.json();
        if (!res.ok) {
          setError(data.error ?? "Registration failed");
          return;
        }
      }

      // Sign in
      const result = await signIn("credentials", {
        email,
        password,
        redirect: false,
      });

      if (result?.error) {
        setError("Invalid email or password");
        return;
      }

      router.push("/");
      router.refresh();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0e1a] flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center gap-2 mb-3">
            <div className="p-2 bg-blue-600 rounded-xl">
              <TrendingUp className="w-6 h-6 text-white" />
            </div>
            <span className="text-xl font-bold text-white">Forex Signal Analyzer</span>
          </div>
          <p className="text-slate-400 text-sm text-center">
            Rule-based technical analysis for EUR/USD &amp; GBP/JPY
          </p>
        </div>

        {/* Card */}
        <div className="bg-[#1a2235] rounded-2xl border border-[#1e2d45] p-6 shadow-2xl">
          {/* Mode toggle */}
          <div className="flex bg-[#0a0e1a] rounded-lg p-1 mb-6">
            {(["signin", "register"] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); }}
                className={clsx(
                  "flex-1 py-2 rounded-md text-sm font-medium transition-colors",
                  mode === m
                    ? "bg-blue-600 text-white"
                    : "text-slate-400 hover:text-white"
                )}
              >
                {m === "signin" ? "Sign In" : "Create Account"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Name — register only */}
            {mode === "register" && (
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Name (optional)</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-[#0a0e1a] border border-[#243450] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                  />
                </div>
              </div>
            )}

            {/* Email */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@example.com"
                  required
                  autoComplete="email"
                  className="w-full bg-[#0a0e1a] border border-[#243450] rounded-lg pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs text-slate-400 mb-1.5">
                Password{mode === "register" && " (min 8 chars)"}
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={mode === "register" ? 8 : 1}
                  autoComplete={mode === "register" ? "new-password" : "current-password"}
                  className="w-full bg-[#0a0e1a] border border-[#243450] rounded-lg pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-blue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
                  tabIndex={-1}
                >
                  {showPw ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 px-3 py-2 bg-red-600/20 border border-red-600/30 rounded-lg text-xs text-red-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                {error}
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-lg transition-colors text-sm"
            >
              {loading
                ? mode === "register" ? "Creating account…" : "Signing in…"
                : mode === "register" ? "Create Account" : "Sign In"}
            </button>
          </form>
        </div>

        <p className="text-xs text-slate-600 text-center mt-6">
          Educational tool only. Not financial advice.
        </p>
      </div>
    </div>
  );
}
