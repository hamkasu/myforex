import Stripe from "stripe";

// Lazy singleton — instantiated on first use, not at module import time.
// This prevents build failures when STRIPE_SECRET_KEY is not set in the
// build environment (Next.js collects page data at build time).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!process.env.STRIPE_SECRET_KEY) {
      throw new Error("STRIPE_SECRET_KEY environment variable is not set");
    }
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: "2026-02-25.clover",
    });
  }
  return _stripe;
}

/** Convenience re-export for callers that use `stripe.xyz` directly */
export const stripe = new Proxy({} as Stripe, {
  get(_target, prop) {
    return (getStripe() as any)[prop];
  },
});

export const STRIPE_PRICES = {
  monthly: process.env.STRIPE_PRICE_MONTHLY!,
  yearly:  process.env.STRIPE_PRICE_YEARLY!,
} as const;
