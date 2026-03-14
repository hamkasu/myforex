import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { getSubscriptionInfo, isSubscribed } from "@/lib/subscription";
import type { Session } from "next-auth";

function requireUserId(session: Session | null): string | null {
  if (!session?.user) return null;
  return (session.user as any).id as string | null ?? null;
}

// GET /api/subscription/status
export async function GET() {
  const session = await getServerSession(authOptions);
  const userId  = requireUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [subscribed, info] = await Promise.all([
    isSubscribed(userId),
    getSubscriptionInfo(userId),
  ]);

  return NextResponse.json({ subscribed, ...info });
}
