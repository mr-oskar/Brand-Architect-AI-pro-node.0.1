"""
Payments Layer — STUB (not implemented).

This file documents the payment integration points and provides a clean
interface that routes can import when payments are added.

═══════════════════════════════════════════════════════
EXCLUDED FEATURES — documented for future implementation
═══════════════════════════════════════════════════════

1. STRIPE INTEGRATION
   ─────────────────
   Purpose: Allow users to purchase credit packs or subscribe to plans.

   How to implement:
     pip install stripe
     Set STRIPE_SECRET_KEY in env.
     Implement:
       - POST /api/payments/create-checkout-session  → Stripe Checkout
       - POST /api/payments/webhook                  → Stripe webhook handler
       - GET  /api/payments/portal                   → Stripe Customer Portal

   In this file, implement StripePaymentsLayer.purchase_credits()
   which calls credits_layer.add_credits() after successful payment.

   Key Stripe objects:
     - Customer: maps to User.id (store stripe_customer_id on User)
     - Price: maps to credit packs (e.g. 500 credits = $9.99)
     - Subscription: for monthly plans (store subscription_id on User)

2. REVENUECAT INTEGRATION (mobile)
   ────────────────────────────────
   Purpose: In-app purchases for iOS/Android apps built on top of this backend.

   How to implement:
     POST /api/payments/revenuecat-webhook → handle purchase events
     Verify RevenueCat JWT, then call credits_layer.add_credits().

3. SUBSCRIPTION TIERS
   ───────────────────
   Purpose: Replace per-action credits with monthly subscription plans.

   How to implement:
     Add subscription_tier column to users table (free | starter | pro | enterprise).
     Replace CreditsLayer with SubscriptionCreditsLayer that checks tier limits.
     Implement usage tracking per billing cycle.

4. INVOICES & RECEIPTS
   ─────────────────────
   Use Stripe's built-in invoice generation + webhook for email receipts.
   Store invoice records in a new invoices table for history.

═══════════════════════════════════════════════════════
To connect payments when ready:
  1. Implement the class below.
  2. Import and use it in the relevant routes.
  3. No other files need to change.
═══════════════════════════════════════════════════════
"""
from sqlalchemy.orm import Session


class PaymentsLayer:
    """
    STUB — implement this class to enable payments.

    All methods raise NotImplementedError until implemented.
    Routes that need payments should catch NotImplementedError and return 501.
    """

    def create_checkout_session(
        self,
        user_id: str,
        credit_pack_id: str,
        success_url: str,
        cancel_url: str,
    ) -> str:
        """
        Create a Stripe Checkout session for purchasing credits.
        Returns the checkout URL to redirect the user to.

        Implementation:
            import stripe
            stripe.api_key = os.getenv("STRIPE_SECRET_KEY")
            session = stripe.checkout.Session.create(...)
            return session.url
        """
        raise NotImplementedError(
            "Payment integration not configured. "
            "See app/layers/payments.py for implementation guide."
        )

    def handle_webhook(self, payload: bytes, signature: str, db: Session) -> dict:
        """
        Handle Stripe webhook events (payment.succeeded, subscription.*, etc.)
        Verifies the webhook signature and updates user credits/subscriptions.
        """
        raise NotImplementedError("Payment webhook not configured.")

    def get_customer_portal_url(self, user_id: str) -> str:
        """
        Create a Stripe Customer Portal session URL.
        Allows users to manage their subscriptions and payment methods.
        """
        raise NotImplementedError("Payment portal not configured.")


# Module-level singleton — replace with real implementation when ready
payments_layer = PaymentsLayer()
