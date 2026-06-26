"""
Affiliate (partner operator) network for TuranEliteLimo.

Lets the admin store a Rolodex of out-of-territory limo operators
(Sacramento, Tahoe, Monterey, etc.) so when a quote request comes in for
an area we don't cover, we can broker the trip:

  Customer pays us → we pay the affiliate → we keep the markup.

Routes mounted in server.py via `include_router(affiliates_router)`.
"""

from __future__ import annotations

import csv
import io
import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, Field

router = APIRouter(prefix="/admin/affiliates", tags=["affiliates"])


# ----- standardized service regions (used by chips & suggestion engine) ----
# Each region maps to a list of substrings (lowercase) we look for in the
# pickup/dropoff free-text. Order matters — first match wins.
REGION_KEYWORDS: dict[str, list[str]] = {
    "Bay Area": [
        "san francisco", "sfo", " sf,", " sf ", "oakland", "berkeley", "san mateo",
        "burlingame", "south sf", "south san francisco", "daly city", "san bruno",
        "palo alto", "menlo park", "redwood city", "mountain view", "sunnyvale",
        "san jose", "sjc", "santa clara", "milpitas", "cupertino", "fremont",
        "hayward", "san leandro", "alameda", "richmond", "el cerrito", "albany",
        "marin", "sausalito", "san rafael", "novato", "tiburon",
        "walnut creek", "concord", "pleasanton", "dublin", "livermore",
        "half moon bay", "pacifica",
    ],
    "Wine Country": [
        "napa", "sonoma", "yountville", "st. helena", "st helena", "calistoga",
        "rutherford", "healdsburg", "windsor, ca", "kenwood", "glen ellen",
    ],
    "Sacramento": [
        "sacramento", "elk grove", "rancho cordova", "folsom", "el dorado hills",
        "roseville", "rocklin", "lincoln, ca", "auburn", "granite bay",
        "citrus heights", "carmichael", "fair oaks", "orangevale", "antelope",
        "natomas", "north highlands", "smf",
    ],
    "Tahoe / Reno": [
        "lake tahoe", "south lake tahoe", "tahoe city", "kings beach", "incline village",
        "truckee", "northstar", "heavenly", "squaw valley", "olympic valley",
        "alpine meadows", "reno, nv", "sparks, nv",
    ],
    "Monterey / Carmel": [
        "monterey", "carmel", "pebble beach", "pacific grove", "salinas",
        "big sur", "carmel valley", "marina, ca", "seaside, ca",
    ],
    "Central Valley": [
        "stockton", "modesto", "tracy, ca", "manteca", "lodi, ca", "merced",
        "fresno", "turlock", "ceres,",
    ],
}

REGIONS: list[str] = list(REGION_KEYWORDS.keys())


def detect_region(*texts: str) -> Optional[str]:
    """Given one or more pickup/dropoff strings, return the first matching
    region name. Returns None if nothing matches."""
    blob = " ".join((t or "").lower() for t in texts if t)
    if not blob.strip():
        return None
    for region, keywords in REGION_KEYWORDS.items():
        for kw in keywords:
            # Word-boundary or substring (substring is fine — keywords are specific)
            if kw in blob:
                return region
    return None


# ----- models ---------------------------------------------------------------

class AffiliateBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)  # company name (DBA)
    contact_name: Optional[str] = Field(None, max_length=80)
    phone: Optional[str] = Field(None, max_length=30)
    email: Optional[EmailStr] = None
    city: Optional[str] = Field(None, max_length=80)
    service_areas: List[str] = Field(default_factory=list)  # ["Sacramento", "Tahoe"]
    vehicle_types: List[str] = Field(default_factory=list)  # ["Sedan", "Sprinter"]
    tcp_number: Optional[str] = Field(None, max_length=40)
    insurance_expiry: Optional[str] = None  # ISO date
    base_sprinter_rate: Optional[float] = Field(None, ge=0)  # NET to us, per ride
    base_sedan_rate: Optional[float] = Field(None, ge=0)
    base_suv_rate: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=2000)
    active: bool = True
    # ---- 1099 / tax fields (optional; required only when issuing 1099) ----
    legal_name: Optional[str] = Field(None, max_length=120)   # legal name on W-9
    tax_id: Optional[str] = Field(None, max_length=20)        # EIN or SSN, stored as-typed
    tax_classification: Optional[str] = Field(None, max_length=40)
    # one of: Individual/Sole Prop, Single-Member LLC, LLC-C, LLC-S, LLC-P, C-Corp, S-Corp, Partnership, Other
    w9_received: bool = False
    mailing_address: Optional[str] = Field(None, max_length=300)


class AffiliateCreate(AffiliateBase):
    pass


class AffiliateUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    contact_name: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[EmailStr] = None
    city: Optional[str] = None
    service_areas: Optional[List[str]] = None
    vehicle_types: Optional[List[str]] = None
    tcp_number: Optional[str] = None
    insurance_expiry: Optional[str] = None
    base_sprinter_rate: Optional[float] = Field(None, ge=0)
    base_sedan_rate: Optional[float] = Field(None, ge=0)
    base_suv_rate: Optional[float] = Field(None, ge=0)
    notes: Optional[str] = None
    active: Optional[bool] = None
    legal_name: Optional[str] = None
    tax_id: Optional[str] = None
    tax_classification: Optional[str] = None
    w9_received: Optional[bool] = None
    mailing_address: Optional[str] = None


class Affiliate(AffiliateBase):
    id: str
    created_at: str
    updated_at: str
    # roll-up stats — populated by the list endpoint, not stored
    rides_total: int = 0
    profit_total: float = 0.0
    paid_ytd: float = 0.0  # sum of affiliate_payments in current calendar year


class AffiliateAssignmentRequest(BaseModel):
    """Used to attach an affiliate to a specific booking + record the cost."""
    affiliate_id: str
    affiliate_cost: float = Field(..., ge=0)  # what we pay them
    notes: Optional[str] = Field(None, max_length=2000)


# ----- Payments (Zelle / Venmo / Check etc. paid TO an affiliate) -----------

PAYMENT_METHODS = ["Zelle", "Venmo", "Check", "Cash", "ACH", "Wire", "PayPal", "Other"]


class AffiliatePaymentBase(BaseModel):
    affiliate_id: str
    amount: float = Field(..., gt=0)
    payment_date: str = Field(..., description="ISO date YYYY-MM-DD")
    method: str = Field(..., max_length=40)  # one of PAYMENT_METHODS
    reference: Optional[str] = Field(None, max_length=120)  # confirmation #
    booking_id: Optional[str] = Field(None, max_length=80)
    booking_label: Optional[str] = Field(None, max_length=240)
    notes: Optional[str] = Field(None, max_length=2000)


class AffiliatePaymentCreate(AffiliatePaymentBase):
    pass


class AffiliatePaymentUpdate(BaseModel):
    amount: Optional[float] = Field(None, gt=0)
    payment_date: Optional[str] = None
    method: Optional[str] = None
    reference: Optional[str] = None
    booking_id: Optional[str] = None
    booking_label: Optional[str] = None
    notes: Optional[str] = None


class AffiliatePayment(AffiliatePaymentBase):
    id: str
    affiliate_name: str  # snapshot at time of payment
    created_at: str
    updated_at: str
    created_by: Optional[str] = None


# ----- helpers --------------------------------------------------------------

def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


async def _aff_stats(db, affiliate_id: str) -> dict:
    """Aggregate ride count + profit from bookings that reference this affiliate."""
    rides = 0
    profit = 0.0
    async for b in db.bookings.find(
        {"affiliate.id": affiliate_id},
        {"_id": 0, "affiliate": 1, "quote_amount": 1},
    ):
        rides += 1
        aff = b.get("affiliate") or {}
        cost = float(aff.get("cost") or 0)
        charge = float(b.get("quote_amount") or 0)
        profit += max(0.0, charge - cost)
    return {"rides_total": rides, "profit_total": round(profit, 2)}


async def _paid_ytd(db, affiliate_id: str, year: Optional[int] = None) -> float:
    """Sum of affiliate_payments for the given calendar year (defaults to current)."""
    y = year or datetime.now(timezone.utc).year
    start = f"{y}-01-01"
    end = f"{y}-12-31"
    total = 0.0
    async for p in db.affiliate_payments.find(
        {
            "affiliate_id": affiliate_id,
            "payment_date": {"$gte": start, "$lte": end},
        },
        {"_id": 0, "amount": 1},
    ):
        total += float(p.get("amount") or 0)
    return round(total, 2)


# ----- routes ---------------------------------------------------------------
# NOTE: All routes live inside `_build_router()` below so they can use
# `Depends(require_admin)` (resolved from server module at import time).
# IMPORTANT: payment routes (/payments, /payments/{id}, etc.) are registered
# BEFORE the dynamic /{affiliate_id} routes so PATCH /payments/{id} reaches
# the payments handler — not the affiliate update handler.


def _build_router():
    """Build the actual router with auth dependencies — registered on import."""
    from server import db, require_admin  # safe at module-load order

    r = APIRouter(prefix="/admin/affiliates", tags=["affiliates"])

    @r.get("", response_model=List[Affiliate])
    async def list_affiliates(include_inactive: bool = False, _=Depends(require_admin)):
        query = {} if include_inactive else {"active": True}
        items: List[Affiliate] = []
        async for doc in db.affiliates.find(query, {"_id": 0}).sort("name", 1):
            stats = await _aff_stats(db, doc["id"])
            paid_ytd = await _paid_ytd(db, doc["id"])
            items.append(Affiliate(**doc, **stats, paid_ytd=paid_ytd))
        return items

    @r.post("", response_model=Affiliate)
    async def create_affiliate(payload: AffiliateCreate, _=Depends(require_admin)):
        aid = str(uuid.uuid4())
        now = _now_iso()
        doc = {**payload.model_dump(), "id": aid, "created_at": now, "updated_at": now}
        await db.affiliates.insert_one(dict(doc))
        return Affiliate(**doc, rides_total=0, profit_total=0.0, paid_ytd=0.0)

    # ----- PAYMENTS (must be registered before /{affiliate_id} dynamic routes) -----

    @r.get("/payments", response_model=List[AffiliatePayment])
    async def list_payments(
        year: Optional[int] = Query(None, ge=2000, le=2100),
        affiliate_id: Optional[str] = None,
        method: Optional[str] = None,
        _=Depends(require_admin),
    ):
        query: dict = {}
        if year:
            query["payment_date"] = {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}
        if affiliate_id:
            query["affiliate_id"] = affiliate_id
        if method:
            query["method"] = method
        items: List[AffiliatePayment] = []
        async for doc in db.affiliate_payments.find(query, {"_id": 0}).sort("payment_date", -1):
            items.append(AffiliatePayment(**doc))
        return items

    @r.post("/payments", response_model=AffiliatePayment)
    async def create_payment(payload: AffiliatePaymentCreate, admin=Depends(require_admin)):
        if payload.method not in PAYMENT_METHODS:
            raise HTTPException(
                status_code=400,
                detail=f"method must be one of {PAYMENT_METHODS}",
            )
        try:
            datetime.strptime(payload.payment_date, "%Y-%m-%d")
        except ValueError:
            raise HTTPException(status_code=400, detail="payment_date must be YYYY-MM-DD")

        aff = await db.affiliates.find_one(
            {"id": payload.affiliate_id},
            {"_id": 0, "id": 1, "name": 1},
        )
        if not aff:
            raise HTTPException(status_code=404, detail="Affiliate not found")

        pid = str(uuid.uuid4())
        now = _now_iso()
        created_by = (admin.get("sub") or admin.get("email")) if isinstance(admin, dict) else None
        doc = {
            **payload.model_dump(),
            "id": pid,
            "affiliate_name": aff["name"],
            "created_at": now,
            "updated_at": now,
            "created_by": created_by,
        }
        await db.affiliate_payments.insert_one(dict(doc))
        return AffiliatePayment(**doc)

    @r.patch("/payments/{payment_id}", response_model=AffiliatePayment)
    async def update_payment(
        payment_id: str,
        payload: AffiliatePaymentUpdate,
        _=Depends(require_admin),
    ):
        update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not update:
            raise HTTPException(status_code=400, detail="No fields to update")
        if "method" in update and update["method"] not in PAYMENT_METHODS:
            raise HTTPException(status_code=400, detail=f"method must be one of {PAYMENT_METHODS}")
        if "payment_date" in update:
            try:
                datetime.strptime(update["payment_date"], "%Y-%m-%d")
            except ValueError:
                raise HTTPException(status_code=400, detail="payment_date must be YYYY-MM-DD")
        update["updated_at"] = _now_iso()
        result = await db.affiliate_payments.update_one({"id": payment_id}, {"$set": update})
        if not result.matched_count:
            raise HTTPException(status_code=404, detail="Payment not found")
        doc = await db.affiliate_payments.find_one({"id": payment_id}, {"_id": 0})
        return AffiliatePayment(**doc)

    @r.delete("/payments/{payment_id}")
    async def delete_payment(payment_id: str, _=Depends(require_admin)):
        result = await db.affiliate_payments.delete_one({"id": payment_id})
        if not result.deleted_count:
            raise HTTPException(status_code=404, detail="Payment not found")
        return {"ok": True}

    @r.get("/payments/summary")
    async def payments_summary(
        year: Optional[int] = Query(None, ge=2000, le=2100),
        _=Depends(require_admin),
    ):
        """Per-affiliate roll-up for the given year — used by the Payments tab cards."""
        y = year or datetime.now(timezone.utc).year
        start = f"{y}-01-01"
        end = f"{y}-12-31"
        totals: dict[str, dict] = {}
        async for p in db.affiliate_payments.find(
            {"payment_date": {"$gte": start, "$lte": end}},
            {"_id": 0},
        ):
            aid = p["affiliate_id"]
            slot = totals.setdefault(
                aid,
                {
                    "affiliate_id": aid,
                    "affiliate_name": p.get("affiliate_name") or "",
                    "total": 0.0,
                    "count": 0,
                },
            )
            slot["total"] += float(p.get("amount") or 0)
            slot["count"] += 1
        # Round amounts
        rows = []
        for a in totals.values():
            a["total"] = round(a["total"], 2)
            rows.append(a)
        rows.sort(key=lambda x: x["total"], reverse=True)
        grand_total = round(sum(r["total"] for r in rows), 2)
        return {"year": y, "grand_total": grand_total, "rows": rows}

    @r.get("/payments/export.csv")
    async def export_payments_csv(
        year: Optional[int] = Query(None, ge=2000, le=2100),
        _=Depends(require_admin),
    ):
        """Full payment ledger for the given year."""
        y = year or datetime.now(timezone.utc).year
        start = f"{y}-01-01"
        end = f"{y}-12-31"
        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Payment Date", "Affiliate", "Amount (USD)", "Method", "Reference",
            "Booking ID", "Booking Label", "Notes", "Recorded By", "Recorded At",
        ])
        async for p in db.affiliate_payments.find(
            {"payment_date": {"$gte": start, "$lte": end}},
            {"_id": 0},
        ).sort("payment_date", 1):
            writer.writerow([
                p.get("payment_date", ""),
                p.get("affiliate_name", ""),
                f"{float(p.get('amount') or 0):.2f}",
                p.get("method", ""),
                p.get("reference") or "",
                p.get("booking_id") or "",
                p.get("booking_label") or "",
                (p.get("notes") or "").replace("\n", " "),
                p.get("created_by") or "",
                p.get("created_at", ""),
            ])
        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="affiliate-payments-{y}.csv"',
            },
        )

    @r.get("/payments/1099-csv")
    async def export_1099_csv(
        year: Optional[int] = Query(None, ge=2000, le=2100),
        threshold: float = Query(600.0, ge=0),
        _=Depends(require_admin),
    ):
        """One row per affiliate with totals + W-9 fields, ready for 1099-NEC prep.

        Default threshold is $600 (IRS 1099-NEC requirement). Corporations
        (C-Corp / S-Corp) are flagged as 'No' under "1099 Required" since
        payments to corporations generally do not require a 1099-NEC.
        """
        y = year or datetime.now(timezone.utc).year
        start = f"{y}-01-01"
        end = f"{y}-12-31"

        # Aggregate totals per affiliate first
        totals: dict[str, dict] = {}
        async for p in db.affiliate_payments.find(
            {"payment_date": {"$gte": start, "$lte": end}},
            {"_id": 0, "affiliate_id": 1, "amount": 1},
        ):
            aid = p["affiliate_id"]
            slot = totals.setdefault(aid, {"total": 0.0, "count": 0})
            slot["total"] += float(p.get("amount") or 0)
            slot["count"] += 1

        buf = io.StringIO()
        writer = csv.writer(buf)
        writer.writerow([
            "Vendor (DBA)", "Legal Name", "Tax ID (EIN/SSN)", "Tax Classification",
            "W-9 Received", "Mailing Address", "City", "Phone", "Email",
            f"Total Paid {y} (USD)", "Payment Count",
            f"1099 Required (>= ${threshold:.0f})",
        ])

        for aid, agg in sorted(totals.items(), key=lambda kv: -kv[1]["total"]):
            doc = await db.affiliates.find_one({"id": aid}, {"_id": 0}) or {}
            total = round(agg["total"], 2)
            classification = (doc.get("tax_classification") or "").strip()
            is_corp = classification.lower() in (
                "c-corp", "s-corp", "c corp", "s corp",
                "llc-c", "llc-s",  # LLCs taxed as corporations
            )
            required = "No" if is_corp else ("Yes" if total >= threshold else "No")
            writer.writerow([
                doc.get("name") or "",
                doc.get("legal_name") or "",
                doc.get("tax_id") or "",
                classification,
                "Yes" if doc.get("w9_received") else "No",
                (doc.get("mailing_address") or "").replace("\n", " "),
                doc.get("city") or "",
                doc.get("phone") or "",
                doc.get("email") or "",
                f"{total:.2f}",
                agg["count"],
                required,
            ])

        buf.seek(0)
        return StreamingResponse(
            iter([buf.getvalue()]),
            media_type="text/csv",
            headers={
                "Content-Disposition": f'attachment; filename="1099-prep-{y}.csv"',
            },
        )

    # ----- /{affiliate_id} dynamic routes (registered AFTER /payments) -----

    @r.patch("/{affiliate_id}", response_model=Affiliate)
    async def update_affiliate(affiliate_id: str, payload: AffiliateUpdate, _=Depends(require_admin)):
        update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
        if not update:
            raise HTTPException(status_code=400, detail="No fields to update")
        update["updated_at"] = _now_iso()
        result = await db.affiliates.update_one({"id": affiliate_id}, {"$set": update})
        if not result.matched_count:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        doc = await db.affiliates.find_one({"id": affiliate_id}, {"_id": 0})
        stats = await _aff_stats(db, affiliate_id)
        paid_ytd = await _paid_ytd(db, affiliate_id)
        return Affiliate(**doc, **stats, paid_ytd=paid_ytd)

    @r.delete("/{affiliate_id}")
    async def delete_affiliate(affiliate_id: str, _=Depends(require_admin)):
        # soft delete — set active=false to preserve historical booking links
        result = await db.affiliates.update_one(
            {"id": affiliate_id},
            {"$set": {"active": False, "updated_at": _now_iso()}},
        )
        if not result.matched_count:
            raise HTTPException(status_code=404, detail="Affiliate not found")
        return {"ok": True}

    @r.post("/assign/{booking_id}")
    async def assign_to_booking(
        booking_id: str,
        payload: AffiliateAssignmentRequest,
        _=Depends(require_admin),
    ):
        aff = await db.affiliates.find_one(
            {"id": payload.affiliate_id, "active": True},
            {"_id": 0, "id": 1, "name": 1, "phone": 1, "email": 1},
        )
        if not aff:
            raise HTTPException(status_code=404, detail="Affiliate not found or inactive")
        booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if not booking:
            raise HTTPException(status_code=404, detail="Booking not found")
        update = {
            "affiliate": {
                "id": aff["id"],
                "name": aff["name"],
                "phone": aff.get("phone"),
                "email": aff.get("email"),
                "cost": float(payload.affiliate_cost),
                "notes": payload.notes,
                "assigned_at": _now_iso(),
            }
        }
        await db.bookings.update_one({"id": booking_id}, {"$set": update})
        return {"ok": True, **update}

    @r.delete("/assign/{booking_id}")
    async def unassign_from_booking(booking_id: str, _=Depends(require_admin)):
        result = await db.bookings.update_one(
            {"id": booking_id}, {"$unset": {"affiliate": ""}}
        )
        if not result.matched_count:
            raise HTTPException(status_code=404, detail="Booking not found")
        return {"ok": True}

    @r.get("/regions")
    async def list_regions(_=Depends(require_admin)):
        """Returns the standardized region names used by chips/filters."""
        return {"regions": REGIONS}

    @r.get("/suggest")
    async def suggest_affiliates(
        pickup: str = "",
        dropoff: str = "",
        region: str = "",
        vehicle_type: str = "",
        _=Depends(require_admin),
    ):
        """Suggest active affiliates that can fulfill a given trip. Accepts
        either an explicit `region` OR free-text `pickup` + `dropoff` strings
        (we detect the region automatically)."""
        detected = (region or "").strip() or detect_region(pickup, dropoff)
        query: dict = {"active": True}
        if detected:
            query["service_areas"] = detected
        if vehicle_type:
            # case-insensitive substring match against the affiliate's
            # vehicle_types array
            query["vehicle_types"] = {
                "$elemMatch": {"$regex": re.escape(vehicle_type), "$options": "i"}
            }

        results = []
        async for doc in db.affiliates.find(query, {"_id": 0}).sort("name", 1):
            results.append(doc)

        return {
            "detected_region": detected,
            "vehicle_type_filter": vehicle_type or None,
            "count": len(results),
            "affiliates": results,
        }

    return r


# Build the real router and re-export it
router = _build_router()
