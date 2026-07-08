"""One-off migration: recompute `pay_later_amount` for bookings that were hit
by the double-discount bug in `/payments/checkout-setup` (Feb 2026).

Signature of an affected booking:
  - quote_amount + discount_amount ≈ original_quote_amount   (locked-in booking)
  - pay_later_amount < quote_amount * 0.95                  (over-discounted)

Fix: set pay_later_amount = quote_amount (already post-discount).

USAGE (from repo root):
    python -m backend.migrations.fix_double_discount_pay_later --dry-run
    python -m backend.migrations.fix_double_discount_pay_later --apply

The --dry-run flag lists impacted bookings without touching the DB.
The --apply flag updates them and stores the previous value under
`pay_later_amount_pre_migration` for audit.
"""
from __future__ import annotations

import argparse
import asyncio
import os
import sys
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient


def _mongo_url() -> str:
    url = os.environ.get("MONGO_URL")
    if not url:
        print("ERROR: MONGO_URL is not set.", file=sys.stderr)
        sys.exit(1)
    return url


def _db_name() -> str:
    name = os.environ.get("DB_NAME")
    if not name:
        print("ERROR: DB_NAME is not set.", file=sys.stderr)
        sys.exit(1)
    return name


async def find_affected(db):
    """Yield bookings that need repair."""
    cursor = db.bookings.find({
        "pay_later_amount": {"$gt": 0},
        "quote_amount": {"$gt": 0},
        "discount_amount": {"$gt": 0},
        "original_quote_amount": {"$gt": 0},
    }, {
        "_id": 0,
        "id": 1,
        "email": 1,
        "confirmation_number": 1,
        "created_at": 1,
        "payment_status": 1,
        "payment_mode": 1,
        "quote_amount": 1,
        "original_quote_amount": 1,
        "discount_amount": 1,
        "pay_later_amount": 1,
    })
    async for b in cursor:
        qa = float(b.get("quote_amount") or 0)
        oqa = float(b.get("original_quote_amount") or 0)
        da = float(b.get("discount_amount") or 0)
        pla = float(b.get("pay_later_amount") or 0)
        is_locked_in = abs(qa + da - oqa) < 1.0
        # Locked-in bookings should have pay_later_amount == quote_amount
        # (post-discount). If pay_later_amount is materially less, it got
        # double-discounted.
        if is_locked_in and pla > 0 and pla < qa * 0.95:
            yield b


async def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", default=False)
    ap.add_argument("--apply", action="store_true", default=False)
    args = ap.parse_args()
    if not (args.dry_run or args.apply):
        print("Pick one: --dry-run OR --apply")
        sys.exit(2)

    client = AsyncIOMotorClient(_mongo_url())
    db = client[_db_name()]

    affected = []
    async for b in find_affected(db):
        affected.append(b)

    print(f"\nFound {len(affected)} bookings with double-discount pay_later_amount:\n")
    for b in affected:
        qa = float(b.get("quote_amount") or 0)
        pla = float(b.get("pay_later_amount") or 0)
        print(
            f"  id={b['id']}  cn={b.get('confirmation_number')}  "
            f"email={b.get('email')}  status={b.get('payment_status')}  "
            f"was=${pla:.2f} → should=${qa:.2f}  "
            f"created={b.get('created_at')}"
        )

    if not args.apply or not affected:
        print("\n(no changes written)")
        return

    now_iso = datetime.now(timezone.utc).isoformat()
    fixed = 0
    for b in affected:
        qa = float(b.get("quote_amount") or 0)
        old = float(b.get("pay_later_amount") or 0)
        await db.bookings.update_one(
            {"id": b["id"]},
            {"$set": {
                "pay_later_amount": qa,
                "pay_later_amount_pre_migration": old,
                "pay_later_amount_migrated_at": now_iso,
            }},
        )
        fixed += 1
    print(f"\n✓ Updated {fixed} bookings. Old pay_later_amount stored under `pay_later_amount_pre_migration`.")


if __name__ == "__main__":
    asyncio.run(main())
