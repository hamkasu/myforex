import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth";
import { stripe, STRIPE_PRICES } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";
import type { Session } from "next-auth";

function requireUserId(session: Session | null): string | null {
  if (!session?.user) return null;
  return (session.user as any).id as string | null ?? null;
}

// POST /api/stripe/checkout  { plan: "monthly" | "yearly" }
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId  = requireUserId(session);
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { plan } = await req.json() as { plan: "monthly" | "yearly" };
  const priceId  = STRIPE_PRICES[plan];
  if (!priceId) return NextResponse.json({ error: "Invalid plan" }, { status: 400 });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  // Retrieve or create Stripe customer
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, name: true, stripeCustomerId: true },
  });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: user.email,
      name:  user.name ?? undefined,
      metadata: { userId },
    });
    customerId = customer.id;
    await prisma.user.update({ where: { id: userId }, data: { stripeCustomerId: customerId } });
  }

  const checkoutSession = await stripe.checkout.sessions.create({
    customer:             customerId,
    mode:                 "subscription",
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${appUrl}/?subscription=success`,
    cancel_url:  `${appUrl}/pricing?canceled=1`,
    metadata: { userId },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
