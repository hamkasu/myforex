import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { prisma } from "@/lib/db/prisma";
import type Stripe from "stripe";

// Stripe requires the raw body for signature verification — disable body parsing
export const config = { api: { bodyParser: false } };

async function upsertSubscription(sub: Stripe.Subscription) {
  // Find user by stripeCustomerId
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!user) {
    console.warn("[webhook] No user found for Stripe customer", customerId);
    return;
  }

  const periodEnd = new Date((sub as any).current_period_end * 1000);

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionId:     sub.id,
      subscriptionStatus: sub.status,
      currentPeriodEnd:   periodEnd,
    },
  });
}

async function cancelSubscription(sub: Stripe.Subscription) {
  const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
  const user = await prisma.user.findUnique({ where: { stripeCustomerId: customerId } });
  if (!user) return;

  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: sub.status, // "canceled"
      currentPeriodEnd:   new Date((sub as any).current_period_end * 1000),
    },
  });
}

export async function POST(req: NextRequest) {
  const payload = await req.text();
  const sig     = req.headers.get("stripe-signature") ?? "";

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(payload, sig, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (err: any) {
    console.error("[webhook] Signature verification failed:", err.message);
    return NextResponse.json({ error: `Webhook error: ${err.message}` }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "customer.subscription.created":
      case "customer.subscription.updated":
        await upsertSubscription(event.data.object as Stripe.Subscription);
        break;

      case "customer.subscription.deleted":
        await cancelSubscription(event.data.object as Stripe.Subscription);
        break;

      default:
        // Ignore unhandled events
        break;
    }
  } catch (err) {
    console.error("[webhook] Handler error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
