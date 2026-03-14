import { prisma } from "@/lib/db/prisma";

/** How long the free trial lasts after account creation */
export const TRIAL_DAYS = 7;

/**
 * Returns whether a user currently has access to the app.
 * Access is granted if:
 *  1. They are within the 7-day free trial window, OR
 *  2. They have an active (or Stripe-trialing) subscription.
 */
export async function isSubscribed(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { createdAt: true, subscriptionStatus: true, currentPeriodEnd: true },
  });
  if (!user) return false;

  // Free trial
  const trialEnd = new Date(user.createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  if (new Date() < trialEnd) return true;

  // Active Stripe subscription (also accept "trialing" managed by Stripe itself)
  const activeStatuses = ["active", "trialing"];
  if (user.subscriptionStatus && activeStatuses.includes(user.subscriptionStatus)) {
    // Double-check period hasn't lapsed (safety net)
    if (!user.currentPeriodEnd || user.currentPeriodEnd > new Date()) return true;
  }

  return false;
}

/** Returns trial info for display purposes */
export async function getSubscriptionInfo(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      createdAt: true,
      subscriptionStatus: true,
      currentPeriodEnd: true,
      stripeCustomerId: true,
    },
  });
  if (!user) return null;

  const trialEnd = new Date(user.createdAt.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  const now = new Date();
  const inTrial = now < trialEnd;
  const trialDaysLeft = inTrial
    ? Math.max(0, Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    : 0;

  return {
    inTrial,
    trialDaysLeft,
    trialEnd,
    subscriptionStatus: user.subscriptionStatus ?? null,
    currentPeriodEnd: user.currentPeriodEnd ?? null,
    hasStripeCustomer: !!user.stripeCustomerId,
  };
}
