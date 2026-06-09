"""Refer-a-Friend helpers — isolated from server.py so booking flows stay clean.

Mechanics
---------
- Every customer gets a unique short `referral_code` at signup (or lazily on
  first access for legacy customers).
- A new customer signing up may pass `referred_by_code` — we resolve it to a
  `referred_by` customer id and persist it on the new customer doc.
- When that referred customer completes their FIRST paid ride, we create a
  one-time $25-off promo for the REFERRER and email it to them. We track the
  payout so the same referral can never trigger twice.
"""

from __future__ import annotations

import random
import string
from datetime import datetime, timezone
from typing import Optional


REFERRAL_PROMO_AMOUNT_USD = 25.0  # Flat amount the referrer earns per friend who completes a ride
REFERRED_FRIEND_PROMO_AMOUNT_USD = 20.0  # Discount the new friend gets at signup (uses WELCOME20)
REFERRAL_CODE_PREFIX = "REF"
REFERRAL_CODE_LEN = 6  # e.g. REF-XK7Q2P


def _generate_code() -> str:
    """Short, friendly, non-confusing referral code: REF-XK7Q2P (no 0/O/1/I)."""
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    return f"{REFERRAL_CODE_PREFIX}-{''.join(random.choices(alphabet, k=REFERRAL_CODE_LEN))}"


async def ensure_referral_code(db, customer_id: str) -> str:
    """Returns the customer's referral code, generating + persisting one if missing.
    Idempotent: safe to call multiple times.
    """
    doc = await db.customers.find_one(
        {"id": customer_id}, {"_id": 0, "referral_code": 1}
    )
    if doc is None:
        raise ValueError(f"customer {customer_id} not found")
    existing = doc.get("referral_code")
    if existing:
        return existing

    # Generate a unique code (retry a few times in the astronomically unlikely
    # event of collision — 32^6 = ~1 billion combinations).
    for _ in range(8):
        code = _generate_code()
        clash = await db.customers.find_one({"referral_code": code}, {"_id": 0, "id": 1})
        if not clash:
            await db.customers.update_one(
                {"id": customer_id}, {"$set": {"referral_code": code}}
            )
            return code
    raise RuntimeError("Failed to generate a unique referral code after 8 attempts")


async def resolve_referrer(db, referred_by_code: Optional[str]) -> Optional[str]:
    """Looks up a referrer customer id by their referral code.
    Returns None when the code is missing, invalid, or doesn't match anyone.
    """
    if not referred_by_code:
        return None
    code = referred_by_code.strip().upper()
    if not code:
        return None
    referrer = await db.customers.find_one(
        {"referral_code": code}, {"_id": 0, "id": 1}
    )
    return referrer.get("id") if referrer else None


async def referral_summary(db, customer_id: str) -> dict:
    """Per-customer referral stats for the My Referrals page."""
    code = await ensure_referral_code(db, customer_id)
    # Friends who signed up with this referrer's code
    referred = await db.customers.find(
        {"referred_by": customer_id}, {"_id": 0, "id": 1, "name": 1, "created_at": 1}
    ).to_list(500)
    # Of those friends, how many have a completed paid ride?
    completed_count = 0
    if referred:
        friend_ids = [r["id"] for r in referred]
        completed_count = await db.bookings.count_documents({
            "customer_id": {"$in": friend_ids},
            "status": "completed",
            "payment_status": "paid",
        })
    # Sum of payouts already issued
    payouts = await db.referral_payouts.find(
        {"referrer_id": customer_id}, {"_id": 0}
    ).to_list(500)
    total_earned = sum((p.get("amount") or 0) for p in payouts)
    return {
        "referral_code": code,
        "share_url": "",  # caller appends frontend origin
        "friend_signups": len(referred),
        "completed_first_rides": completed_count,
        "total_earned_usd": round(total_earned, 2),
        "payout_count": len(payouts),
        "friends": [
            {
                "name": (r.get("name") or "Friend").split(" ")[0],
                "joined_at": r.get("created_at"),
            }
            for r in referred[:20]
        ],
        "recent_payouts": [
            {
                "amount": p.get("amount"),
                "promo_code": p.get("promo_code"),
                "issued_at": p.get("issued_at"),
            }
            for p in sorted(payouts, key=lambda x: x.get("issued_at") or "", reverse=True)[:10]
        ],
    }


async def maybe_reward_referrer_on_first_completed_ride(db, customer_id: str) -> Optional[dict]:
    """Called after a booking is marked completed + paid.

    If the customer was referred AND this is their first completed paid ride
    AND no payout has been issued yet for this referral pair → create a
    one-time $25-off promo for the REFERRER and record the payout.

    Returns the payout dict on success, None otherwise (idempotent — calling
    twice for the same friend is a no-op).
    """
    customer = await db.customers.find_one(
        {"id": customer_id}, {"_id": 0, "referred_by": 1, "email": 1, "name": 1}
    )
    if not customer:
        return None
    referrer_id = customer.get("referred_by")
    if not referrer_id:
        return None

    # Idempotency: only reward once per (referrer, friend) pair
    already = await db.referral_payouts.find_one(
        {"referrer_id": referrer_id, "friend_id": customer_id}, {"_id": 0, "id": 1}
    )
    if already:
        return None

    # First-ride check — only reward on the FIRST completed paid ride for this friend.
    completed_count = await db.bookings.count_documents({
        "customer_id": customer_id,
        "status": "completed",
        "payment_status": "paid",
    })
    if completed_count < 1:
        return None

    # Create a single-use promo for the referrer
    referrer = await db.customers.find_one(
        {"id": referrer_id}, {"_id": 0, "id": 1, "email": 1, "name": 1}
    )
    if not referrer:
        return None

    promo_code = f"THANKS-{''.join(random.choices('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', k=6))}"
    now = datetime.now(timezone.utc)
    promo_doc = {
        "id": _new_id(),
        "code": promo_code,
        "description": f"Thanks for referring {(customer.get('name') or 'a friend').split(' ')[0]}!",
        "discount_type": "fixed",
        "value": REFERRAL_PROMO_AMOUNT_USD,
        "min_ride_amount": 0.0,
        "max_uses": 1,
        "expires_at": None,
        "first_ride_only": False,
        "active": True,
        "show_on_banner": False,
        "allowed_vehicle_types": [],
        "uses": 0,
        "total_discount_given": 0.0,
        "created_at": now.isoformat(),
        "issued_to_customer_id": referrer_id,
        "source": "referral_reward",
    }
    await db.promos.insert_one(promo_doc)

    payout = {
        "id": _new_id(),
        "referrer_id": referrer_id,
        "friend_id": customer_id,
        "amount": REFERRAL_PROMO_AMOUNT_USD,
        "promo_code": promo_code,
        "issued_at": now.isoformat(),
    }
    await db.referral_payouts.insert_one(payout)
    # Strip the _id Motor inserts on the dict — we never want to leak BSON.
    payout.pop("_id", None)
    payout["referrer_email"] = referrer.get("email")
    payout["referrer_name"] = referrer.get("name")
    payout["friend_name"] = customer.get("name")
    return payout


def _new_id() -> str:
    import uuid
    return str(uuid.uuid4())
