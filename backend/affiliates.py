"""
Affiliate (partner operator) network for TuranEliteLimo.

Lets the admin store a Rolodex of out-of-territory limo operators
(Sacramento, Tahoe, Monterey, etc.) so when a quote request comes in for
an area we don't cover, we can broker the trip:

  Customer pays us → we pay the affiliate → we keep the markup.

Routes mounted in server.py via `include_router(affiliates_router)`.
"""

from __future__ import annotations

import re
import uuid
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
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
    name: str = Field(..., min_length=2, max_length=120)  # company name
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


class Affiliate(AffiliateBase):
    id: str
    created_at: str
    updated_at: str
    # roll-up stats — populated by the list endpoint, not stored
    rides_total: int = 0
    profit_total: float = 0.0


class AffiliateAssignmentRequest(BaseModel):
    """Used to attach an affiliate to a specific booking + record the cost."""
    affiliate_id: str
    affiliate_cost: float = Field(..., ge=0)  # what we pay them
    notes: Optional[str] = Field(None, max_length=2000)


# ----- dependency import (lazy to dodge circular) ---------------------------

def _get_deps():
    """Resolve db + require_admin from the main server module at call time."""
    from server import db, require_admin
    return db, require_admin


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


# ----- routes ---------------------------------------------------------------

@router.get("", response_model=List[Affiliate])
async def list_affiliates(include_inactive: bool = False):
    db, require_admin_fn = _get_deps()
    # Apply auth — FastAPI Depends() can't be called manually, but the
    # decorator pattern below works because each route applies it.
    raise NotImplementedError("Use the decorated version below")


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
            items.append(Affiliate(**doc, **stats))
        return items

    @r.post("", response_model=Affiliate)
    async def create_affiliate(payload: AffiliateCreate, _=Depends(require_admin)):
        aid = str(uuid.uuid4())
        now = _now_iso()
        doc = {**payload.model_dump(), "id": aid, "created_at": now, "updated_at": now}
        await db.affiliates.insert_one(dict(doc))
        return Affiliate(**doc, rides_total=0, profit_total=0.0)

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
        return Affiliate(**doc, **stats)

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
