import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import type { Session } from "next-auth";

function requireSession(session: Session | null): NextResponse | string {
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = (session.user as any).id as string | undefined;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return userId;
}

// GET /api/signals — return user's signal history (newest first, max 200)
export async function GET() {
  const session = await getServerSession(authOptions);
  const result = requireSession(session);
  if (result instanceof NextResponse) return result;
  const userId = result;

  const rows = await prisma.signal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Map DB rows → StoredSignal shape expected by the client
  const signals = rows.map((r) => ({
    id:           r.id,
    pair:         r.pair,
    timeframe:    r.timeframe,
    timestamp:    Number(r.timestamp),
    signal:       r.signal,
    confidence:   r.confidence,
    score:        r.score,
    reasons:      r.reasons,
    currentPrice: r.currentPrice,
    entry:        r.entry,
    stopLoss:     r.stopLoss,
    takeProfit:   r.takeProfit,
    riskReward:   r.riskReward,
    atrValue:     r.atrValue,
  }));

  return NextResponse.json(signals);
}

// POST /api/signals — save a new signal
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const result = requireSession(session);
  if (result instanceof NextResponse) return result;
  const userId = result;

  try {
    const body = await req.json();

    const signal = await prisma.signal.create({
      data: {
        userId,
        pair:         body.pair,
        timeframe:    body.timeframe,
        timestamp:    BigInt(body.timestamp),
        signal:       body.signal,
        confidence:   body.confidence,
        score:        body.score,
        reasons:      body.reasons ?? [],
        currentPrice: body.currentPrice,
        entry:        body.entry,
        stopLoss:     body.stopLoss,
        takeProfit:   body.takeProfit,
        riskReward:   body.riskReward,
        atrValue:     body.atrValue ?? 0,
      },
    });

    // Keep max 200 per user: prune oldest beyond 200
    const total = await prisma.signal.count({ where: { userId } });
    if (total > 200) {
      const oldest = await prisma.signal.findMany({
        where: { userId },
        orderBy: { createdAt: "asc" },
        take: total - 200,
        select: { id: true },
      });
      await prisma.signal.deleteMany({ where: { id: { in: oldest.map((s) => s.id) } } });
    }

    return NextResponse.json({ id: signal.id }, { status: 201 });
  } catch (err) {
    console.error("Save signal error:", err);
    return NextResponse.json({ error: "Failed to save signal" }, { status: 500 });
  }
}

// DELETE /api/signals — clear all user's signals
export async function DELETE() {
  const session = await getServerSession(authOptions);
  const result = requireSession(session);
  if (result instanceof NextResponse) return result;
  const userId = result;

  await prisma.signal.deleteMany({ where: { userId } });
  return NextResponse.json({ ok: true });
}
