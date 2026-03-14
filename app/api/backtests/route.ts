import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { isSubscribed } from "@/lib/subscription";
import type { BacktestResult } from "@/types";
import type { Session } from "next-auth";

async function requireAccess(session: Session | null): Promise<string | null> {
  if (!session?.user) return null;
  const userId = (session.user as any).id as string | undefined;
  if (!userId) return null;
  const ok = await isSubscribed(userId);
  return ok ? userId : null;
}

// GET /api/backtests — return user's 20 most recent backtest results
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = await requireAccess(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized or subscription required" }, { status: 401 });

  const rows = await prisma.backtestResult.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const results: Omit<BacktestResult, "trades">[] = rows.map((r) => ({
    pair:         r.pair as BacktestResult["pair"],
    timeframe:    r.timeframe as BacktestResult["timeframe"],
    totalTrades:  r.totalTrades,
    wins:         r.wins,
    losses:       r.losses,
    winRate:      r.winRate,
    averageRR:    r.averageRR,
    maxDrawdown:  r.maxDrawdown,
    profitFactor: r.profitFactor,
    totalR:       r.totalR,
    equityCurve:  r.equityCurve,
    calibration:  [],  // not persisted — recomputed client-side
    runAt:        Number(r.runAt),
    trades:       [],  // not persisted — too large
    // Quant fields not stored in DB — omit (optional in BacktestResult)
  }));

  return NextResponse.json(results);
}

// POST /api/backtests — save a backtest summary (trades array excluded)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = await requireAccess(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized or subscription required" }, { status: 401 });

  try {
    const body: BacktestResult = await req.json();

    await prisma.backtestResult.create({
      data: {
        userId,
        pair:         body.pair,
        timeframe:    body.timeframe,
        totalTrades:  body.totalTrades,
        wins:         body.wins,
        losses:       body.losses,
        winRate:      body.winRate,
        averageRR:    body.averageRR,
        maxDrawdown:  body.maxDrawdown,
        profitFactor: body.profitFactor,
        totalR:       body.totalR,
        equityCurve:  body.equityCurve,
        runAt:        BigInt(body.runAt),
      },
    });

    // Keep max 20 per user
    const total = await prisma.backtestResult.count({ where: { userId } });
    if (total > 20) {
      const oldest = await prisma.backtestResult.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: total - 20,
        select: { id: true },
      });
      await prisma.backtestResult.deleteMany({ where: { id: { in: oldest.map((r) => r.id) } } });
    }

    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    console.error("Save backtest error:", err);
    return NextResponse.json({ error: "Failed to save backtest" }, { status: 500 });
  }
}
