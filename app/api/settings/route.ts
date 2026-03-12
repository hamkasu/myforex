import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { prisma } from "@/lib/db/prisma";
import { DEFAULT_SETTINGS } from "@/types";
import type { AppSettings } from "@/types";
import type { Session } from "next-auth";

function requireUserId(session: Session | null): string | null {
  if (!session?.user) return null;
  return (session.user as any).id as string | null ?? null;
}

// GET /api/settings — return user settings (creates defaults if not exists)
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = requireUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await prisma.userSettings.upsert({
    where:  { userId },
    update: {},
    create: { userId },
  });

  // Map Prisma row → AppSettings
  const settings: AppSettings = {
    rsiOversold:                row.rsiOversold,
    rsiOverbought:              row.rsiOverbought,
    rsiMomentumLow:             row.rsiMomentumLow,
    rsiMomentumHigh:            row.rsiMomentumHigh,
    ema1Period:                 row.ema1Period,
    ema2Period:                 row.ema2Period,
    atrMultiplierSL:            row.atrMultiplierSL,
    atrMultiplierTP:            row.atrMultiplierTP,
    minConfidence:              row.minConfidence,
    trendWeight:                row.trendWeight,
    momentumWeight:             row.momentumWeight,
    breakoutWeight:             row.breakoutWeight,
    patternWeight:              row.patternWeight,
    volatilityThreshold:        row.volatilityThreshold,
    enableBrowserNotifications: row.enableBrowserNotifications,
    alertMinConfidence:         row.alertMinConfidence,
  };

  return NextResponse.json(settings);
}

// PUT /api/settings — update user settings
export async function PUT(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = requireUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body: Partial<AppSettings> = await req.json();

    await prisma.userSettings.upsert({
      where:  { userId },
      update: { ...body },
      create: { userId, ...DEFAULT_SETTINGS, ...body },
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("Save settings error:", err);
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}
