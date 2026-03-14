import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";
import type { Session } from "next-auth";

function requireUserId(session: Session | null): string | null {
  if (!session?.user) return null;
  return (session.user as any).id as string | null ?? null;
}

// POST /api/stripe/portal — redirect to Stripe Customer Portal
export async function POST() {
  const session = await getServerSession(authOptions);
  const userId  = requireUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { stripeCustomerId: true },
  });

  if (!user?.stripeCustomerId) {
    return NextResponse.json({ error: "No billing account found" }, { status: 400 });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const portalSession = await stripe.billingPortal.sessions.create({
    customer:   user.stripeCustomerId,
    return_url: `${appUrl}/`,
  });

  return NextResponse.json({ url: portalSession.url });
}
