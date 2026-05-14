from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import math
import secrets
import string
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
import jwt
import bcrypt
from emergentintegrations.payments.stripe.checkout import (
    StripeCheckout,
    CheckoutSessionRequest,
)
from email_service import (
    send_email,
    render_confirmation_email,
    render_request_received_email,
    render_payment_received_pending_email,
    render_payment_receipt_email,
    render_cancellation_email,
    render_2fa_code_email,
    render_review_request_email,
    render_admin_new_request_email,
    SUPPORT_EMAIL,
)
import sms_service
import reviews_service
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr


# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'change-me')
JWT_ALGORITHM = 'HS256'
ADMIN_EMAIL = os.environ.get('ADMIN_EMAIL', 'admin@turonlimo.com')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'admin123')

app = FastAPI(title="TuranEliteLimo API")
api_router = APIRouter(prefix="/api")
bearer_scheme = HTTPBearer(auto_error=False)


# ---------- Helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode('utf-8'), hashed.encode('utf-8'))
    except Exception:
        return False


def create_access_token(email: str) -> str:
    payload = {
        'sub': email,
        'role': 'admin',
        'exp': datetime.now(timezone.utc) + timedelta(hours=12),
        'type': 'access',
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def require_admin(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get('role') != 'admin':
        raise HTTPException(status_code=403, detail="Admin access required")
    return payload


# ---------- Models ----------
VEHICLE_TYPES = [
    "Executive Sedan",
    "S-Class",
    "Luxury SUV",
    "Stretch Limousine",
    "Sprinter Van",
    "Party Bus",
]

# Default pricing seeded into MongoDB on first startup (admins can edit live).
DEFAULT_VEHICLE_PRICING = {
    "Executive Sedan": {"base": 75.0, "per_mile": 3.50, "minimum": 85.0, "hourly_rate": 95.0, "call_only": False},
    "S-Class": {"base": 95.0, "per_mile": 4.50, "minimum": 115.0, "hourly_rate": 125.0, "call_only": False},
    "Luxury SUV": {"base": 115.0, "per_mile": 4.75, "minimum": 135.0, "hourly_rate": 145.0, "call_only": False},
    "Stretch Limousine": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "hourly_rate": 0.0, "call_only": True},
    "Sprinter Van": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "hourly_rate": 0.0, "call_only": True},
    "Party Bus": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "hourly_rate": 0.0, "call_only": True},
}

# Hourly bookings include this many miles per hour at no extra charge
HOURLY_MILES_INCLUDED_PER_HOUR = 20

# Headquarters coordinates (Millbrae, CA) — used as default center for radius-based zones.
HQ_LAT = 37.5985
HQ_LON = -122.3873

SERVICE_TYPES = [
    "Airport Transfer",
    "Wedding",
    "Corporate / Executive",
    "Hourly Chauffeur",
    "Prom & Nightlife",
    "Wine Tour",
    "Special Event",
]

BOOKING_STATUSES = ["pending", "confirmed", "completed", "cancelled"]


class BookingCreate(BaseModel):
    full_name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    phone: str = Field(..., min_length=5, max_length=40)
    service_type: str
    pickup_date: str  # ISO date YYYY-MM-DD
    pickup_time: str  # HH:MM
    pickup_location: str
    dropoff_location: str
    passengers: int = Field(..., ge=1, le=60)
    luggage_count: int = Field(0, ge=0, le=60)
    child_seat: bool = False
    additional_stops: List[str] = Field(default_factory=list)
    return_trip: bool = False
    return_location: Optional[str] = ""
    vehicle_type: str
    notes: Optional[str] = ""
    hours: Optional[int] = Field(None, ge=2, le=24)  # required only for Hourly Chauffeur, min 2 hours
    meet_and_greet: bool = False  # Airport Transfer only — chauffeur meets at baggage claim
    flight_number: Optional[str] = Field(None, max_length=20)  # required for Airport Transfer
    promo_code: Optional[str] = Field(None, max_length=40)


class Booking(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    full_name: str
    email: str
    phone: str
    service_type: str
    pickup_date: str
    pickup_time: str
    pickup_location: str
    dropoff_location: str
    passengers: int
    luggage_count: int = 0
    child_seat: bool = False
    additional_stops: List[str] = Field(default_factory=list)
    return_trip: bool = False
    return_location: str = ""
    vehicle_type: str
    notes: str = ""
    hours: Optional[int] = None
    meet_and_greet: bool = False
    flight_number: Optional[str] = None
    manage_token: Optional[str] = None
    review_request_sent_at: Optional[str] = None
    cancellation_requested: bool = False
    cancellation_reason: Optional[str] = None
    cancellation_requested_at: Optional[str] = None
    completed_at: Optional[str] = None
    status: str = "pending"
    confirmation_number: Optional[str] = None
    payment_status: str = "unpaid"  # unpaid | pending | paid | refunded
    payment_session_id: Optional[str] = None
    payment_intent_id: Optional[str] = None
    paid_amount: Optional[float] = None
    paid_currency: Optional[str] = None
    quote_amount: Optional[float] = None  # snapshot of quoted price at booking time
    refund_amount: Optional[float] = None
    # Driver dispatch (Phase 1)
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_email: Optional[str] = None
    driver_plate: Optional[str] = None
    driver_token: Optional[str] = None  # tokenized URL for the driver dispatch portal
    trip_status: Optional[str] = None   # assigned | en_route | on_location | passenger_onboard | completed
    trip_status_updated_at: Optional[str] = None
    # Post-trip tipping + rating (Phase 2)
    tip_amount: Optional[float] = None
    tip_session_id: Optional[str] = None
    tip_paid_at: Optional[str] = None
    rating: Optional[int] = None          # 1..5
    rating_feedback: Optional[str] = None
    rated_at: Optional[str] = None
    # Promo / discount (Phase 3)
    promo_code: Optional[str] = None
    discount_amount: Optional[float] = None
    original_quote_amount: Optional[float] = None
    created_at: str


class BookingStatusUpdate(BaseModel):
    status: str
    reason: Optional[str] = Field(None, max_length=500)  # admin-supplied note (for cancellations)


class ContactCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    email: EmailStr
    phone: Optional[str] = ""
    subject: Optional[str] = ""
    message: str = Field(..., min_length=2, max_length=2000)


class ContactInquiry(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str
    email: str
    phone: str = ""
    subject: str = ""
    message: str
    status: str = "new"
    created_at: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    token: str
    email: str
    role: str = "admin"


class LoginChallengeResponse(BaseModel):
    """Returned by /admin/login when password is correct — caller must complete 2FA."""
    requires_2fa: bool = True
    challenge_id: str
    recovery_email_masked: str
    expires_in: int = 600  # seconds


class TwoFAVerifyRequest(BaseModel):
    challenge_id: str
    code: str = Field(..., min_length=6, max_length=6)


class AccountInfo(BaseModel):
    email: str
    recovery_email: str


class AccountUpdateRequest(BaseModel):
    current_password: str
    new_email: Optional[EmailStr] = None
    new_password: Optional[str] = Field(None, min_length=8, max_length=128)
    recovery_email: Optional[EmailStr] = None


# ---------- Public routes ----------
@api_router.get("/")
async def root():
    return {"message": "TuranEliteLimo API", "status": "ok"}


@api_router.get("/options")
async def get_options():
    return {
        "vehicle_types": VEHICLE_TYPES,
        "service_types": SERVICE_TYPES,
        "booking_statuses": BOOKING_STATUSES,
    }


# ---------- Places autocomplete (Bay Area biased) ----------
GOOGLE_MAPS_API_KEY = os.environ.get("GOOGLE_MAPS_API_KEY", "")


@api_router.get("/places/autocomplete")
async def places_autocomplete(input: str = "", session: Optional[str] = None):
    """Proxy to Google Places Autocomplete with NorCal/Bay Area location bias."""
    q = (input or "").strip()
    if len(q) < 2:
        return {"predictions": []}
    if not GOOGLE_MAPS_API_KEY:
        return {"predictions": [], "error": "Google API key not configured"}
    params = {
        "input": q,
        "key": GOOGLE_MAPS_API_KEY,
        # Bias to SF Bay Area centre with 80km radius (covers Napa to San Jose)
        "location": "37.7749,-122.4194",
        "radius": "80000",
        "components": "country:us",
    }
    if session:
        params["sessiontoken"] = session
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get(
                "https://maps.googleapis.com/maps/api/place/autocomplete/json",
                params=params,
            )
            data = r.json()
    except Exception as e:
        logging.getLogger(__name__).warning(f"Places autocomplete failed: {e}")
        return {"predictions": [], "error": "lookup_failed"}

    preds = []
    for p in data.get("predictions", [])[:8]:
        preds.append({
            "place_id": p.get("place_id"),
            "description": p.get("description"),
            "main_text": (p.get("structured_formatting") or {}).get("main_text", p.get("description", "")),
            "secondary_text": (p.get("structured_formatting") or {}).get("secondary_text", ""),
        })
    return {"predictions": preds, "status": data.get("status")}


@api_router.post("/bookings", response_model=Booking)
async def create_booking(payload: BookingCreate, request: Request):
    if payload.vehicle_type not in VEHICLE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid vehicle_type. Must be one of {VEHICLE_TYPES}")
    if payload.service_type not in SERVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid service_type. Must be one of {SERVICE_TYPES}")
    if payload.service_type == "Hourly Chauffeur" and (not payload.hours or payload.hours < 2):
        raise HTTPException(status_code=400, detail="Hourly bookings require a minimum of 2 hours.")
    if payload.service_type == "Airport Transfer" and not (payload.flight_number or "").strip():
        raise HTTPException(
            status_code=400,
            detail="Flight number is required for airport transfers so your chauffeur can track your arrival.",
        )

    doc = payload.model_dump()
    doc['id'] = str(uuid.uuid4())
    doc['status'] = 'pending'
    doc['created_at'] = datetime.now(timezone.utc).isoformat()
    doc['notes'] = doc.get('notes') or ""
    doc['return_location'] = doc.get('return_location') or ""
    doc['additional_stops'] = doc.get('additional_stops') or []
    # Manage token issued upfront so the customer can cancel/change even while pending
    doc['manage_token'] = _generate_manage_token()

    insert_doc = doc.copy()
    await db.bookings.insert_one(insert_doc)

    # ----- Admin notification email (fire-and-forget; never blocks the booking) -----
    if SUPPORT_EMAIL:
        try:
            origin = _frontend_origin_from_request(request)
            admin_url = f"{origin}/admin"
            html = render_admin_new_request_email(doc, admin_dashboard_url=admin_url)
            cn_short = doc.get("confirmation_number") or doc["id"][:8]
            subject = (
                f"🚗 New request · {doc.get('full_name','Customer')} · "
                f"{doc.get('pickup_date','')} {doc.get('pickup_time','')} · #{cn_short}"
            )
            await send_email(to=SUPPORT_EMAIL, subject=subject, html=html)
        except Exception as e:
            logger.warning(f"Admin new-request email failed: {e}")

    # NOTE: No customer email is sent here. The customer will be redirected to Stripe immediately
    # after this booking is created. The "Payment received, confirming chauffeur" email
    # is sent only AFTER successful payment (see /api/payments/status webhook handler).

    return Booking(**doc)


# ---------- Quote / Pricing ----------
class QuoteRequest(BaseModel):
    pickup_location: str = Field(..., min_length=2, max_length=300)
    dropoff_location: str = Field(..., min_length=2, max_length=300)
    service_type: Optional[str] = None
    hours: Optional[int] = Field(None, ge=1, le=24)
    pickup_date: Optional[str] = None  # YYYY-MM-DD — for surge-event matching
    meet_and_greet: bool = False  # Airport Transfer only


class VehicleQuote(BaseModel):
    vehicle_type: str
    price: Optional[float] = None
    formatted_price: Optional[str] = None
    message: Optional[str] = None


class SurchargeInfo(BaseModel):
    zone_name: str
    amount: float
    reason: str
    threshold_miles: Optional[float] = None


class SurgeInfo(BaseModel):
    event_name: str
    pricing_type: str  # "multiplier" or "flat_surcharge"
    multiplier: Optional[float] = None
    flat_surcharge: Optional[float] = None
    reason: str
    start_date: str
    end_date: str


class QuoteResponse(BaseModel):
    distance_miles: Optional[float] = None
    duration_minutes: Optional[float] = None
    pickup_resolved: Optional[str] = None
    dropoff_resolved: Optional[str] = None
    quotes: List[VehicleQuote]
    fallback: bool = False
    pricing_mode: str = "distance"
    hours: Optional[int] = None
    included_miles: Optional[int] = None
    surcharge_applied: Optional[SurchargeInfo] = None
    surge_applied: Optional[SurgeInfo] = None
    meet_and_greet_fee: Optional[float] = None  # flat fee added when meet_and_greet=True and Airport Transfer
    service_fee_percent: Optional[float] = None  # current %; included in each quote's price already
    service_fee_amount_sample: Optional[float] = None  # the $ fee applied to the cheapest priced vehicle (for display)


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.7613  # Earth radius in miles
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def _geocode_google(address: str) -> Optional[dict]:
    """Geocode via Google Maps Geocoding API. Primary geocoder."""
    if not GOOGLE_MAPS_API_KEY:
        return None
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={
                    "address": address,
                    "key": GOOGLE_MAPS_API_KEY,
                    "region": "us",
                    # Bias to SF Bay Area
                    "bounds": "36.8,-123.6|38.9,-121.2",
                },
            )
            if r.status_code != 200:
                return None
            data = r.json()
        if data.get("status") != "OK" or not data.get("results"):
            return None
        top = data["results"][0]
        loc = top["geometry"]["location"]
        return {
            "lat": float(loc["lat"]),
            "lon": float(loc["lng"]),
            "display": top.get("formatted_address", address),
        }
    except Exception as e:
        logging.getLogger(__name__).warning(f"Google geocode failed for '{address}': {e}")
        return None


async def _geocode(address: str) -> Optional[dict]:
    """Geocode with MongoDB cache (30-day TTL).
    Primary: Google Maps Geocoding API. Fallback: OpenStreetMap Nominatim
    (used only if Google is unavailable/unconfigured)."""
    key = address.strip().lower()
    cached = await db.geocode_cache.find_one({"key": key}, {"_id": 0})
    if cached and "lat" in cached and "lon" in cached:
        return cached

    # Primary: Google
    g = await _geocode_google(address)
    if g:
        doc = {
            "key": key,
            **g,
            "source": "google",
            "cached_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.geocode_cache.update_one({"key": key}, {"$set": doc}, upsert=True)
        return doc

    # Fallback: Nominatim (only when Google unavailable)
    candidates = [address]
    lower = address.lower()
    if "california" not in lower and " ca" not in lower and "usa" not in lower:
        candidates.append(f"{address}, California, USA")

    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            for q in candidates:
                r = await cli.get(
                    "https://nominatim.openstreetmap.org/search",
                    params={"q": q, "format": "json", "limit": 1, "countrycodes": "us"},
                    headers={"User-Agent": "TuranEliteLimoQuoteBot/1.0 (reservations@turonlimo.com)"},
                )
                if r.status_code != 200:
                    continue
                data = r.json()
                if data:
                    lat = float(data[0]["lat"])
                    lon = float(data[0]["lon"])
                    display = data[0].get("display_name", address)
                    doc = {
                        "key": key,
                        "lat": lat,
                        "lon": lon,
                        "display": display,
                        "source": "nominatim",
                        "cached_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await db.geocode_cache.update_one({"key": key}, {"$set": doc}, upsert=True)
                    return doc
        return None
    except Exception as e:
        logging.getLogger(__name__).warning(f"Geocode fallback failed for '{address}': {e}")
        return None


def _apply_surge(price: float, surge_mult: float, surge_flat: float) -> float:
    """Apply surge multiplier first, then flat surcharge on top."""
    return price * surge_mult + surge_flat


def _build_quotes(
    distance_miles: Optional[float],
    pricing_map: dict,
    surcharge: float = 0.0,
    surge_mult: float = 1.0,
    surge_flat: float = 0.0,
    addon_flat: float = 0.0,
) -> List[VehicleQuote]:
    quotes: List[VehicleQuote] = []
    has_event = surge_mult != 1.0 or surge_flat > 0
    for vt in VEHICLE_TYPES:
        cfg = pricing_map.get(vt)
        if cfg is None or cfg.get("call_only"):
            quotes.append(VehicleQuote(vehicle_type=vt, message="Call for quote"))
            continue
        if distance_miles is None:
            quotes.append(VehicleQuote(vehicle_type=vt, message="Enter pickup & drop-off for an estimate"))
            continue
        raw = float(cfg["base"]) + float(cfg["per_mile"]) * distance_miles
        price = max(raw, float(cfg["minimum"]))
        if surcharge > 0:
            price += surcharge
        if has_event:
            price = _apply_surge(price, surge_mult, surge_flat)
        # Add-on (e.g., Meet & Greet) is added AFTER surge so it's a true flat add
        if addon_flat > 0:
            price += addon_flat
        price = round(price, 2)
        tags = []
        if surcharge > 0:
            tags.append("long-distance area")
        if has_event:
            tags.append("event surge")
        if addon_flat > 0:
            tags.append("meet & greet")
        msg = "Estimated flat rate" + (" · " + " · ".join(tags) if tags else "")
        quotes.append(VehicleQuote(
            vehicle_type=vt,
            price=price,
            formatted_price=f"${int(price):,}" if price == int(price) else f"${price:,.2f}",
            message=msg,
        ))
    return quotes


def _build_hourly_quotes(
    hours: int,
    pricing_map: dict,
    surge_mult: float = 1.0,
    surge_flat: float = 0.0,
) -> List[VehicleQuote]:
    """Hourly chauffeur pricing: hourly_rate × hours, ignores trip distance."""
    quotes: List[VehicleQuote] = []
    has_event = surge_mult != 1.0 or surge_flat > 0
    for vt in VEHICLE_TYPES:
        cfg = pricing_map.get(vt)
        if cfg is None or cfg.get("call_only"):
            quotes.append(VehicleQuote(vehicle_type=vt, message="Call for quote"))
            continue
        rate = float(cfg.get("hourly_rate") or 0)
        if rate <= 0:
            quotes.append(VehicleQuote(vehicle_type=vt, message="Hourly rate not set — call us"))
            continue
        price = rate * hours
        if has_event:
            price = _apply_surge(price, surge_mult, surge_flat)
        price = round(price, 2)
        base_msg = f"${int(rate) if rate == int(rate) else rate}/hr × {hours} hrs"
        if has_event:
            base_msg += " · event surge"
        quotes.append(VehicleQuote(
            vehicle_type=vt,
            price=price,
            formatted_price=f"${int(price):,}" if price == int(price) else f"${price:,.2f}",
            message=base_msg,
        ))
    return quotes


# ---------- Zone surcharges ----------
DEFAULT_ZONES = [
    {
        "name": "Healdsburg & North Sonoma",
        "keywords": ["healdsburg", "geyserville", "cloverdale", "windsor"],
        "surcharge_amount": 65.0,
        "short_distance_threshold_miles": 20.0,
        "reason": "Healdsburg & North Sonoma are outside our usual chauffeur radius — short trips in this area require us to position a driver from Millbrae, so a long-distance area fee applies.",
        "enabled": True,
    },
    {
        "name": "Calistoga & Upper Napa",
        "keywords": ["calistoga", "angwin", "deer park", "pope valley", "saint helena", "st. helena", "st helena"],
        "surcharge_amount": 55.0,
        "short_distance_threshold_miles": 20.0,
        "reason": "Calistoga & Upper Napa Valley are 60+ miles from our base. Short rides here include a positioning fee so we can keep service standards high.",
        "enabled": True,
    },
]


def _address_matches_zone(address: str, zone: dict) -> bool:
    """Case-insensitive keyword check against the address string."""
    if not address:
        return False
    a = address.lower()
    return any(kw.lower() in a for kw in zone.get("keywords", []))


def _coord_outside_radius(coord: Optional[dict], zone: dict) -> bool:
    """True if coord (geocode result dict) is OUTSIDE the zone's radius from HQ."""
    if not coord:
        return False
    radius = float(zone.get("radius_miles") or 0)
    if radius <= 0:
        return False
    dist = _haversine_miles(HQ_LAT, HQ_LON, coord["lat"], coord["lon"])
    return dist > radius


async def _load_zones() -> List[dict]:
    cursor = db.zone_surcharges.find({}, {"_id": 0})
    return await cursor.to_list(100)


def _select_surcharge_zone(
    pickup_addr: str,
    dropoff_addr: str,
    distance_miles: Optional[float],
    zones: List[dict],
    pickup_coord: Optional[dict] = None,
    dropoff_coord: Optional[dict] = None,
) -> Optional[dict]:
    """Return the FIRST matching enabled zone.
    Supports two zone types via `match_type`:
      - "keyword_short" (default, legacy): pickup/dropoff address contains one of
        the keywords AND total trip miles < short_distance_threshold_miles.
        Use case: positioning fee for short rides in a far-away area.
      - "outside_radius": pickup OR dropoff geocoded coord is > radius_miles from HQ.
        Use case: blanket out-of-area surcharge.
    """
    for z in zones:
        if not z.get("enabled", True):
            continue
        match_type = z.get("match_type") or "keyword_short"
        if match_type == "outside_radius":
            if _coord_outside_radius(pickup_coord, z) or _coord_outside_radius(dropoff_coord, z):
                return z
        else:  # keyword_short (default)
            if distance_miles is None:
                continue
            threshold = float(z.get("short_distance_threshold_miles") or 0)
            if threshold <= 0:
                continue
            if distance_miles >= threshold:
                continue
            if _address_matches_zone(pickup_addr, z) or _address_matches_zone(dropoff_addr, z):
                return z
    return None


async def _load_surge_events() -> List[dict]:
    cursor = db.surge_events.find({}, {"_id": 0})
    return await cursor.to_list(200)


def _select_surge_event(pickup_date: Optional[str], events: List[dict]) -> Optional[dict]:
    """Find the first ENABLED event whose [start_date, end_date] window includes pickup_date.
    Dates are inclusive on both ends. Returns None if pickup_date is missing/invalid."""
    if not pickup_date:
        return None
    try:
        from datetime import date as _date
        d = _date.fromisoformat(pickup_date)
    except Exception:
        return None
    for ev in events:
        if not ev.get("enabled", True):
            continue
        try:
            sd = _date.fromisoformat(ev["start_date"])
            ed = _date.fromisoformat(ev["end_date"])
        except Exception:
            continue
        if sd <= d <= ed:
            return ev
    return None


def _surge_factors(event: Optional[dict]) -> tuple[float, float]:
    """Return (multiplier, flat_surcharge) tuple from a matched event, or (1.0, 0.0)."""
    if not event:
        return 1.0, 0.0
    pricing_type = event.get("pricing_type", "multiplier")
    if pricing_type == "multiplier":
        return float(event.get("multiplier") or 1.0), 0.0
    if pricing_type == "flat_surcharge":
        return 1.0, float(event.get("flat_surcharge") or 0.0)
    return 1.0, 0.0


async def _load_pricing_map() -> dict:
    cursor = db.pricing_config.find({}, {"_id": 0})
    rows = await cursor.to_list(50)
    return {r["vehicle_type"]: r for r in rows}


def _apply_service_fee_to_quote_response(qr: "QuoteResponse", fee_percent: float) -> "QuoteResponse":
    """Adds the service fee (covers Stripe processing) to every priced vehicle in a quote.
    Mutates the response in place + stamps the percent + a sample $ amount for display.
    No-op if fee_percent <= 0.
    """
    if not fee_percent or fee_percent <= 0:
        return qr
    pct = float(fee_percent) / 100.0
    sample = None
    for q in qr.quotes:
        if q.price is not None and q.price > 0:
            fee = round(q.price * pct, 2)
            q.price = round(q.price + fee, 2)
            # Update display label so the customer sees the new total
            currency_sym = "$"
            q.formatted_price = f"{currency_sym}{q.price:.2f}"
            if sample is None or fee < sample:
                sample = fee
    qr.service_fee_percent = float(fee_percent)
    qr.service_fee_amount_sample = sample
    return qr


@api_router.post("/quote", response_model=QuoteResponse)
async def quote_ride(payload: QuoteRequest):
    pricing_map = await _load_pricing_map()

    # Load settings once — needed for meet & greet AND for the service fee
    settings = await _load_settings()

    # Meet & Greet flat fee (only for Airport Transfer)
    mg_fee = 0.0
    if payload.meet_and_greet and payload.service_type == "Airport Transfer":
        mg_fee = float(settings.meet_greet_fee or 0.0)

    # Surge events (date-based) — apply on top of all base/hourly pricing
    surge_events = await _load_surge_events()
    matched_event = _select_surge_event(payload.pickup_date, surge_events)
    surge_mult, surge_flat = _surge_factors(matched_event)
    surge_info = (
        SurgeInfo(
            event_name=matched_event["name"],
            pricing_type=matched_event.get("pricing_type", "multiplier"),
            multiplier=float(matched_event["multiplier"]) if matched_event.get("pricing_type") == "multiplier" else None,
            flat_surcharge=float(matched_event["flat_surcharge"]) if matched_event.get("pricing_type") == "flat_surcharge" else None,
            reason=matched_event.get("reason", ""),
            start_date=matched_event.get("start_date", ""),
            end_date=matched_event.get("end_date", ""),
        )
        if matched_event else None
    )

    # Hourly mode: ignore distance, use hourly_rate × hours (minimum 2 hours)
    if payload.service_type == "Hourly Chauffeur":
        if not payload.hours or payload.hours < 2:
            # Don't return distance-based prices — explicitly tell the customer.
            return _apply_service_fee_to_quote_response(QuoteResponse(
                quotes=[
                    VehicleQuote(vehicle_type=vt, message="Minimum 2 hours required")
                    for vt in VEHICLE_TYPES
                ],
                pricing_mode="hourly",
                hours=payload.hours,
                included_miles=None,
                fallback=True,
            ), settings.service_fee_percent)
        return _apply_service_fee_to_quote_response(QuoteResponse(
            quotes=_build_hourly_quotes(payload.hours, pricing_map, surge_mult=surge_mult, surge_flat=surge_flat),
            pricing_mode="hourly",
            hours=payload.hours,
            included_miles=payload.hours * HOURLY_MILES_INCLUDED_PER_HOUR,
            surge_applied=surge_info,
        ), settings.service_fee_percent)

    pickup = await _geocode(payload.pickup_location)
    dropoff = await _geocode(payload.dropoff_location)
    if not pickup or not dropoff:
        return _apply_service_fee_to_quote_response(QuoteResponse(
            quotes=_build_quotes(None, pricing_map, addon_flat=mg_fee),
            fallback=True,
            meet_and_greet_fee=mg_fee if mg_fee > 0 else None,
        ), settings.service_fee_percent)

    miles = _haversine_miles(pickup["lat"], pickup["lon"], dropoff["lat"], dropoff["lon"])
    miles = round(miles, 1)
    duration_minutes = round((miles * 1.4) / 32.0 * 60.0 + 8.0, 0)

    # Zone surcharge: legacy keyword-short OR new outside-radius
    zones = await _load_zones()
    matched_zone = _select_surcharge_zone(
        payload.pickup_location, payload.dropoff_location, miles, zones,
        pickup_coord=pickup, dropoff_coord=dropoff,
    )
    surcharge_amt = float(matched_zone["surcharge_amount"]) if matched_zone else 0.0
    surcharge_info = (
        SurchargeInfo(
            zone_name=matched_zone["name"],
            amount=surcharge_amt,
            reason=matched_zone.get("reason", ""),
            threshold_miles=float(matched_zone.get("short_distance_threshold_miles") or 0) or None,
        )
        if matched_zone else None
    )

    return _apply_service_fee_to_quote_response(QuoteResponse(
        distance_miles=miles,
        duration_minutes=duration_minutes,
        pickup_resolved=pickup.get("display"),
        dropoff_resolved=dropoff.get("display"),
        quotes=_build_quotes(
            miles, pricing_map,
            surcharge=surcharge_amt,
            surge_mult=surge_mult,
            surge_flat=surge_flat,
            addon_flat=mg_fee,
        ),
        fallback=False,
        surcharge_applied=surcharge_info,
        surge_applied=surge_info,
        meet_and_greet_fee=mg_fee if mg_fee > 0 else None,
    ), settings.service_fee_percent)


@api_router.post("/contact", response_model=ContactInquiry)
async def create_contact(payload: ContactCreate):
    doc = payload.model_dump()
    doc['id'] = str(uuid.uuid4())
    doc['status'] = 'new'
    doc['created_at'] = datetime.now(timezone.utc).isoformat()
    doc['phone'] = doc.get('phone') or ""
    doc['subject'] = doc.get('subject') or ""

    insert_doc = doc.copy()
    await db.contacts.insert_one(insert_doc)
    return ContactInquiry(**doc)


# ---------- Public reviews (Google + Yelp + handpicked fallback) ----------
@api_router.get("/reviews")
async def public_reviews():
    """Reviews for the homepage Testimonials section.
    Pulls Google + Yelp if their env keys are set, else returns handpicked fallback."""
    return await reviews_service.get_reviews()


@api_router.get("/reviews/summary")
async def reviews_summary():
    """Aggregate rating + count from Google + Yelp for the navbar trust badge.
    Empty dict for any provider that isn't configured (frontend hides the badge)."""
    return await reviews_service.get_summary()


# ---------- Customer self-service (tokenized) ----------
class ManageCancelRequest(BaseModel):
    reason: Optional[str] = ""


@api_router.get("/bookings/manage/{token}")
async def manage_view_booking(token: str):
    """View booking details via the token customers receive in confirmation email."""
    b = await db.bookings.find_one({"manage_token": token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Reservation not found or link expired.")
    return {
        "id": b["id"],
        "confirmation_number": b.get("confirmation_number"),
        "status": b.get("status"),
        "payment_status": b.get("payment_status", "unpaid"),
        "full_name": b.get("full_name"),
        "service_type": b.get("service_type"),
        "vehicle_type": b.get("vehicle_type"),
        "pickup_date": b.get("pickup_date"),
        "pickup_time": b.get("pickup_time"),
        "pickup_location": b.get("pickup_location"),
        "dropoff_location": b.get("dropoff_location"),
        "passengers": b.get("passengers"),
        "luggage_count": b.get("luggage_count"),
        "child_seat": b.get("child_seat"),
        "return_trip": b.get("return_trip"),
        "return_location": b.get("return_location"),
        "additional_stops": b.get("additional_stops", []),
        "hours": b.get("hours"),
        "meet_and_greet": b.get("meet_and_greet", False),
        "flight_number": b.get("flight_number"),
        "quote_amount": b.get("quote_amount"),
        "paid_amount": b.get("paid_amount"),
        "cancellation_requested": b.get("cancellation_requested", False),
        "support_phone": "+16504100687",
        "support_email": SUPPORT_EMAIL,
    }


@api_router.post("/bookings/manage/{token}/cancel")
async def manage_cancel_booking(token: str, payload: ManageCancelRequest):
    """Customer-initiated cancellation.
    - Unpaid: cancel immediately (status -> cancelled).
    - Paid: flag cancellation_requested for admin to review/refund."""
    b = await db.bookings.find_one({"manage_token": token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Reservation not found or link expired.")
    if b.get("status") in ("completed",):
        raise HTTPException(status_code=400, detail="This ride is already completed.")
    if b.get("status") == "cancelled":
        return {"ok": True, "status": "cancelled", "already_cancelled": True}

    is_paid = b.get("payment_status") == "paid"
    update_doc = {
        "cancellation_requested": True,
        "cancellation_reason": (payload.reason or "")[:500],
        "cancellation_requested_at": datetime.now(timezone.utc).isoformat(),
    }
    if not is_paid:
        update_doc["status"] = "cancelled"
    await db.bookings.update_one({"id": b["id"]}, {"$set": update_doc})

    # SMS the admin/driver
    admin_to = sms_service.admin_phone()
    if admin_to:
        merged = {**b, **update_doc}
        await sms_service.send_sms(
            admin_to, sms_service.render_cancellation_sms(merged, requested=is_paid)
        )

    if is_paid:
        return {
            "ok": True,
            "status": "cancellation_requested",
            "message": "We've received your request. Our team will review it and contact you about a refund within 24 hours.",
        }
    return {
        "ok": True,
        "status": "cancelled",
        "message": "Your reservation has been cancelled. We hope to chauffeur you another time.",
    }


# ---------- Driver dispatch portal ----------

# Allowed trip statuses + their order. Drivers can only advance forward.
TRIP_STATUS_ORDER = ["assigned", "en_route", "on_location", "passenger_onboard", "completed"]


class DriverAssignRequest(BaseModel):
    """Admin assigns a driver to a booking."""
    driver_name: str = Field(..., min_length=1, max_length=80)
    driver_phone: str = Field(..., min_length=7, max_length=30)
    driver_email: Optional[str] = ""
    driver_plate: Optional[str] = ""


class DriverStatusUpdate(BaseModel):
    status: str = Field(..., pattern="^(en_route|on_location|passenger_onboard|completed)$")


def _generate_driver_token() -> str:
    return secrets.token_urlsafe(16)


@api_router.post("/admin/bookings/{booking_id}/assign-driver")
async def assign_driver(booking_id: str, payload: DriverAssignRequest, request: Request, _: dict = Depends(require_admin)):
    """Assign a driver to a booking. Generates a driver_token (one-time) and SMSes
    the driver the dispatch URL. Idempotent — re-assigning regenerates the token
    and sends a fresh SMS."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")

    token = b.get("driver_token") or _generate_driver_token()
    update_doc = {
        "driver_name": payload.driver_name.strip(),
        "driver_phone": payload.driver_phone.strip(),
        "driver_email": (payload.driver_email or "").strip(),
        "driver_plate": (payload.driver_plate or "").strip().upper(),
        "driver_token": token,
        "trip_status": b.get("trip_status") or "assigned",
        "trip_status_updated_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bookings.update_one({"id": booking_id}, {"$set": update_doc})

    # SMS the driver with the dispatch link
    client_origin = _frontend_origin_from_request(request)
    driver_url = f"{client_origin}/driver/{token}"
    try:
        merged = {**b, **update_doc}
        await sms_service.send_sms(
            payload.driver_phone.strip(),
            sms_service.render_driver_dispatch_sms(merged, driver_url),
        )
    except Exception as e:
        logger.warning(f"Driver dispatch SMS failed: {e}")

    return {"ok": True, "driver_token": token, "driver_url": driver_url}


@api_router.delete("/admin/bookings/{booking_id}/driver")
async def unassign_driver(booking_id: str, _: dict = Depends(require_admin)):
    """Remove the driver from a booking (e.g., if reassigning). Invalidates the
    driver_token so the old link stops working."""
    await db.bookings.update_one(
        {"id": booking_id},
        {"$unset": {
            "driver_name": "", "driver_phone": "", "driver_email": "",
            "driver_plate": "", "driver_token": "", "trip_status": "",
            "trip_status_updated_at": "",
        }},
    )
    return {"ok": True}


@api_router.get("/driver/{driver_token}")
async def driver_view_booking(driver_token: str):
    """Driver opens the dispatch link → returns just enough info to do the trip.
    No admin auth required (the token IS the auth)."""
    b = await db.bookings.find_one({"driver_token": driver_token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    return {
        "id": b["id"],
        "confirmation_number": b.get("confirmation_number"),
        "trip_status": b.get("trip_status") or "assigned",
        "trip_status_updated_at": b.get("trip_status_updated_at"),
        "customer_name": b.get("full_name"),
        "customer_phone": b.get("phone"),
        "pickup_date": b.get("pickup_date"),
        "pickup_time": b.get("pickup_time"),
        "pickup_location": b.get("pickup_location"),
        "dropoff_location": b.get("dropoff_location"),
        "additional_stops": b.get("additional_stops") or [],
        "passengers": b.get("passengers"),
        "luggage_count": b.get("luggage_count"),
        "child_seat": b.get("child_seat", False),
        "vehicle_type": b.get("vehicle_type"),
        "service_type": b.get("service_type"),
        "hours": b.get("hours"),
        "flight_number": b.get("flight_number"),
        "meet_and_greet": b.get("meet_and_greet", False),
        "return_trip": b.get("return_trip", False),
        "return_location": b.get("return_location"),
        "notes": b.get("notes"),
        "driver_name": b.get("driver_name"),
        "driver_plate": b.get("driver_plate"),
    }


@api_router.post("/driver/{driver_token}/status")
async def driver_update_status(driver_token: str, payload: DriverStatusUpdate, request: Request):
    """Driver advances trip status. Triggers SMS to the customer (and admin) for
    notable transitions."""
    b = await db.bookings.find_one({"driver_token": driver_token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")

    current = b.get("trip_status") or "assigned"
    new_status = payload.status
    try:
        if TRIP_STATUS_ORDER.index(new_status) <= TRIP_STATUS_ORDER.index(current):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot move from '{current}' to '{new_status}' — status only moves forward.",
            )
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid status")

    now_iso = datetime.now(timezone.utc).isoformat()
    set_doc = {"trip_status": new_status, "trip_status_updated_at": now_iso}
    # When driver marks trip completed, also stamp booking-level fields
    if new_status == "completed":
        set_doc["completed_at"] = now_iso
        # Only flip booking status to 'completed' if it was 'confirmed' or 'pending'
        if b.get("status") in ("confirmed", "pending"):
            set_doc["status"] = "completed"
    await db.bookings.update_one({"id": b["id"]}, {"$set": set_doc})

    # Build post-trip page URL (tipping + rating) — included in the customer SMS
    post_trip_url = None
    if new_status == "completed" and b.get("manage_token"):
        origin = _frontend_origin_from_request(request)
        post_trip_url = f"{origin}/post-trip/{b['manage_token']}"

    # SMS the customer (env-gated; skipped if Twilio not configured)
    merged = {**b, **set_doc}
    customer_sms = sms_service.render_customer_status_sms(merged, new_status, post_trip_url=post_trip_url)
    if customer_sms and b.get("phone"):
        try:
            await sms_service.send_sms(b["phone"], customer_sms)
        except Exception as e:
            logger.warning(f"Customer status SMS failed: {e}")

    # SMS the admin as well (so you know dispatch is rolling)
    admin_to = sms_service.admin_phone()
    if admin_to:
        try:
            await sms_service.send_sms(
                admin_to, sms_service.render_admin_status_sms(merged, new_status)
            )
        except Exception as e:
            logger.warning(f"Admin status SMS failed: {e}")

    return {"ok": True, "trip_status": new_status, "trip_status_updated_at": now_iso}


# ---------- Post-trip: tipping + rating (Phase 2) ----------
class TipCheckoutRequest(BaseModel):
    amount: float = Field(..., gt=0, le=2000)
    origin_url: str


class TripRatingRequest(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    feedback: Optional[str] = Field(None, max_length=2000)


@api_router.get("/post-trip/{token}")
async def post_trip_view(token: str):
    """Public-facing summary for the post-trip tip + rate page.
    Auth = the manage_token issued at booking creation.
    """
    b = await db.bookings.find_one({"manage_token": token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    # Determine which review site to recommend (Yelp always; Google only if env-configured)
    links = reviews_service.review_links()
    yelp_url = links.get("yelp")
    google_url = links.get("google") if os.environ.get("GOOGLE_PLACE_ID", "").strip() else None
    return {
        "id": b["id"],
        "confirmation_number": b.get("confirmation_number"),
        "full_name": b.get("full_name"),
        "pickup_date": b.get("pickup_date"),
        "pickup_time": b.get("pickup_time"),
        "pickup_location": b.get("pickup_location"),
        "dropoff_location": b.get("dropoff_location"),
        "vehicle_type": b.get("vehicle_type"),
        "driver_name": b.get("driver_name"),
        "paid_amount": b.get("paid_amount"),
        "trip_status": b.get("trip_status"),
        "tip_amount": b.get("tip_amount"),
        "tip_paid_at": b.get("tip_paid_at"),
        "rating": b.get("rating"),
        "rated_at": b.get("rated_at"),
        "yelp_url": yelp_url,
        "google_url": google_url,
    }


@api_router.post("/post-trip/{token}/tip-checkout")
async def post_trip_tip_checkout(token: str, payload: TipCheckoutRequest, request: Request):
    """Create a Stripe Checkout session for the chauffeur tip.
    Idempotency: if a tip has already been paid, reject.
    """
    b = await db.bookings.find_one({"manage_token": token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    if b.get("tip_paid_at"):
        raise HTTPException(status_code=400, detail="A tip has already been paid for this trip.")

    amount = round(float(payload.amount), 2)
    if amount < 0.5:
        raise HTTPException(status_code=400, detail="Tip too small.")

    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/post-trip/{token}?tip_session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/post-trip/{token}"

    checkout = _get_stripe_checkout(request)
    session = await checkout.create_checkout_session(
        CheckoutSessionRequest(
            amount=amount,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "booking_id": b["id"],
                "confirmation_number": b.get("confirmation_number") or "",
                "customer_email": b.get("email") or "",
                "kind": "chauffeur_tip",
            },
        )
    )
    # Persist the session id on the booking so we can confirm on return
    await db.bookings.update_one(
        {"id": b["id"]},
        {"$set": {"tip_session_id": session.session_id, "tip_amount_pending": amount}},
    )
    return {"url": session.url, "session_id": session.session_id, "amount": amount}


@api_router.get("/post-trip/{token}/confirm-tip")
async def post_trip_confirm_tip(token: str, session_id: str, request: Request):
    """Customer returned from Stripe — confirm the tip via direct REST + mark booking."""
    b = await db.bookings.find_one({"manage_token": token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    if b.get("tip_session_id") != session_id:
        raise HTTPException(status_code=400, detail="Session does not match this trip.")
    if b.get("tip_paid_at"):
        return {"paid": True, "tip_amount": b.get("tip_amount")}

    # Direct REST lookup (most reliable)
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")
    async with httpx.AsyncClient(timeout=10.0) as cli:
        r = await cli.get(
            f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail="Stripe lookup failed")
    sess = r.json()
    if sess.get("payment_status") != "paid":
        return {"paid": False, "stripe_payment_status": sess.get("payment_status")}

    amount = (sess.get("amount_total") or 0) / 100.0
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": b["id"]},
        {"$set": {"tip_amount": amount, "tip_paid_at": now_iso}},
    )
    # Notify admin via SMS so the chauffeur can be paid out
    admin_to = sms_service.admin_phone()
    if admin_to:
        try:
            cn = b.get("confirmation_number") or b["id"][:8]
            name = b.get("full_name") or "Customer"
            driver = b.get("driver_name") or "—"
            await sms_service.send_sms(
                admin_to,
                f"TuranEliteLimo · TIP RECEIVED\n#{cn}\n{name} tipped ${amount:.2f} for chauffeur {driver}",
            )
        except Exception as e:
            logger.warning(f"Tip admin SMS failed: {e}")
    return {"paid": True, "tip_amount": amount}


@api_router.post("/post-trip/{token}/rate")
async def post_trip_rate(token: str, payload: TripRatingRequest):
    """Customer submits a star rating + optional feedback. One submission per trip."""
    b = await db.bookings.find_one({"manage_token": token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    if b.get("rating") is not None:
        raise HTTPException(status_code=400, detail="This trip has already been rated.")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": b["id"]},
        {
            "$set": {
                "rating": int(payload.rating),
                "rating_feedback": (payload.feedback or "").strip() or None,
                "rated_at": now_iso,
            }
        },
    )
    # SMS admin if rating is low (<= 3) so they can follow up personally
    if payload.rating <= 3:
        admin_to = sms_service.admin_phone()
        if admin_to:
            try:
                cn = b.get("confirmation_number") or b["id"][:8]
                name = b.get("full_name") or "Customer"
                fb = (payload.feedback or "").strip()[:200]
                await sms_service.send_sms(
                    admin_to,
                    f"TuranEliteLimo · LOW RATING ({payload.rating}★)\n#{cn} · {name}\n{fb}",
                )
            except Exception as e:
                logger.warning(f"Low-rating admin SMS failed: {e}")
    return {"ok": True, "rating": int(payload.rating)}


# ---------- Admin auth (2FA via email) ----------
def _mask_email(email: str) -> str:
    """Return a privacy-safe masked email like 'a***n@gmail.com'."""
    if not email or "@" not in email:
        return email or ""
    local, _, domain = email.partition("@")
    if len(local) <= 2:
        masked = local[0] + "*"
    else:
        masked = local[0] + ("*" * max(1, len(local) - 2)) + local[-1]
    return f"{masked}@{domain}"


def _generate_2fa_code() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(6))


# ---------- Promo Codes (Phase 3) ----------
class PromoBase(BaseModel):
    code: str = Field(..., min_length=2, max_length=40)
    description: Optional[str] = Field(None, max_length=200)
    discount_type: str = Field(..., pattern="^(percent|fixed)$")
    value: float = Field(..., gt=0)
    min_ride_amount: float = Field(0.0, ge=0)
    max_uses: Optional[int] = Field(None, ge=1)
    expires_at: Optional[str] = None  # ISO date YYYY-MM-DD
    first_ride_only: bool = False
    active: bool = True
    show_on_banner: bool = False  # whether to advertise this code as a sitewide banner


class PromoCreate(PromoBase):
    pass


class PromoUpdate(BaseModel):
    description: Optional[str] = Field(None, max_length=200)
    discount_type: Optional[str] = Field(None, pattern="^(percent|fixed)$")
    value: Optional[float] = Field(None, gt=0)
    min_ride_amount: Optional[float] = Field(None, ge=0)
    max_uses: Optional[int] = Field(None, ge=1)
    expires_at: Optional[str] = None
    first_ride_only: Optional[bool] = None
    active: Optional[bool] = None
    show_on_banner: Optional[bool] = None


class Promo(PromoBase):
    id: str
    uses: int = 0
    total_discount_given: float = 0.0
    created_at: str


class PromoValidateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=40)
    amount: float = Field(..., gt=0)
    email: Optional[EmailStr] = None


def _normalize_promo_code(raw: str) -> str:
    return (raw or "").strip().upper()


async def _validate_promo_for_booking(
    code: str, amount: float, email: Optional[str]
) -> dict:
    """Server-side promo validation used at quote-validate AND checkout time.
    Returns {ok: bool, code, discount, reason, type, value, final_amount}."""
    normalized = _normalize_promo_code(code)
    if not normalized:
        return {"ok": False, "reason": "Empty code"}
    promo = await db.promos.find_one({"code": normalized}, {"_id": 0})
    if not promo:
        return {"ok": False, "reason": "Code not found"}
    if not promo.get("active", True):
        return {"ok": False, "reason": "This code is no longer active"}
    expires = promo.get("expires_at")
    if expires:
        try:
            exp_date = datetime.fromisoformat(expires).date()
            if datetime.now(timezone.utc).date() > exp_date:
                return {"ok": False, "reason": "This code has expired"}
        except (ValueError, TypeError):
            pass
    max_uses = promo.get("max_uses")
    uses = int(promo.get("uses") or 0)
    if max_uses is not None and uses >= int(max_uses):
        return {"ok": False, "reason": "This code has reached its usage limit"}
    min_ride = float(promo.get("min_ride_amount") or 0)
    if amount < min_ride:
        return {
            "ok": False,
            "reason": f"Minimum ride amount for this code is ${min_ride:.2f}",
        }
    if promo.get("first_ride_only") and email:
        prior = await db.bookings.count_documents(
            {"email": email.lower(), "payment_status": "paid"}
        )
        if prior > 0:
            return {"ok": False, "reason": "This code is for first-time customers only"}

    # Compute discount
    if promo["discount_type"] == "percent":
        discount = round(amount * float(promo["value"]) / 100.0, 2)
    else:  # fixed
        discount = round(min(float(promo["value"]), amount), 2)
    if discount <= 0:
        return {"ok": False, "reason": "Discount would not apply to this ride"}

    return {
        "ok": True,
        "code": normalized,
        "description": promo.get("description") or "",
        "discount_type": promo["discount_type"],
        "value": float(promo["value"]),
        "discount": discount,
        "final_amount": round(amount - discount, 2),
    }


@api_router.post("/promos/validate")
async def public_validate_promo(payload: PromoValidateRequest):
    """Public endpoint — booking form uses this for live "Apply code" feedback."""
    result = await _validate_promo_for_booking(payload.code, payload.amount, payload.email)
    return result


@api_router.get("/promos/banner")
async def public_banner_promo():
    """Returns the currently advertised promo (if any) for the sitewide banner.
    Picks the most recently created promo that is active + has show_on_banner=True
    + not expired + hasn't hit max_uses.
    """
    today = datetime.now(timezone.utc).date().isoformat()
    cursor = db.promos.find(
        {"active": True, "show_on_banner": True},
        {"_id": 0},
    ).sort("created_at", -1)
    rows = await cursor.to_list(20)
    for p in rows:
        # Expiry guard
        exp = p.get("expires_at")
        if exp and exp < today:
            continue
        # Max uses guard
        mu = p.get("max_uses")
        if mu is not None and int(p.get("uses") or 0) >= int(mu):
            continue
        return {
            "code": p["code"],
            "description": p.get("description") or "",
            "discount_type": p["discount_type"],
            "value": float(p["value"]),
            "min_ride_amount": float(p.get("min_ride_amount") or 0),
            "first_ride_only": bool(p.get("first_ride_only")),
            "expires_at": p.get("expires_at"),
        }
    return {"code": None}


@api_router.get("/admin/promos", response_model=List[Promo])
async def admin_list_promos(_: dict = Depends(require_admin)):
    rows = await db.promos.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    out = []
    for r in rows:
        r.setdefault("uses", 0)
        r.setdefault("total_discount_given", 0.0)
        out.append(Promo(**r))
    return out


@api_router.post("/admin/promos", response_model=Promo)
async def admin_create_promo(payload: PromoCreate, _: dict = Depends(require_admin)):
    normalized = _normalize_promo_code(payload.code)
    existing = await db.promos.find_one({"code": normalized})
    if existing:
        raise HTTPException(status_code=400, detail=f"Code {normalized} already exists")
    doc = payload.model_dump()
    doc["code"] = normalized
    doc["id"] = str(uuid.uuid4())
    doc["uses"] = 0
    doc["total_discount_given"] = 0.0
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    insert_doc = doc.copy()
    await db.promos.insert_one(insert_doc)
    return Promo(**doc)


@api_router.patch("/admin/promos/{promo_id}", response_model=Promo)
async def admin_update_promo(
    promo_id: str, payload: PromoUpdate, _: dict = Depends(require_admin)
):
    updates = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None or k in ("active", "expires_at", "max_uses")}
    result = await db.promos.find_one_and_update(
        {"id": promo_id},
        {"$set": updates},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Promo not found")
    result.setdefault("uses", 0)
    result.setdefault("total_discount_given", 0.0)
    return Promo(**result)


@api_router.delete("/admin/promos/{promo_id}")
async def admin_delete_promo(promo_id: str, _: dict = Depends(require_admin)):
    r = await db.promos.delete_one({"id": promo_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Promo not found")
    return {"deleted": True}


@api_router.post("/admin/login", response_model=LoginChallengeResponse)
async def admin_login(payload: LoginRequest, request: Request):
    """Step 1 of admin login: verify email + password, then email a 6-digit code."""
    user = await db.admin_users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not verify_password(payload.password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail="Invalid email or password")

    recovery_email = user.get("recovery_email") or user["email"]
    code = _generate_2fa_code()
    challenge_id = str(uuid.uuid4())
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=10)

    await db.admin_2fa_challenges.insert_one({
        "challenge_id": challenge_id,
        "admin_email": user["email"],
        "code_hash": hash_password(code),
        "expires_at": expires_at.isoformat(),
        "attempts": 0,
        "used": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    user_agent = request.headers.get("user-agent", "Unknown device")
    client_ip = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown")
    meta = f"Requested at {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M UTC')} · {user_agent[:60]} · IP {client_ip[:40]}"

    html = render_2fa_code_email(code, request_meta=meta)
    sent_id = await send_email(
        to=recovery_email,
        subject=f"Your TuranEliteLimo admin code: {code}",
        html=html,
    )
    # Always log to backend logs as a fallback if email service is down (only first 2 chars masked)
    if not sent_id:
        logging.getLogger(__name__).warning(
            f"[ADMIN 2FA] Email send failed; code for {user['email']} (last 4): ****{code[-2:]}"
        )

    return LoginChallengeResponse(
        challenge_id=challenge_id,
        recovery_email_masked=_mask_email(recovery_email),
    )


@api_router.post("/admin/verify-2fa", response_model=LoginResponse)
async def admin_verify_2fa(payload: TwoFAVerifyRequest):
    """Step 2 of admin login: verify the 6-digit code → return JWT."""
    challenge = await db.admin_2fa_challenges.find_one(
        {"challenge_id": payload.challenge_id}, {"_id": 0}
    )
    if not challenge:
        raise HTTPException(status_code=404, detail="Login session expired — please sign in again.")
    if challenge.get("used"):
        raise HTTPException(status_code=400, detail="This code has already been used.")
    if challenge.get("attempts", 0) >= 5:
        raise HTTPException(status_code=429, detail="Too many incorrect attempts — please sign in again.")
    try:
        expires_at = datetime.fromisoformat(challenge["expires_at"])
    except Exception:
        expires_at = datetime.now(timezone.utc) - timedelta(seconds=1)
    if datetime.now(timezone.utc) > expires_at:
        raise HTTPException(status_code=400, detail="Code expired — please sign in again.")

    if not verify_password(payload.code, challenge["code_hash"]):
        await db.admin_2fa_challenges.update_one(
            {"challenge_id": payload.challenge_id},
            {"$inc": {"attempts": 1}},
        )
        raise HTTPException(status_code=401, detail="Invalid code — please try again.")

    await db.admin_2fa_challenges.update_one(
        {"challenge_id": payload.challenge_id},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    token = create_access_token(challenge["admin_email"])
    return LoginResponse(token=token, email=challenge["admin_email"])


@api_router.get("/admin/me")
async def admin_me(payload: dict = Depends(require_admin)):
    return {"email": payload.get('sub'), "role": payload.get('role')}


@api_router.get("/admin/account", response_model=AccountInfo)
async def get_admin_account(payload: dict = Depends(require_admin)):
    user = await db.admin_users.find_one({"email": payload.get('sub')}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    return AccountInfo(
        email=user["email"],
        recovery_email=user.get("recovery_email") or user["email"],
    )


@api_router.patch("/admin/account", response_model=AccountInfo)
async def update_admin_account(
    payload: AccountUpdateRequest,
    request: Request,
    auth: dict = Depends(require_admin),
):
    """Self-service: update email, password, and/or recovery email. Current password required."""
    user = await db.admin_users.find_one({"email": auth.get('sub')}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    if not verify_password(payload.current_password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail="Current password is incorrect")

    update_doc: dict = {}
    if payload.new_email and payload.new_email.lower() != user["email"]:
        new_email = payload.new_email.lower()
        # Make sure no other admin already has this email
        existing = await db.admin_users.find_one({"email": new_email})
        if existing:
            raise HTTPException(status_code=409, detail="That email is already in use.")
        update_doc["email"] = new_email
    if payload.new_password:
        update_doc["password_hash"] = hash_password(payload.new_password)
    if payload.recovery_email:
        update_doc["recovery_email"] = payload.recovery_email.lower()
    if not update_doc:
        raise HTTPException(status_code=400, detail="No changes provided.")
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()

    await db.admin_users.update_one({"email": user["email"]}, {"$set": update_doc})

    # Notify both old and new recovery email about the change (security best practice)
    final_email = update_doc.get("email", user["email"])
    final_recovery = update_doc.get("recovery_email", user.get("recovery_email") or user["email"])
    notify_targets = {user.get("recovery_email") or user["email"], final_recovery, final_email}
    notify_targets = [e for e in notify_targets if e]
    changes = []
    if "email" in update_doc:
        changes.append(f"sign-in email changed to <strong>{final_email}</strong>")
    if "password_hash" in update_doc:
        changes.append("password changed")
    if "recovery_email" in update_doc:
        changes.append(f"verification email changed to <strong>{final_recovery}</strong>")
    change_html = "<ul>" + "".join(f"<li>{c}</li>" for c in changes) + "</ul>"
    notify_html = f"""
    <div style="font-family:Arial,sans-serif;background:#0a0a0a;color:#fff;padding:32px;">
      <h2 style="color:#D4AF37;">TuranEliteLimo · Admin account changed</h2>
      <p>The following change was just made to your admin account:</p>
      {change_html}
      <p style="color:#aaa;font-size:13px;">If this wasn't you, change your password immediately and contact support.</p>
    </div>
    """
    for target in notify_targets:
        await send_email(
            to=target,
            subject="TuranEliteLimo admin account updated",
            html=notify_html,
        )

    refreshed = await db.admin_users.find_one({"email": final_email}, {"_id": 0})
    return AccountInfo(
        email=refreshed["email"],
        recovery_email=refreshed.get("recovery_email") or refreshed["email"],
    )


# ---------- Confirmation # helpers ----------
_CN_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no ambiguous chars (0/O, 1/I)


def _generate_confirmation_number() -> str:
    return "TEL-" + "".join(secrets.choice(_CN_ALPHABET) for _ in range(6))


async def _next_unique_confirmation_number() -> str:
    for _ in range(10):
        cn = _generate_confirmation_number()
        existing = await db.bookings.find_one({"confirmation_number": cn})
        if not existing:
            return cn
    return _generate_confirmation_number()  # extremely unlikely collision


def _generate_manage_token() -> str:
    """URL-safe random token (~22 chars) used in customer manage links."""
    return secrets.token_urlsafe(16)


def _frontend_origin_from_request(request: Request) -> str:
    """Best-effort: customer frontend origin (for emailed links)."""
    o = request.headers.get("origin") or request.headers.get("referer") or str(request.base_url)
    return o.rstrip("/").split("/admin")[0].split("/api")[0]


# ---------- Settings ----------
class Settings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    deposit_percent: int = Field(100, ge=0, le=100)
    currency: str = "usd"
    meet_greet_fee: float = Field(25.0, ge=0)
    service_fee_percent: float = Field(0.0, ge=0, le=20)  # 0 = OFF; covers Stripe processing


async def _load_settings() -> Settings:
    doc = await db.settings.find_one({"key": "global"}, {"_id": 0})
    if not doc:
        return Settings()
    return Settings(**doc)


@api_router.get("/admin/settings", response_model=Settings)
async def get_settings(_: dict = Depends(require_admin)):
    return await _load_settings()


@api_router.get("/settings/public")
async def get_public_settings():
    """Public read of safe settings for the booking form (service fee, currency)."""
    s = await _load_settings()
    return {
        "service_fee_percent": s.service_fee_percent,
        "currency": s.currency,
    }


class SettingsUpdate(BaseModel):
    deposit_percent: Optional[int] = Field(None, ge=0, le=100)
    currency: Optional[str] = None
    meet_greet_fee: Optional[float] = Field(None, ge=0)
    service_fee_percent: Optional[float] = Field(None, ge=0, le=20)


@api_router.patch("/admin/settings", response_model=Settings)
async def update_settings(payload: SettingsUpdate, _: dict = Depends(require_admin)):
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one(
        {"key": "global"},
        {"$set": {**update_doc, "key": "global"}},
        upsert=True,
    )
    return await _load_settings()


# ---------- Pricing helpers used by Stripe ----------
async def _compute_quote_amount(booking: dict) -> Optional[float]:
    """Re-run quote at confirmation time to derive a $ amount for Stripe checkout.
    Returns None for call-only vehicles."""
    if booking.get("quote_amount"):
        return float(booking["quote_amount"])
    pricing_map = await _load_pricing_map()
    cfg = pricing_map.get(booking["vehicle_type"])
    if not cfg or cfg.get("call_only"):
        return None

    # Surge event match by pickup_date (applies on top of base/hourly + zone surcharge)
    surge_events = await _load_surge_events()
    matched_event = _select_surge_event(booking.get("pickup_date"), surge_events)
    surge_mult, surge_flat = _surge_factors(matched_event)
    settings = await _load_settings()

    # Hourly bookings: hourly_rate × hours
    if booking.get("service_type") == "Hourly Chauffeur" and booking.get("hours"):
        rate = float(cfg.get("hourly_rate") or 0)
        if rate <= 0:
            return None
        price = rate * int(booking["hours"])
        price = _apply_surge(price, surge_mult, surge_flat)
        # Apply service fee transparently
        if settings.service_fee_percent and settings.service_fee_percent > 0:
            price += price * (settings.service_fee_percent / 100.0)
        return round(price, 2)

    pickup = await _geocode(booking["pickup_location"])
    dropoff = await _geocode(booking["dropoff_location"])
    if not pickup or not dropoff:
        return None
    miles = _haversine_miles(pickup["lat"], pickup["lon"], dropoff["lat"], dropoff["lon"])
    price = max(float(cfg["base"]) + float(cfg["per_mile"]) * miles, float(cfg["minimum"]))
    # Apply zone surcharge if applicable (same rule as live /quote endpoint)
    zones = await _load_zones()
    matched_zone = _select_surcharge_zone(
        booking["pickup_location"], booking["dropoff_location"], round(miles, 1), zones,
        pickup_coord=pickup, dropoff_coord=dropoff,
    )
    if matched_zone:
        price += float(matched_zone["surcharge_amount"])
    price = _apply_surge(price, surge_mult, surge_flat)
    # Meet & Greet flat fee (Airport Transfer only) — added AFTER surge, BEFORE service fee
    if booking.get("meet_and_greet") and booking.get("service_type") == "Airport Transfer":
        price += float(settings.meet_greet_fee or 0.0)
    # Service fee (transparent percentage on top)
    if settings.service_fee_percent and settings.service_fee_percent > 0:
        price += price * (settings.service_fee_percent / 100.0)
    return round(price, 2)


# ---------- Stripe Payments ----------
class CheckoutCreateRequest(BaseModel):
    booking_id: str
    origin_url: str


class CheckoutCreateResponse(BaseModel):
    url: str
    session_id: str
    amount: float


class PaymentStatus(BaseModel):
    payment_status: str  # paid | unpaid | pending | refunded
    booking_status: str
    amount: float
    currency: str
    confirmation_number: Optional[str] = None


@api_router.get("/bookings/{booking_id}/public")
async def get_public_booking(booking_id: str):
    """Sanitised booking view for the customer-facing /pay page."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    quote_amount = b.get("quote_amount")
    if not quote_amount:
        amt = await _compute_quote_amount(b)
        if amt is not None:
            quote_amount = amt
            await db.bookings.update_one({"id": booking_id}, {"$set": {"quote_amount": amt}})
    settings = await _load_settings()
    deposit_amount = round(float(quote_amount) * settings.deposit_percent / 100.0, 2) if quote_amount else None
    return {
        "id": b["id"],
        "confirmation_number": b.get("confirmation_number"),
        "status": b.get("status"),
        "payment_status": b.get("payment_status", "unpaid"),
        "full_name": b.get("full_name"),
        "email": b.get("email"),
        "service_type": b.get("service_type"),
        "vehicle_type": b.get("vehicle_type"),
        "pickup_date": b.get("pickup_date"),
        "pickup_time": b.get("pickup_time"),
        "pickup_location": b.get("pickup_location"),
        "dropoff_location": b.get("dropoff_location"),
        "passengers": b.get("passengers"),
        "luggage_count": b.get("luggage_count"),
        "child_seat": b.get("child_seat"),
        "return_trip": b.get("return_trip"),
        "return_location": b.get("return_location"),
        "additional_stops": b.get("additional_stops", []),
        "quote_amount": quote_amount,
        "deposit_amount": deposit_amount,
        "deposit_percent": settings.deposit_percent,
        "currency": settings.currency,
        "paid_amount": b.get("paid_amount"),
        "driver_name": b.get("driver_name"),
        "trip_status": b.get("trip_status"),
        "manage_token": b.get("manage_token"),
    }


def _get_stripe_checkout(request: Request) -> StripeCheckout:
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")
    host_url = str(request.base_url).rstrip("/")
    webhook_url = f"{host_url}/api/webhook/stripe"
    return StripeCheckout(api_key=api_key, webhook_url=webhook_url)


@api_router.post("/payments/checkout", response_model=CheckoutCreateResponse)
async def create_payment_checkout(payload: CheckoutCreateRequest, request: Request):
    booking = await db.bookings.find_one({"id": payload.booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("payment_status") == "paid":
        raise HTTPException(status_code=400, detail="Booking already paid")
    if booking.get("status") not in ("confirmed", "pending"):
        raise HTTPException(status_code=400, detail="Booking is not active")

    quote_amount = booking.get("quote_amount") or await _compute_quote_amount(booking)
    if quote_amount is None:
        raise HTTPException(
            status_code=400,
            detail="This vehicle requires a phone quote — call us to arrange payment.",
        )

    settings = await _load_settings()
    amount = round(float(quote_amount) * settings.deposit_percent / 100.0, 2)
    if amount < 0.5:
        raise HTTPException(status_code=400, detail="Amount too small to charge")

    # ----- Apply promo code (Phase 3) -----
    # The promo_code, if any, was captured at booking-creation time. We re-validate at
    # checkout to ensure it's still active and hasn't hit max uses.
    original_amount = amount
    discount_amount = 0.0
    applied_promo = None
    code_raw = (booking.get("promo_code") or "").strip()
    if code_raw:
        promo = await _validate_promo_for_booking(code_raw, original_amount, booking.get("email"))
        if promo.get("ok"):
            discount_amount = round(promo["discount"], 2)
            amount = round(original_amount - discount_amount, 2)
            applied_promo = promo["code"]
            if amount < 0.5:
                amount = 0.5
                discount_amount = round(original_amount - amount, 2)
        else:
            # Soft-fail: log and continue at full price. The customer already saw a
            # success badge at booking time; we don't want to surprise-fail on Stripe redirect.
            logger.warning(
                f"Promo '{code_raw}' rejected at checkout for {payload.booking_id}: {promo.get('reason')}"
            )

    # Generate confirmation # on first checkout (so it's locked in even before payment)
    booking_updates = {"quote_amount": quote_amount}
    if applied_promo:
        booking_updates["promo_code"] = applied_promo
        booking_updates["discount_amount"] = discount_amount
        booking_updates["original_quote_amount"] = original_amount
    if not booking.get("confirmation_number"):
        booking_updates["confirmation_number"] = await _next_unique_confirmation_number()
        booking["confirmation_number"] = booking_updates["confirmation_number"]

    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/pay/{payload.booking_id}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pay/{payload.booking_id}"

    checkout = _get_stripe_checkout(request)
    session = await checkout.create_checkout_session(
        CheckoutSessionRequest(
            amount=float(amount),
            currency=settings.currency,
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "booking_id": payload.booking_id,
                "confirmation_number": booking.get("confirmation_number") or "",
                "customer_email": booking.get("email") or "",
            },
        )
    )

    await db.payment_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "booking_id": payload.booking_id,
            "session_id": session.session_id,
            "amount": float(amount),
            "currency": settings.currency,
            "status": "initiated",
            "metadata": {
                "confirmation_number": booking.get("confirmation_number"),
                "customer_email": booking.get("email"),
            },
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )
    await db.bookings.update_one(
        {"id": payload.booking_id},
        {
            "$set": {
                **booking_updates,
                "payment_status": "pending",
                "payment_session_id": session.session_id,
            }
        },
    )

    return CheckoutCreateResponse(url=session.url, session_id=session.session_id, amount=float(amount))


@api_router.get("/payments/status/{session_id}", response_model=PaymentStatus)
async def get_payment_status(session_id: str, request: Request):
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Payment not found")

    booking = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
    new_status = txn.get("status")
    amount = float(txn.get("amount", 0))
    currency = txn.get("currency", "usd")

    # Try to fetch authoritative status from Stripe; degrade gracefully on failure.
    # We use TWO strategies in sequence: (1) the emergentintegrations SDK wrapper,
    # (2) direct REST call. The SDK has occasionally failed to retrieve live
    # sessions even though direct curl works — so the REST fallback is critical.
    status = None
    try:
        checkout = _get_stripe_checkout(request)
        status = await checkout.get_checkout_status(session_id)
    except Exception as e:
        logging.getLogger(__name__).warning(
            f"Stripe SDK status lookup failed for session {session_id}: {e}"
        )

    # Fallback: direct REST call to Stripe (bypasses the SDK)
    if status is None or getattr(status, "payment_status", None) != "paid":
        try:
            api_key = os.environ.get("STRIPE_API_KEY", "")
            if api_key:
                async with httpx.AsyncClient(timeout=10.0) as cli:
                    r = await cli.get(
                        f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                    if r.status_code == 200:
                        sj = r.json()

                        class _S:
                            pass

                        s = _S()
                        s.status = sj.get("status")
                        s.payment_status = sj.get("payment_status")
                        s.amount_total = sj.get("amount_total")
                        s.currency = sj.get("currency", "usd")
                        s.metadata = sj.get("metadata") or {}
                        status = s
                    else:
                        logging.getLogger(__name__).warning(
                            f"Stripe REST fallback failed for {session_id}: HTTP {r.status_code} {r.text[:200]}"
                        )
        except Exception as e:
            logging.getLogger(__name__).warning(
                f"Stripe REST fallback errored for {session_id}: {e}"
            )

    if status is not None:
        if getattr(status, "amount_total", None):
            amount = float(status.amount_total) / 100.0
        if getattr(status, "currency", None):
            currency = status.currency

        if status.payment_status == "paid" and txn.get("status") != "paid":
            new_status = "paid"
            await db.payment_transactions.update_one(
                {"session_id": session_id},
                {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
            )
            if booking and booking.get("payment_status") != "paid":
                # Generate manage token if not yet issued (legacy bookings)
                token = booking.get("manage_token") or _generate_manage_token()
                # Generate confirmation number now so the customer has one in their receipt
                cn = booking.get("confirmation_number") or await _next_unique_confirmation_number()
                # IMPORTANT: do NOT auto-confirm — admin reviews chauffeur availability first.
                # Status stays "pending" until admin explicitly confirms in the dashboard.
                await db.bookings.update_one(
                    {"id": txn["booking_id"]},
                    {
                        "$set": {
                            "payment_status": "paid",
                            "paid_amount": amount,
                            "paid_currency": currency,
                            "manage_token": token,
                            "confirmation_number": cn,
                            "quote_amount": booking.get("quote_amount") or amount,
                        }
                    },
                )
                updated = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
                if updated and not updated.get("paid_email_sent"):
                    client_origin = _frontend_origin_from_request(request)
                    manage_url = f"{client_origin}/manage/{updated.get('manage_token','')}"
                    # Send "Payment received, awaiting chauffeur confirmation" email
                    pending_html = render_payment_received_pending_email(updated, amount, manage_url=manage_url)
                    await send_email(
                        to=updated["email"],
                        subject=f"Payment received — confirming your chauffeur · {cn}",
                        html=pending_html,
                        bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
                    )
                    await db.bookings.update_one(
                        {"id": txn["booking_id"]},
                        {"$set": {"paid_email_sent": True}},
                    )
                    # SMS the admin/driver about the new paid booking (env-gated; no-op if Twilio unset)
                    admin_to = sms_service.admin_phone()
                    if admin_to:
                        await sms_service.send_sms(
                            admin_to, sms_service.render_new_paid_booking_sms(updated)
                        )
                    # Bump promo usage (Phase 3) — idempotent: only increments if the
                    # booking has a promo_code stamped on it from checkout.
                    promo_used = updated.get("promo_code")
                    if promo_used:
                        try:
                            await db.promos.update_one(
                                {"code": promo_used.upper()},
                                {"$inc": {"uses": 1, "total_discount_given": float(updated.get("discount_amount") or 0)}},
                            )
                        except Exception as e:
                            logger.warning(f"Promo usage bump failed for {promo_used}: {e}")
                    booking = updated
        elif getattr(status, "status", None) == "expired":
            new_status = "expired"
            await db.payment_transactions.update_one(
                {"session_id": session_id}, {"$set": {"status": "expired"}}
            )

    return PaymentStatus(
        payment_status=new_status or txn.get("status", "unknown"),
        booking_status=(booking.get("status") if booking else "unknown"),
        amount=amount,
        currency=currency,
        confirmation_number=(booking.get("confirmation_number") if booking else None),
    )


@api_router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    body = await request.body()
    checkout = _get_stripe_checkout(request)
    sig = request.headers.get("Stripe-Signature", "")
    try:
        event = await checkout.handle_webhook(body, sig)
    except Exception as e:
        logging.getLogger(__name__).warning(f"Stripe webhook verification failed: {e}")
        raise HTTPException(status_code=400, detail="Invalid signature")

    # Idempotent update on checkout.session.completed — works as a safety net so
    # the booking gets marked paid even if the customer's browser closes before
    # the frontend polling completes.
    if event and getattr(event, "session_id", None):
        sid = event.session_id
        txn = await db.payment_transactions.find_one({"session_id": sid}, {"_id": 0})
        if txn and event.payment_status == "paid" and txn.get("status") != "paid":
            booking = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
            await db.payment_transactions.update_one(
                {"session_id": sid},
                {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
            )
            if booking and booking.get("payment_status") != "paid":
                amount = float(txn.get("amount", 0))
                cn = booking.get("confirmation_number") or await _next_unique_confirmation_number()
                token = booking.get("manage_token") or _generate_manage_token()
                await db.bookings.update_one(
                    {"id": txn["booking_id"]},
                    {"$set": {
                        "payment_status": "paid",
                        "paid_amount": amount,
                        "paid_currency": txn.get("currency", "usd"),
                        "manage_token": token,
                        "confirmation_number": cn,
                        "quote_amount": booking.get("quote_amount") or amount,
                    }},
                )
                # Send payment-received email (best-effort)
                try:
                    updated = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
                    if updated and not updated.get("paid_email_sent"):
                        client_origin = _frontend_origin_from_request(request)
                        manage_url = f"{client_origin}/manage/{updated.get('manage_token','')}"
                        await send_email(
                            to=updated["email"],
                            subject=f"Payment received — confirming your chauffeur · {cn}",
                            html=render_payment_received_pending_email(updated, amount, manage_url=manage_url),
                            bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
                        )
                        await db.bookings.update_one(
                            {"id": txn["booking_id"]},
                            {"$set": {"paid_email_sent": True}},
                        )
                except Exception as e:
                    logging.getLogger(__name__).warning(f"Webhook paid-email failed: {e}")
    return {"received": True}


# ---------- Admin refund ----------
class RefundRequest(BaseModel):
    amount: Optional[float] = Field(None, ge=0)  # if None → full refund


@api_router.post("/admin/payments/{booking_id}/refund")
async def admin_refund(booking_id: str, payload: RefundRequest, _: dict = Depends(require_admin)):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Booking is not paid")
    sid = booking.get("payment_session_id")
    if not sid:
        raise HTTPException(status_code=400, detail="No Stripe session associated")

    api_key = os.environ.get("STRIPE_API_KEY", "")
    headers = {"Authorization": f"Bearer {api_key}"}

    # Resolve payment_intent from session (Stripe doesn't store pi on our side)
    async with httpx.AsyncClient(timeout=15.0) as cli:
        s = await cli.get(f"https://api.stripe.com/v1/checkout/sessions/{sid}", headers=headers)
        if s.status_code != 200:
            raise HTTPException(status_code=502, detail=f"Stripe lookup failed: {s.text}")
        pi = s.json().get("payment_intent")
        if not pi:
            raise HTTPException(status_code=400, detail="No payment intent on session")

        form = {"payment_intent": pi}
        if payload.amount is not None and payload.amount > 0:
            form["amount"] = str(int(round(payload.amount * 100)))
        r = await cli.post("https://api.stripe.com/v1/refunds", headers=headers, data=form)
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Refund failed: {r.text}")
        rj = r.json()

    refund_amount = (rj.get("amount") or 0) / 100.0
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {
                "payment_status": "refunded",
                "refund_amount": refund_amount,
                "payment_intent_id": pi,
            }
        },
    )
    return {"refunded": True, "amount": refund_amount, "stripe_refund_id": rj.get("id")}


@api_router.post("/admin/bookings/{booking_id}/force-sync-payment")
async def admin_force_sync_payment(
    booking_id: str, request: Request, _: dict = Depends(require_admin)
):
    """Emergency reconciliation: pull the booking's Stripe session via direct REST,
    and if Stripe says it's paid, force the booking + transaction into the paid
    state and fire the confirmation email + admin SMS. Bypasses the SDK entirely.
    """
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    sid = booking.get("payment_session_id")
    if not sid:
        raise HTTPException(status_code=400, detail="No Stripe session on this booking")

    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.get(
            f"https://api.stripe.com/v1/checkout/sessions/{sid}",
            headers={"Authorization": f"Bearer {api_key}"},
        )
    if r.status_code != 200:
        raise HTTPException(
            status_code=502, detail=f"Stripe lookup failed: HTTP {r.status_code} {r.text[:200]}"
        )
    sess = r.json()
    stripe_payment_status = sess.get("payment_status")
    amount_total = sess.get("amount_total") or 0
    amount = float(amount_total) / 100.0
    currency = sess.get("currency", "usd")

    if stripe_payment_status != "paid":
        return {
            "reconciled": False,
            "stripe_payment_status": stripe_payment_status,
            "stripe_session_status": sess.get("status"),
            "message": f"Stripe says payment_status='{stripe_payment_status}'. Nothing to reconcile.",
        }

    # Stripe says paid — drive the booking + txn into the paid state idempotently.
    await db.payment_transactions.update_one(
        {"session_id": sid},
        {
            "$set": {
                "status": "paid",
                "paid_at": datetime.now(timezone.utc).isoformat(),
                "amount": amount,
                "currency": currency,
            }
        },
        upsert=True,
    )

    if booking.get("payment_status") != "paid":
        token = booking.get("manage_token") or _generate_manage_token()
        cn = booking.get("confirmation_number") or await _next_unique_confirmation_number()
        await db.bookings.update_one(
            {"id": booking_id},
            {
                "$set": {
                    "payment_status": "paid",
                    "paid_amount": amount,
                    "paid_currency": currency,
                    "manage_token": token,
                    "confirmation_number": cn,
                    "quote_amount": booking.get("quote_amount") or amount,
                }
            },
        )
        updated = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if updated and not updated.get("paid_email_sent"):
            client_origin = _frontend_origin_from_request(request)
            manage_url = f"{client_origin}/manage/{updated.get('manage_token','')}"
            try:
                await send_email(
                    to=updated["email"],
                    subject=f"Payment received — confirming your chauffeur · {cn}",
                    html=render_payment_received_pending_email(updated, amount, manage_url=manage_url),
                    bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
                )
                await db.bookings.update_one(
                    {"id": booking_id}, {"$set": {"paid_email_sent": True}}
                )
            except Exception as e:
                logging.getLogger(__name__).warning(f"force-sync email failed: {e}")
            try:
                admin_to = sms_service.admin_phone()
                if admin_to:
                    await sms_service.send_sms(
                        admin_to, sms_service.render_new_paid_booking_sms(updated)
                    )
            except Exception as e:
                logging.getLogger(__name__).warning(f"force-sync admin SMS failed: {e}")

    return {
        "reconciled": True,
        "stripe_payment_status": "paid",
        "amount": amount,
        "currency": currency,
        "confirmation_number": (await db.bookings.find_one({"id": booking_id}, {"_id": 0})).get(
            "confirmation_number"
        ),
    }


# ---------- Admin protected: bookings ----------
@api_router.get("/admin/bookings", response_model=List[Booking])
async def list_bookings(_: dict = Depends(require_admin)):
    # Auto-cancel abandoned Stripe checkouts so the dashboard stays clean.
    # A booking is "abandoned" when: customer started Stripe checkout but never
    # completed it (payment_status="pending"), booking is still "pending", and it
    # was created more than 2 hours ago. Admin-created cash bookings (payment_status
    # stays "unpaid") are intentionally untouched.
    cutoff = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
    await db.bookings.update_many(
        {
            "status": "pending",
            "payment_status": "pending",
            "created_at": {"$lt": cutoff},
        },
        {
            "$set": {
                "status": "cancelled",
                "cancellation_reason": "Checkout abandoned (auto-cleaned)",
            }
        },
    )

    cursor = db.bookings.find({}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(1000)
    return [Booking(**i) for i in items]


@api_router.patch("/admin/bookings/{booking_id}", response_model=Booking)
async def update_booking_status(
    booking_id: str,
    payload: BookingStatusUpdate,
    request: Request,
    _: dict = Depends(require_admin),
):
    if payload.status not in BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {BOOKING_STATUSES}")

    update_doc = {"status": payload.status}
    if payload.status == "completed":
        update_doc["completed_at"] = datetime.now(timezone.utc).isoformat()

    # Generate confirmation number on first transition to "confirmed"
    if payload.status == "confirmed":
        existing = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Booking not found")
        if not existing.get("confirmation_number"):
            update_doc["confirmation_number"] = await _next_unique_confirmation_number()
        if not existing.get("manage_token"):
            update_doc["manage_token"] = _generate_manage_token()
        # Snapshot current quote so the customer pays the price they were quoted
        if not existing.get("quote_amount"):
            amt = await _compute_quote_amount(existing)
            if amt is not None:
                update_doc["quote_amount"] = amt

    result = await db.bookings.find_one_and_update(
        {"id": booking_id},
        {"$set": update_doc},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Booking not found")

    # Send confirmation email when transitioning to "confirmed"
    if payload.status == "confirmed":
        client_origin = _frontend_origin_from_request(request)
        already_paid = result.get("payment_status") == "paid"
        manage_url = (
            f"{client_origin}/manage/{result.get('manage_token')}" if result.get("manage_token") else None
        )
        html = render_confirmation_email(result, manage_url=manage_url)
        subject = (
            f"Your chauffeur is confirmed — {result.get('confirmation_number','')}"
            if already_paid
            else f"Reservation confirmed — {result.get('confirmation_number','')}"
        )
        await send_email(
            to=result["email"],
            subject=subject,
            html=html,
            bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
        )

    # When admin transitions to "cancelled", email the customer (with optional reason
    # supplied by the admin) and stamp the reason on the booking.
    if payload.status == "cancelled":
        reason = (payload.reason or "").strip()
        if reason and not result.get("cancellation_reason"):
            await db.bookings.update_one(
                {"id": booking_id},
                {"$set": {"cancellation_reason": reason}},
            )
            result["cancellation_reason"] = reason
        already_paid = result.get("payment_status") == "paid"
        manage_url = (
            f"{_frontend_origin_from_request(request)}/manage/{result.get('manage_token')}"
            if result.get("manage_token") else None
        )
        html = render_cancellation_email(
            result,
            admin_reason=reason or None,
            refund_pending=already_paid,
            manage_url=manage_url,
        )
        await send_email(
            to=result["email"],
            subject=f"Your reservation has been cancelled — {result.get('confirmation_number','')}",
            html=html,
            bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
        )

    return Booking(**result)


@api_router.delete("/admin/bookings/{booking_id}")
async def delete_booking(booking_id: str, _: dict = Depends(require_admin)):
    res = await db.bookings.delete_one({"id": booking_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"deleted": True}


# ---------- Admin protected: pricing ----------
class PricingRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vehicle_type: str
    base: float = 0.0
    per_mile: float = 0.0
    minimum: float = 0.0
    hourly_rate: float = 0.0
    call_only: bool = False
    updated_at: Optional[str] = None


class PricingUpdate(BaseModel):
    base: Optional[float] = Field(None, ge=0)
    per_mile: Optional[float] = Field(None, ge=0)
    minimum: Optional[float] = Field(None, ge=0)
    hourly_rate: Optional[float] = Field(None, ge=0)
    call_only: Optional[bool] = None


@api_router.get("/admin/pricing", response_model=List[PricingRow])
async def list_pricing(_: dict = Depends(require_admin)):
    cursor = db.pricing_config.find({}, {"_id": 0})
    rows = await cursor.to_list(50)
    by_vt = {r["vehicle_type"]: r for r in rows}
    # Maintain canonical order matching VEHICLE_TYPES
    ordered = [by_vt[v] for v in VEHICLE_TYPES if v in by_vt]
    return [PricingRow(**r) for r in ordered]


@api_router.patch("/admin/pricing/{vehicle_type}", response_model=PricingRow)
async def update_pricing(
    vehicle_type: str,
    payload: PricingUpdate,
    _: dict = Depends(require_admin),
):
    if vehicle_type not in VEHICLE_TYPES:
        raise HTTPException(status_code=400, detail=f"Unknown vehicle_type. Must be one of {VEHICLE_TYPES}")
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.pricing_config.find_one_and_update(
        {"vehicle_type": vehicle_type},
        {"$set": update_doc},
        return_document=True,
        projection={"_id": 0},
        upsert=True,
    )
    return PricingRow(**result)


# ---------- Admin protected: zone surcharges ----------
class ZoneRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str = Field(..., min_length=2, max_length=80)
    match_type: str = "keyword_short"  # "keyword_short" or "outside_radius"
    keywords: List[str] = Field(default_factory=list)
    surcharge_amount: float = Field(0.0, ge=0)
    short_distance_threshold_miles: float = Field(20.0, ge=0, le=200)
    radius_miles: float = Field(0.0, ge=0, le=500)
    reason: str = Field("", max_length=600)
    enabled: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class ZoneCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    match_type: str = Field("keyword_short", pattern="^(keyword_short|outside_radius)$")
    keywords: List[str] = Field(default_factory=list)
    surcharge_amount: float = Field(0.0, ge=0)
    short_distance_threshold_miles: float = Field(20.0, ge=0, le=200)
    radius_miles: float = Field(0.0, ge=0, le=500)
    reason: str = Field("", max_length=600)
    enabled: bool = True


class ZoneUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=80)
    match_type: Optional[str] = Field(None, pattern="^(keyword_short|outside_radius)$")
    keywords: Optional[List[str]] = None
    surcharge_amount: Optional[float] = Field(None, ge=0)
    short_distance_threshold_miles: Optional[float] = Field(None, ge=0, le=200)
    radius_miles: Optional[float] = Field(None, ge=0, le=500)
    reason: Optional[str] = Field(None, max_length=600)
    enabled: Optional[bool] = None


@api_router.get("/admin/zones", response_model=List[ZoneRow])
async def list_zones(_: dict = Depends(require_admin)):
    rows = await _load_zones()
    rows.sort(key=lambda z: z.get("name", "").lower())
    return [ZoneRow(**r) for r in rows]


@api_router.post("/admin/zones", response_model=ZoneRow)
async def create_zone(payload: ZoneCreate, _: dict = Depends(require_admin)):
    existing = await db.zone_surcharges.find_one({"name": payload.name.strip()})
    if existing:
        raise HTTPException(status_code=409, detail="A zone with that name already exists.")
    doc = payload.model_dump()
    doc["name"] = payload.name.strip()
    doc["keywords"] = [k.strip().lower() for k in (payload.keywords or []) if k.strip()]
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    await db.zone_surcharges.insert_one(doc.copy())
    return ZoneRow(**doc)


@api_router.patch("/admin/zones/{zone_id}", response_model=ZoneRow)
async def update_zone(zone_id: str, payload: ZoneUpdate, _: dict = Depends(require_admin)):
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if "keywords" in update_doc:
        update_doc["keywords"] = [k.strip().lower() for k in update_doc["keywords"] if k.strip()]
    if "name" in update_doc:
        update_doc["name"] = update_doc["name"].strip()
        # Reject name collision with another zone
        clash = await db.zone_surcharges.find_one(
            {"name": update_doc["name"], "id": {"$ne": zone_id}}
        )
        if clash:
            raise HTTPException(status_code=409, detail="Another zone already has that name.")
    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.zone_surcharges.find_one_and_update(
        {"id": zone_id},
        {"$set": update_doc},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Zone not found")
    return ZoneRow(**result)


@api_router.delete("/admin/zones/{zone_id}")
async def delete_zone(zone_id: str, _: dict = Depends(require_admin)):
    res = await db.zone_surcharges.delete_one({"id": zone_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")
    return {"ok": True}


# ---------- Admin protected: surge events (date-based pricing) ----------
class SurgeEventRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    name: str = Field(..., min_length=2, max_length=120)
    start_date: str  # YYYY-MM-DD
    end_date: str    # YYYY-MM-DD
    pricing_type: str = "multiplier"  # "multiplier" or "flat_surcharge"
    multiplier: float = Field(1.0, ge=0.1, le=10.0)
    flat_surcharge: float = Field(0.0, ge=0)
    reason: str = Field("", max_length=600)
    enabled: bool = True
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


class SurgeEventCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    start_date: str
    end_date: str
    pricing_type: str = Field("multiplier", pattern="^(multiplier|flat_surcharge)$")
    multiplier: float = Field(1.5, ge=0.1, le=10.0)
    flat_surcharge: float = Field(0.0, ge=0)
    reason: str = Field("", max_length=600)
    enabled: bool = True


class SurgeEventUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=120)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    pricing_type: Optional[str] = Field(None, pattern="^(multiplier|flat_surcharge)$")
    multiplier: Optional[float] = Field(None, ge=0.1, le=10.0)
    flat_surcharge: Optional[float] = Field(None, ge=0)
    reason: Optional[str] = Field(None, max_length=600)
    enabled: Optional[bool] = None


def _validate_date_range(start: str, end: str) -> None:
    from datetime import date as _date
    try:
        sd = _date.fromisoformat(start)
        ed = _date.fromisoformat(end)
    except Exception:
        raise HTTPException(status_code=400, detail="start_date and end_date must be YYYY-MM-DD.")
    if ed < sd:
        raise HTTPException(status_code=400, detail="end_date must be on or after start_date.")


@api_router.get("/admin/surge-events", response_model=List[SurgeEventRow])
async def list_surge_events(_: dict = Depends(require_admin)):
    rows = await _load_surge_events()
    rows.sort(key=lambda e: (e.get("start_date") or "", e.get("name", "").lower()))
    return [SurgeEventRow(**r) for r in rows]


@api_router.post("/admin/surge-events", response_model=SurgeEventRow)
async def create_surge_event(payload: SurgeEventCreate, _: dict = Depends(require_admin)):
    _validate_date_range(payload.start_date, payload.end_date)
    doc = payload.model_dump()
    doc["name"] = payload.name.strip()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    await db.surge_events.insert_one(doc.copy())
    return SurgeEventRow(**doc)


@api_router.patch("/admin/surge-events/{event_id}", response_model=SurgeEventRow)
async def update_surge_event(event_id: str, payload: SurgeEventUpdate, _: dict = Depends(require_admin)):
    update_doc = {k: v for k, v in payload.model_dump().items() if v is not None}
    if not update_doc:
        raise HTTPException(status_code=400, detail="No fields to update")
    # Validate date range if either side is being changed
    if "start_date" in update_doc or "end_date" in update_doc:
        existing = await db.surge_events.find_one({"id": event_id}, {"_id": 0})
        if not existing:
            raise HTTPException(status_code=404, detail="Surge event not found")
        new_start = update_doc.get("start_date", existing.get("start_date"))
        new_end = update_doc.get("end_date", existing.get("end_date"))
        _validate_date_range(new_start, new_end)
    update_doc["updated_at"] = datetime.now(timezone.utc).isoformat()
    result = await db.surge_events.find_one_and_update(
        {"id": event_id},
        {"$set": update_doc},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Surge event not found")
    return SurgeEventRow(**result)


@api_router.delete("/admin/surge-events/{event_id}")
async def delete_surge_event(event_id: str, _: dict = Depends(require_admin)):
    res = await db.surge_events.delete_one({"id": event_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Surge event not found")
    return {"ok": True}


# ---------- Admin protected: contact inquiries ----------
@api_router.get("/admin/contacts", response_model=List[ContactInquiry])
async def list_contacts(_: dict = Depends(require_admin)):
    cursor = db.contacts.find({}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(1000)
    return [ContactInquiry(**i) for i in items]


@api_router.patch("/admin/contacts/{contact_id}")
async def mark_contact(contact_id: str, payload: BookingStatusUpdate, _: dict = Depends(require_admin)):
    result = await db.contacts.find_one_and_update(
        {"id": contact_id},
        {"$set": {"status": payload.status}},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    return ContactInquiry(**result)


@api_router.delete("/admin/contacts/{contact_id}")
async def delete_contact(contact_id: str, _: dict = Depends(require_admin)):
    res = await db.contacts.delete_one({"id": contact_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    return {"deleted": True}


@api_router.get("/admin/stats")
async def admin_stats(_: dict = Depends(require_admin)):
    total = await db.bookings.count_documents({})
    pending = await db.bookings.count_documents({"status": "pending"})
    confirmed = await db.bookings.count_documents({"status": "confirmed"})
    completed = await db.bookings.count_documents({"status": "completed"})
    inquiries = await db.contacts.count_documents({})
    return {
        "total_bookings": total,
        "pending": pending,
        "confirmed": confirmed,
        "completed": completed,
        "inquiries": inquiries,
    }


# Register router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


@app.on_event("startup")
async def startup_seed():
    # Indexes
    try:
        await db.admin_users.create_index("email", unique=True)
        await db.bookings.create_index("id", unique=True)
        await db.bookings.create_index("confirmation_number", sparse=True)
        await db.bookings.create_index("manage_token", sparse=True)
        await db.bookings.create_index("driver_token", sparse=True)
        await db.contacts.create_index("id", unique=True)
        await db.pricing_config.create_index("vehicle_type", unique=True)
        await db.payment_transactions.create_index("session_id", unique=True)
        await db.payment_transactions.create_index("booking_id")
        await db.settings.create_index("key", unique=True)
        await db.admin_2fa_challenges.create_index("challenge_id", unique=True)
        # Auto-purge expired/used 2FA challenges after 24h
        await db.admin_2fa_challenges.create_index(
            "created_at", expireAfterSeconds=60 * 60 * 24,
        )
        await db.zone_surcharges.create_index("name", unique=True)
        await db.surge_events.create_index("id", unique=True)
        await db.surge_events.create_index([("start_date", 1), ("end_date", 1)])
    except Exception as e:
        logger.warning(f"Index creation skipped: {e}")

    # Seed default settings (idempotent)
    await db.settings.update_one(
        {"key": "global"},
        {
            "$setOnInsert": {
                "key": "global",
                "deposit_percent": 100,
                "currency": "usd",
                "meet_greet_fee": 25.0,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        },
        upsert=True,
    )
    # Backfill meet_greet_fee for legacy settings docs that pre-date this field
    try:
        await db.settings.update_one(
            {"key": "global", "meet_greet_fee": {"$exists": False}},
            {"$set": {"meet_greet_fee": 25.0}},
        )
    except Exception as e:
        logger.warning(f"meet_greet_fee backfill skipped: {e}")

    # Migration: rename legacy "Luxury Sedan" → "S-Class" in existing bookings
    try:
        res = await db.bookings.update_many(
            {"vehicle_type": "Luxury Sedan"},
            {"$set": {"vehicle_type": "S-Class"}},
        )
        if res.modified_count:
            logger.info(f"Migrated {res.modified_count} bookings: Luxury Sedan -> S-Class")
        # Drop any legacy pricing row for old name so it doesn't pollute admin UI
        await db.pricing_config.delete_one({"vehicle_type": "Luxury Sedan"})
    except Exception as e:
        logger.warning(f"Vehicle rename migration skipped: {e}")

    # Seed pricing rows (idempotent — only create rows that are missing)
    for vt, defaults in DEFAULT_VEHICLE_PRICING.items():
        await db.pricing_config.update_one(
            {"vehicle_type": vt},
            {
                "$setOnInsert": {
                    "vehicle_type": vt,
                    **defaults,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )

    # Seed zone surcharges (idempotent — keyed by name)
    for zone in DEFAULT_ZONES:
        await db.zone_surcharges.update_one(
            {"name": zone["name"]},
            {
                "$setOnInsert": {
                    "id": str(uuid.uuid4()),
                    **zone,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                }
            },
            upsert=True,
        )

    # Backfill match_type for legacy zones (default to "keyword_short")
    try:
        await db.zone_surcharges.update_many(
            {"match_type": {"$exists": False}},
            {"$set": {"match_type": "keyword_short", "radius_miles": 0.0}},
        )
    except Exception as e:
        logger.warning(f"zone match_type backfill skipped: {e}")

    # Migration: backfill hourly_rate on existing pricing rows that pre-date this column.
    # Uses default hourly_rate from DEFAULT_VEHICLE_PRICING; admins can edit afterwards.
    try:
        for vt, defaults in DEFAULT_VEHICLE_PRICING.items():
            await db.pricing_config.update_one(
                {"vehicle_type": vt, "hourly_rate": {"$exists": False}},
                {"$set": {"hourly_rate": defaults["hourly_rate"]}},
            )
    except Exception as e:
        logger.warning(f"hourly_rate backfill skipped: {e}")

    # Seed admin (idempotent + migration-safe + self-healing).
    # Goal: end every startup with EXACTLY ONE admin account whose email matches
    # the configured ADMIN_EMAIL env var. Any orphan records are renamed or removed.
    email = ADMIN_EMAIL.lower()
    target = await db.admin_users.find_one({"email": email})
    other_admins = await db.admin_users.find({"email": {"$ne": email}}).to_list(50)

    if target is None:
        if other_admins:
            # No admin at the target email yet, but there's at least one other
            # admin (e.g., the legacy gmail). Rename the FIRST one to the target
            # email — preserves their password & 2FA setup.
            legacy = other_admins[0]
            await db.admin_users.update_one(
                {"email": legacy["email"]},
                {"$set": {
                    "email": email,
                    "recovery_email": email,
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                }},
            )
            logger.info(f"Renamed admin {legacy['email']} → {email}")
            # Delete any REMAINING extras (rare but possible)
            for extra in other_admins[1:]:
                await db.admin_users.delete_one({"email": extra["email"]})
                logger.warning(f"Removed orphan admin {extra['email']}")
        else:
            # No admin exists at all — fresh install. Seed one.
            await db.admin_users.insert_one({
                "email": email,
                "password_hash": hash_password(ADMIN_PASSWORD),
                "recovery_email": email,
                "role": "admin",
                "created_at": datetime.now(timezone.utc).isoformat(),
            })
            logger.info(f"Seeded admin user: {email}")
    else:
        # Target admin exists. Clean up any other admin records left behind
        # (e.g., from prior migrations that didn't fully run).
        for extra in other_admins:
            await db.admin_users.delete_one({"email": extra["email"]})
            logger.warning(f"Removed orphan admin {extra['email']}")
        # Backfill recovery_email if missing
        if not target.get("recovery_email"):
            await db.admin_users.update_one(
                {"email": email},
                {"$set": {"recovery_email": email}},
            )

    # Start background scheduler for review-request emails (24h after status=completed)
    global _scheduler
    try:
        from apscheduler.schedulers.asyncio import AsyncIOScheduler
        _scheduler = AsyncIOScheduler(timezone="UTC")
        _scheduler.add_job(
            _send_pending_review_requests,
            "interval",
            minutes=30,
            id="review_request_email",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=60),
        )
        _scheduler.start()
        logger.info("Review-request scheduler started (runs every 30 min).")
    except Exception as e:
        logger.warning(f"Scheduler failed to start: {e}")


async def _send_pending_review_requests():
    """Background job: scan completed bookings older than 24h that haven't been
    sent a review-request email, and send one. Runs every 30 minutes."""
    try:
        cutoff = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
        cursor = db.bookings.find(
            {
                "status": "completed",
                "review_request_sent_at": {"$exists": False},
                "$or": [
                    {"completed_at": {"$lte": cutoff}},
                    # Fallback: use created_at if completed_at wasn't recorded
                    {"completed_at": {"$exists": False}, "created_at": {"$lte": cutoff}},
                ],
            },
            {"_id": 0},
        )
        bookings = await cursor.to_list(50)
        if not bookings:
            return
        links = reviews_service.review_links()
        for b in bookings:
            try:
                html = render_review_request_email(b, links["google"], links["yelp"])
                sent_id = await send_email(
                    to=b["email"],
                    subject="How was your ride with TuranEliteLimo?",
                    html=html,
                )
                if sent_id is not None:
                    await db.bookings.update_one(
                        {"id": b["id"]},
                        {"$set": {
                            "review_request_sent_at": datetime.now(timezone.utc).isoformat(),
                        }},
                    )
                    logger.info(f"Review-request sent for booking {b.get('id')}")
            except Exception as e:
                logger.warning(f"Review-request send failed for {b.get('id')}: {e}")
    except Exception as e:
        logger.warning(f"_send_pending_review_requests failed: {e}")


_scheduler = None


@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        if _scheduler is not None:
            _scheduler.shutdown(wait=False)
    except Exception:
        pass
    client.close()
