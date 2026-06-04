from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import math
import re
import secrets
import string
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Dict, Any
from urllib.parse import urlencode

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
    render_wait_time_charge_email,
    send_admin_sms,
    SUPPORT_EMAIL,
)
import sms_service
import reviews_service
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request
from fastapi.responses import Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr, field_validator


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


def create_customer_token(customer_id: str, email: str) -> str:
    """Mobile-app customer JWT (separate from admin scope)."""
    payload = {
        'sub': email,
        'customer_id': customer_id,
        'role': 'customer',
        'exp': datetime.now(timezone.utc) + timedelta(days=30),
        'type': 'access',
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def require_customer(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get('role') != 'customer':
        raise HTTPException(status_code=403, detail="Customer access required")
    return payload


# ---------- Models ----------
VEHICLE_TYPES = [
    "Executive Sedan",
    "First Class",
    "Luxury SUV",
    "Stretch Limousine",
    "Sprinter Van",
    "Executive Sprinter",
    "Jet Sprinter",
    "Party Bus",
]

# Default pricing seeded into MongoDB on first startup (admins can edit live).
DEFAULT_VEHICLE_PRICING = {
    "Executive Sedan":    {"base": 75.0,  "per_mile": 3.50, "minimum": 85.0,  "hourly_rate": 95.0,  "wait_minute_rate": 1.00, "call_only": False},
    "First Class":        {"base": 95.0,  "per_mile": 4.50, "minimum": 115.0, "hourly_rate": 125.0, "wait_minute_rate": 1.25, "call_only": False},
    "Luxury SUV":         {"base": 115.0, "per_mile": 4.75, "minimum": 135.0, "hourly_rate": 145.0, "wait_minute_rate": 1.50, "call_only": False},
    "Stretch Limousine":  {"base": 0.0,   "per_mile": 0.0,  "minimum": 0.0,   "hourly_rate": 0.0,   "wait_minute_rate": 2.00, "call_only": True},
    "Sprinter Van":       {"base": 0.0,   "per_mile": 0.0,  "minimum": 0.0,   "hourly_rate": 0.0,   "wait_minute_rate": 2.00, "call_only": True},
    "Executive Sprinter": {"base": 0.0,   "per_mile": 0.0,  "minimum": 0.0,   "hourly_rate": 0.0,   "wait_minute_rate": 2.00, "call_only": True},
    "Jet Sprinter":       {"base": 0.0,   "per_mile": 0.0,  "minimum": 0.0,   "hourly_rate": 0.0,   "wait_minute_rate": 2.25, "call_only": True},
    "Party Bus":          {"base": 0.0,   "per_mile": 0.0,  "minimum": 0.0,   "hourly_rate": 0.0,   "wait_minute_rate": 2.50, "call_only": True},
}

# Hourly bookings include this many miles per hour at no extra charge
HOURLY_MILES_INCLUDED_PER_HOUR = 20

# Headquarters coordinates (Millbrae, CA) — used as default center for radius-based zones.
HQ_LAT = 37.5985
HQ_LON = -122.3873

SERVICE_TYPES = [
    "Airport Transfer",
    "A to B Transfer",
    "Hourly Chauffeur",
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
    wait_time_consent: bool = False  # MUST be true — frontend enforces, backend re-validates


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
    # Forensic provenance — who cancelled and when. Set at the moment of cancellation.
    #   "auto_abandoned" -> background sweep (unpaid Stripe checkout, >72h old)
    #   "customer_web"   -> customer used /manage/<token> link
    #   "mobile_app"     -> customer used the mobile app
    #   "admin"          -> admin used the dashboard
    cancellation_source: Optional[str] = None
    cancelled_at: Optional[str] = None
    cancelled_by_admin_email: Optional[str] = None
    auto_cancelled_at: Optional[str] = None  # legacy field kept for back-compat with older sweeps
    payment_reminder_sent_at: Optional[str] = None  # "your reservation needs payment" email at ~23h
    completed_at: Optional[str] = None
    status: str = "pending"
    confirmation_number: Optional[str] = None
    payment_status: str = "unpaid"  # unpaid | pending | paid | refunded
    payment_session_id: Optional[str] = None
    payment_intent_id: Optional[str] = None
    # Unread tracking — like an email inbox. New paid bookings appear bold in
    # the admin dashboard until the admin opens the details dialog at which
    # point is_read flips true.
    is_read: bool = False
    read_at: Optional[str] = None
    # Checkout health / retry tracking — surfaces a badge in admin if a
    # customer keeps hitting "something went wrong" on the Stripe redirect.
    checkout_attempts: int = 0
    checkout_failures: int = 0
    last_checkout_error: Optional[str] = None
    last_checkout_error_at: Optional[str] = None
    last_checkout_attempt_at: Optional[str] = None
    payment_recovery_sent_at: Optional[str] = None
    paid_amount: Optional[float] = None
    paid_currency: Optional[str] = None
    quote_amount: Optional[float] = None  # snapshot of quoted price at booking time
    refund_amount: Optional[float] = None
    # Driver dispatch (Phase 1)
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    driver_email: Optional[str] = None
    driver_plate: Optional[str] = None
    driver_vehicle: Optional[str] = None
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
    # Wait time / no-show (Phase 2b)
    wait_time_consent: bool = False
    stripe_customer_id: Optional[str] = None
    stripe_payment_method_id: Optional[str] = None
    stripe_payment_intent_id: Optional[str] = None
    flight_landed_at: Optional[str] = None  # ISO timestamp — driver records this for airport trips
    wait_time_minutes: Optional[int] = None
    wait_time_fee_amount: Optional[float] = None
    wait_time_charged_at: Optional[str] = None
    wait_time_minutes_pending: Optional[int] = None
    wait_time_recorded_at: Optional[str] = None
    wait_time_payment_intent_id: Optional[str] = None
    damage_charges: List[dict] = Field(default_factory=list)
    mid_trip_stops: List[dict] = Field(default_factory=list)
    no_show: bool = False
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


@api_router.get("/places/geocode")
async def places_geocode(address: str = ""):
    """Resolve an address string to lat/lng for the rider home map preview."""
    q = (address or "").strip()
    if len(q) < 3:
        return {"lat": None, "lng": None}
    if not GOOGLE_MAPS_API_KEY:
        return {"lat": None, "lng": None, "error": "Google API key not configured"}
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get(
                "https://maps.googleapis.com/maps/api/geocode/json",
                params={"address": q, "key": GOOGLE_MAPS_API_KEY, "region": "us"},
            )
            data = r.json()
    except Exception as e:
        logging.getLogger(__name__).warning(f"Geocode failed: {e}")
        return {"lat": None, "lng": None, "error": "lookup_failed"}
    results = data.get("results") or []
    if not results:
        return {"lat": None, "lng": None}
    loc = (results[0].get("geometry") or {}).get("location") or {}
    return {
        "lat": loc.get("lat"),
        "lng": loc.get("lng"),
        "formatted_address": results[0].get("formatted_address") or q,
    }


# ---------- Admin: mark booking as read (unread tracking) ----------
@api_router.post("/admin/bookings/{booking_id}/mark-read")
async def admin_mark_booking_read(booking_id: str, _: dict = Depends(require_admin)):
    """Flip is_read=True on a booking so the admin UI stops highlighting it.
    Used for unread-indicator pattern (like unread emails)."""
    r = await db.bookings.update_one(
        {"id": booking_id, "is_read": {"$ne": True}},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "marked": r.modified_count}




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
    if not payload.wait_time_consent:
        raise HTTPException(
            status_code=400,
            detail="Please accept the wait time policy to continue.",
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

    # ----- Admin SMS alert via carrier email-to-SMS gateway (fire-and-forget) -----
    try:
        cn_short = doc.get("confirmation_number") or doc["id"][:8]
        # Plain text, < 300 chars. Phone numbers + addresses auto-link in iOS Messages.
        sms_text = (
            f"NEW BOOKING #{cn_short}\n"
            f"{doc.get('full_name','')} · {doc.get('phone','')}\n"
            f"{doc.get('pickup_date','')} {doc.get('pickup_time','')}\n"
            f"Pick: {doc.get('pickup_location','')[:60]}\n"
            f"Drop: {doc.get('dropoff_location','')[:60]}\n"
            f"{doc.get('vehicle_type','')} · ${doc.get('quote_amount',0):.0f}"
        )
        await send_admin_sms(sms_text)
    except Exception as e:
        logger.warning(f"Admin SMS for new booking failed: {e}")

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
    additional_stops_count: int = Field(0, ge=0, le=10)  # # of extra stops; priced via Settings.per_stop_fee
    additional_stops: List[str] = Field(default_factory=list)  # actual addresses, used to extend the priced route


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
    per_stop_fee: Optional[float] = None  # current Settings.per_stop_fee (for display)
    stop_fee_total: Optional[float] = None  # actual $ added to each priced quote for the # of stops
    additional_stops_count: Optional[int] = None
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
    addon_tags: Optional[List[str]] = None,
) -> List[VehicleQuote]:
    quotes: List[VehicleQuote] = []
    has_event = surge_mult != 1.0 or surge_flat > 0
    addon_tags = addon_tags or []
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
        # Add-on (e.g., Meet & Greet, per-stop fee) is added AFTER surge as a flat add
        if addon_flat > 0:
            price += addon_flat
        price = round(price, 2)
        tags = []
        if surcharge > 0:
            tags.append("long-distance area")
        if has_event:
            tags.append("event surge")
        tags.extend(addon_tags)
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

    # Per-stop flat fee — applies to every additional stop on transfer-type trips
    # (skipped for hourly bookings, which already cover stops via the hourly clock).
    per_stop_fee = float(settings.per_stop_fee or 0.0)
    stops_count = int(payload.additional_stops_count or 0)
    is_hourly_q = payload.service_type == "Hourly Chauffeur"
    stop_fee_total = 0.0 if is_hourly_q else round(per_stop_fee * stops_count, 2)
    # Combined flat add-on that gets bolted onto every priced vehicle quote
    addon_flat_total = round(mg_fee + stop_fee_total, 2)
    addon_tags: List[str] = []
    if mg_fee > 0:
        addon_tags.append("meet & greet")
    if stop_fee_total > 0:
        addon_tags.append(f"{stops_count} stop{'s' if stops_count > 1 else ''}")

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
            per_stop_fee=per_stop_fee if per_stop_fee > 0 else None,
            additional_stops_count=stops_count or None,
        ), settings.service_fee_percent)

    pickup = await _geocode(payload.pickup_location)
    dropoff = await _geocode(payload.dropoff_location)
    if not pickup or not dropoff:
        return _apply_service_fee_to_quote_response(QuoteResponse(
            quotes=_build_quotes(None, pricing_map, addon_flat=addon_flat_total, addon_tags=addon_tags),
            fallback=True,
            meet_and_greet_fee=mg_fee if mg_fee > 0 else None,
            per_stop_fee=per_stop_fee if per_stop_fee > 0 else None,
            stop_fee_total=stop_fee_total if stop_fee_total > 0 else None,
            additional_stops_count=stops_count or None,
        ), settings.service_fee_percent)

    miles = _haversine_miles(pickup["lat"], pickup["lon"], dropoff["lat"], dropoff["lon"])
    # Extend the priced route through any pre-booked additional stops so the
    # detour mileage is reflected in the per-mile portion of the quote (not just
    # the flat per-stop fee). Hourly is excluded — its mileage is bundled.
    if (
        not is_hourly_q
        and payload.additional_stops
        and len(payload.additional_stops) > 0
    ):
        stop_coords = await _resolve_coords_for_addresses(payload.additional_stops)
        if stop_coords:
            miles = _route_total_miles(pickup, stop_coords, dropoff)
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
            addon_flat=addon_flat_total,
            addon_tags=addon_tags,
        ),
        fallback=False,
        surcharge_applied=surcharge_info,
        surge_applied=surge_info,
        meet_and_greet_fee=mg_fee if mg_fee > 0 else None,
        per_stop_fee=per_stop_fee if per_stop_fee > 0 else None,
        stop_fee_total=stop_fee_total if stop_fee_total > 0 else None,
        additional_stops_count=stops_count or None,
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


class CustomerModifyBookingRequest(BaseModel):
    """All fields are optional — only the keys the customer sends get updated.
    The mobile app sends just the fields that changed."""
    pickup_datetime: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    vehicle_type: Optional[str] = None
    passengers: Optional[int] = Field(None, ge=1, le=30)
    notes: Optional[str] = Field(None, max_length=1000)


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
    now_iso = datetime.now(timezone.utc).isoformat()
    update_doc = {
        "cancellation_requested": True,
        "cancellation_reason": (payload.reason or "")[:500],
        "cancellation_requested_at": now_iso,
        "cancellation_source": "customer_web",
    }
    if not is_paid:
        update_doc["status"] = "cancelled"
        update_doc["cancelled_at"] = now_iso
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
    driver_vehicle: Optional[str] = ""  # e.g., "Mercedes S-Class · Black"
    notify_customer: bool = True  # send email to customer with chauffeur details


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

    # Link by phone, email, OR name (more tolerant — admin form input can have
    # small variations like trailing spaces or different phone formats). The
    # driver's mobile app fetches trips strictly by driver_id, so failing to
    # link here means the trip won't appear AND live location won't mirror.
    linked_driver = None
    norm_phone = re.sub(r"[^\d+]", "", payload.driver_phone.strip())
    if norm_phone:
        linked_driver = await db.drivers.find_one(
            {"phone": {"$in": [
                payload.driver_phone.strip(),
                norm_phone,
                norm_phone.lstrip("+1") if norm_phone.startswith("+1") else norm_phone,
                "+1" + norm_phone if norm_phone.isdigit() and len(norm_phone) == 10 else norm_phone,
            ]}},
            {"_id": 0, "id": 1},
        )
    if not linked_driver and payload.driver_email:
        linked_driver = await db.drivers.find_one(
            {"email": {"$regex": f"^{re.escape(payload.driver_email.strip())}$", "$options": "i"}},
            {"_id": 0, "id": 1},
        )

    update_doc = {
        "driver_name": payload.driver_name.strip(),
        "driver_phone": payload.driver_phone.strip(),
        "driver_email": (payload.driver_email or "").strip(),
        "driver_plate": (payload.driver_plate or "").strip().upper(),
        "driver_vehicle": (payload.driver_vehicle or "").strip(),
        "driver_token": token,
        "trip_status": b.get("trip_status") or "assigned",
        "trip_status_updated_at": datetime.now(timezone.utc).isoformat(),
    }
    if linked_driver:
        update_doc["driver_id"] = linked_driver["id"]
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

    # Email the customer with chauffeur contact info + vehicle + plate
    if payload.notify_customer:
        try:
            from email_service import render_chauffeur_assigned_email
            manage_url = (
                f"{client_origin}/manage/{b.get('manage_token')}"
                if b.get("manage_token") else None
            )
            html = render_chauffeur_assigned_email({**b, **update_doc}, manage_url=manage_url)
            await send_email(
                to=b["email"],
                subject=f"Your chauffeur for #{b.get('confirmation_number','')} — {update_doc['driver_name']}",
                html=html,
                bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
            )
        except Exception as e:
            logger.warning(f"Chauffeur-assigned email failed (non-fatal): {e}")

    # Push notification to the rider (if they have the mobile app installed).
    try:
        cust_id = b.get("customer_id")
        if cust_id:
            driver_name = update_doc.get("driver_name") or "Your chauffeur"
            vehicle = b.get("vehicle_type") or ""
            await _push_to_customer(
                cust_id,
                "Chauffeur assigned",
                f"{driver_name} will be your driver{(' · ' + vehicle) if vehicle else ''}",
                data={"type": "driver_assigned", "booking_id": booking_id},
            )
    except Exception as e:
        logger.warning(f"Driver-assigned push failed (non-fatal): {e}")

    return {"ok": True, "driver_token": token, "driver_url": driver_url}


@api_router.delete("/admin/bookings/{booking_id}/driver")
async def unassign_driver(booking_id: str, _: dict = Depends(require_admin)):
    """Remove the driver from a booking (e.g., if reassigning). Invalidates the
    driver_token so the old link stops working."""
    await db.bookings.update_one(
        {"id": booking_id},
        {"$unset": {
            "driver_name": "", "driver_phone": "", "driver_email": "",
            "driver_plate": "", "driver_vehicle": "", "driver_token": "", "trip_status": "",
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
        "driver_vehicle": b.get("driver_vehicle"),
        # Phase 2b — wait time state
        "wait_time_consent": b.get("wait_time_consent", False),
        "flight_landed_at": b.get("flight_landed_at"),
        "wait_time_minutes": b.get("wait_time_minutes"),
        "wait_time_fee_amount": b.get("wait_time_fee_amount"),
        "wait_time_charged_at": b.get("wait_time_charged_at"),
        "wait_time_minutes_pending": b.get("wait_time_minutes_pending"),
        "wait_time_recorded_at": b.get("wait_time_recorded_at"),
        "mid_trip_stops": b.get("mid_trip_stops") or [],
        "no_show": b.get("no_show", False),
        "has_saved_card": bool(b.get("stripe_payment_method_id")),
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
        # Flip booking.status to 'completed' from ANY non-terminal state.
        # We support multiple legitimate "pre-completion" status values that
        # different code paths leave bookings in:
        #   - 'confirmed' (mobile book-and-pay after Stripe webhook)
        #   - 'paid'      (web /api/book after Stripe payment)
        #   - 'pending'   (driver assigned before payment cleared)
        # Without this widening, mobile bookings that paid via Stripe stayed
        # as 'paid' forever while trip_status was 'completed', so the rider
        # Trips screen kept showing the trip as 'Reserved'.
        if b.get("status") in ("confirmed", "pending", "paid", "reserved", "active", "in_progress"):
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

    # Push notification to the rider's mobile app (in addition to SMS — many
    # riders silence SMS but allow push for the apps they trust).
    try:
        cust_id = b.get("customer_id")
        if cust_id:
            title_map = {
                "en_route": "Driver en route",
                "arrived": "Driver has arrived",
                "in_progress": "Trip started",
                "completed": "Trip completed",
            }
            body_map = {
                "en_route": "Your chauffeur is on the way to pickup",
                "arrived": "Your chauffeur is waiting at pickup",
                "in_progress": "Enjoy your ride",
                "completed": "Thank you for riding with us",
            }
            t = title_map.get(new_status)
            if t:
                await _push_to_customer(
                    cust_id,
                    t,
                    body_map.get(new_status, ""),
                    data={"type": f"trip_{new_status}", "booking_id": b["id"]},
                )
    except Exception as e:
        logger.warning(f"Trip-status push failed (non-fatal): {e}")

    return {"ok": True, "trip_status": new_status, "trip_status_updated_at": now_iso}


# ---------- Driver: flight landed + wait-time charge (Phase 2b) ----------
class FlightLandedPayload(BaseModel):
    landed_at: Optional[str] = None  # ISO timestamp; if omitted server uses "now"


@api_router.post("/driver/{driver_token}/flight-landed")
async def driver_mark_flight_landed(driver_token: str, payload: FlightLandedPayload):
    """Driver records the customer's flight-landed time. Grace clock starts from here."""
    b = await db.bookings.find_one({"driver_token": driver_token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    if b.get("service_type") != "Airport Transfer":
        raise HTTPException(status_code=400, detail="Only applies to airport transfers.")

    if payload.landed_at:
        landed_iso = payload.landed_at
    else:
        landed_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": b["id"]}, {"$set": {"flight_landed_at": landed_iso}}
    )
    return {"ok": True, "flight_landed_at": landed_iso}


class WaitTimeRecordPayload(BaseModel):
    minutes_waited: int = Field(..., ge=1, le=240)  # total minutes waited (including grace)


def _wait_time_grace(service_type: Optional[str]) -> int:
    return 45 if service_type == "Airport Transfer" else 15


def _wait_time_amount_preview(minutes_waited: int, service_type: Optional[str], rate: float) -> dict:
    grace = _wait_time_grace(service_type)
    chargeable = max(0, minutes_waited - grace)
    amount = round(chargeable * rate, 2) if rate > 0 else 0.0
    return {
        "grace_minutes": grace,
        "chargeable_minutes": chargeable,
        "rate": float(rate),
        "amount": amount,
    }


async def _stripe_off_session_charge(
    customer_id: str,
    payment_method_id: str,
    amount_cents: int,
    description: str,
    metadata: dict,
) -> dict:
    """Shared helper for off-session PaymentIntents (wait time + damage charges).
    Raises HTTPException on failure. Returns the Stripe PaymentIntent JSON on success."""
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")
    form = [
        ("amount", str(amount_cents)),
        ("currency", "usd"),
        ("customer", customer_id),
        ("payment_method", payment_method_id),
        ("off_session", "true"),
        ("confirm", "true"),
        ("description", description),
    ]
    for k, v in metadata.items():
        form.append((f"metadata[{k}]", str(v)))
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.post(
            "https://api.stripe.com/v1/payment_intents",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            content=urlencode(form).encode("utf-8"),
        )
    if r.status_code != 200:
        err_text = r.text[:500]
        logger.error(f"Off-session charge failed: {r.status_code} {err_text}")
        try:
            err = r.json().get("error", {})
            detail = err.get("message") or err.get("code") or "Charge failed"
        except Exception:
            detail = "Charge failed"
        raise HTTPException(status_code=402, detail=f"Card declined: {detail}")
    pi = r.json()
    if pi.get("status") not in ("succeeded", "processing"):
        raise HTTPException(
            status_code=402,
            detail=f"Charge not completed — Stripe status: {pi.get('status')}",
        )
    return pi


@api_router.post("/driver/{driver_token}/record-wait-time")
async def driver_record_wait_time(driver_token: str, payload: WaitTimeRecordPayload):
    """Driver records the total minutes waited. NO charge happens here — the admin
    reviews and charges from the admin dashboard. Idempotent (overwrites the
    pending record while the booking has not yet been charged)."""
    b = await db.bookings.find_one({"driver_token": driver_token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    return await _record_wait_time_for_booking(b, payload)


async def _record_wait_time_for_booking(b: dict, payload: "WaitTimeRecordPayload") -> dict:
    """Shared logic between the token-based and JWT-based driver wait-time endpoints."""
    if b.get("wait_time_charged_at"):
        return {
            "already_charged": True,
            "amount": b.get("wait_time_fee_amount"),
            "minutes_waited": b.get("wait_time_minutes"),
        }
    pricing = await db.pricing_config.find_one({"vehicle_type": b["vehicle_type"]}, {"_id": 0})
    rate = float((pricing or {}).get("wait_minute_rate") or 0)
    preview = _wait_time_amount_preview(payload.minutes_waited, b.get("service_type"), rate)
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": b["id"]},
        {"$set": {
            "wait_time_minutes_pending": payload.minutes_waited,
            "wait_time_recorded_at": now_iso,
            "wait_time_recorded_by": "driver",
        }},
    )
    return {
        "recorded": True,
        "minutes_waited": payload.minutes_waited,
        **preview,
        "pending_admin_review": True,
    }


class NoShowPayload(BaseModel):
    reason: Optional[str] = Field(None, max_length=500)


# ---------- Driver: mid-trip unplanned stop (Phase B) ----------
class MidTripStopPayload(BaseModel):
    stop_address: str = Field(..., min_length=3, max_length=300)
    minutes_at_stop: int = Field(0, ge=0, le=240)


MID_TRIP_STOP_WAIT_GRACE_MIN = 10


def _route_total_miles(pickup_coord: dict, waypoints: List[dict], dropoff_coord: dict) -> float:
    """Sum-of-legs haversine distance for pickup → waypoints (in order) → dropoff.
    Matches the rest of the codebase (which uses haversine, not Google Directions)."""
    pts = [pickup_coord] + (waypoints or []) + [dropoff_coord]
    total = 0.0
    for a, b in zip(pts, pts[1:]):
        total += _haversine_miles(a["lat"], a["lon"], b["lat"], b["lon"])
    return total


async def _resolve_coords_for_addresses(addresses: List[str]) -> List[dict]:
    """Best-effort geocode a list of addresses. Silently drops un-geocodable ones —
    we'd rather under-charge than crash on a typo."""
    out: List[dict] = []
    for a in addresses or []:
        if not a or not a.strip():
            continue
        c = await _geocode(a)
        if c and "lat" in c and "lon" in c:
            out.append(c)
    return out


@api_router.post("/driver/{driver_token}/record-mid-trip-stop")
async def driver_record_mid_trip_stop(driver_token: str, payload: MidTripStopPayload):
    """Driver logs an unplanned stop made during the trip.

    Computes the detour miles caused by THIS stop (cumulative model: each stop is
    appended to the route between the previous waypoint and the dropoff, so the
    detour = new_total_route_miles − previous_total_route_miles).

    No charge happens here — the entry sits in `mid_trip_stops` with
    `charged_at=None` until the admin reviews and triggers the off-session charge.
    """
    b = await db.bookings.find_one({"driver_token": driver_token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    return await _record_mid_trip_stop_for_booking(b, payload)


async def _record_mid_trip_stop_for_booking(b: dict, payload: "MidTripStopPayload") -> dict:
    """Shared logic between the token-based and JWT-based mid-trip-stop endpoints.
    Computes detour miles, applies per-stop flat fee + per-mile + wait-time, and
    appends a fully-formed entry to booking.mid_trip_stops with `total` (NOT `amount`)
    so the admin charge endpoint can pick it up."""
    pickup = await _geocode(b.get("pickup_location") or "")
    dropoff = await _geocode(b.get("dropoff_location") or "")
    new_stop_coord = await _geocode(payload.stop_address)
    if not pickup or not dropoff:
        raise HTTPException(status_code=400, detail="Couldn't resolve the trip's pickup/dropoff for distance math.")
    if not new_stop_coord:
        raise HTTPException(status_code=400, detail="Couldn't resolve that stop address. Try adding the city or a nearer landmark.")

    prebook_coords = await _resolve_coords_for_addresses(b.get("additional_stops") or [])
    existing_mts = b.get("mid_trip_stops") or []
    existing_mts_coords = await _resolve_coords_for_addresses(
        [s.get("address") for s in existing_mts if s.get("address")]
    )
    waypoints_before = prebook_coords + existing_mts_coords
    miles_before = _route_total_miles(pickup, waypoints_before, dropoff)
    miles_after = _route_total_miles(pickup, waypoints_before + [new_stop_coord], dropoff)
    detour_miles = round(max(0.0, miles_after - miles_before), 2)

    pricing = await db.pricing_config.find_one({"vehicle_type": b["vehicle_type"]}, {"_id": 0}) or {}
    per_mile_rate = float(pricing.get("per_mile") or 0)
    wait_minute_rate = float(pricing.get("wait_minute_rate") or 0)
    settings = await _load_settings()
    flat_fee = float(settings.per_stop_fee or 0)
    service_fee_pct = float(settings.service_fee_percent or 0)

    wait_overage = max(0, int(payload.minutes_at_stop) - MID_TRIP_STOP_WAIT_GRACE_MIN)
    distance_charge = round(detour_miles * per_mile_rate, 2)
    wait_charge = round(wait_overage * wait_minute_rate, 2)
    subtotal = round(flat_fee + distance_charge + wait_charge, 2)
    service_fee = round(subtotal * (service_fee_pct / 100.0), 2) if service_fee_pct > 0 else 0.0
    total = round(subtotal + service_fee, 2)

    now_iso = datetime.now(timezone.utc).isoformat()
    entry = {
        "id": str(uuid.uuid4()),
        "address": new_stop_coord.get("display") or payload.stop_address,
        "address_input": payload.stop_address,
        "minutes_at_stop": int(payload.minutes_at_stop),
        "wait_grace_minutes": MID_TRIP_STOP_WAIT_GRACE_MIN,
        "wait_overage_minutes": wait_overage,
        "detour_miles": detour_miles,
        "flat_fee": flat_fee,
        "per_mile_rate": per_mile_rate,
        "wait_minute_rate": wait_minute_rate,
        "distance_charge": distance_charge,
        "wait_charge": wait_charge,
        "subtotal": subtotal,
        "service_fee": service_fee,
        "total": total,
        "recorded_at": now_iso,
        "recorded_by": "driver",
        "charged_at": None,
        "payment_intent_id": None,
    }
    await db.bookings.update_one(
        {"id": b["id"]},
        {"$push": {"mid_trip_stops": entry}},
    )
    return {"recorded": True, "stop": entry}


class AdminChargeMidTripStopRequest(BaseModel):
    stop_id: str = Field(..., min_length=1, max_length=80)


class AdminMarkExternalChargeRequest(BaseModel):
    """Payload for recording a charge that was processed OUTSIDE our auto Stripe flow
    (e.g., admin called the customer or used the Stripe dashboard manually).
    No money is moved — we just record the metadata so the booking reflects reality."""
    amount: Optional[float] = Field(None, ge=0, le=10000)  # required for wait-time/damage; ignored for mid-trip-stop (uses computed total)
    minutes_waited: Optional[int] = Field(None, ge=1, le=240)  # wait-time only
    stop_id: Optional[str] = Field(None, min_length=1, max_length=80)  # mid-trip-stop only
    reason: Optional[str] = Field(None, max_length=500)  # damages only
    note: Optional[str] = Field(None, max_length=300)  # free-form note ("charged via Stripe dashboard, ref XYZ")


@api_router.post("/admin/bookings/{booking_id}/mark-wait-time-external")
async def admin_mark_wait_time_external(
    booking_id: str,
    payload: AdminMarkExternalChargeRequest,
    _: dict = Depends(require_admin),
):
    """Record a wait-time charge that admin handled externally (no Stripe call)."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("wait_time_charged_at"):
        return {"already_charged": True}
    minutes = payload.minutes_waited or b.get("wait_time_minutes_pending")
    amount = payload.amount
    if not minutes or minutes < 1:
        raise HTTPException(status_code=400, detail="Missing minutes_waited.")
    if amount is None or amount < 0:
        raise HTTPException(status_code=400, detail="Missing amount.")
    now_iso = datetime.now(timezone.utc).isoformat()
    note = (payload.note or "").strip() or "Recorded as manually charged by admin."
    await db.bookings.update_one(
        {"id": b["id"]},
        {
            "$set": {
                "wait_time_minutes": int(minutes),
                "wait_time_fee_amount": round(float(amount), 2),
                "wait_time_charged_at": now_iso,
                "wait_time_payment_intent_id": f"manual:{note[:80]}",
                "wait_time_external_note": note,
            },
            "$unset": {"wait_time_minutes_pending": ""},
        },
    )
    return {"recorded": True, "external": True, "amount": amount, "minutes_waited": int(minutes)}


@api_router.post("/admin/bookings/{booking_id}/mark-mid-trip-stop-external")
async def admin_mark_mid_trip_stop_external(
    booking_id: str,
    payload: AdminMarkExternalChargeRequest,
    _: dict = Depends(require_admin),
):
    """Record a mid-trip stop as manually charged outside the Stripe auto flow."""
    if not payload.stop_id:
        raise HTTPException(status_code=400, detail="Missing stop_id.")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    stops = b.get("mid_trip_stops") or []
    stop = next((s for s in stops if s.get("id") == payload.stop_id), None)
    if not stop:
        raise HTTPException(status_code=404, detail="Mid-trip stop not found.")
    if stop.get("charged_at"):
        return {"already_charged": True, "stop": stop}
    now_iso = datetime.now(timezone.utc).isoformat()
    note = (payload.note or "").strip() or "Recorded as manually charged by admin."
    await db.bookings.update_one(
        {"id": b["id"], "mid_trip_stops.id": stop["id"]},
        {"$set": {
            "mid_trip_stops.$.charged_at": now_iso,
            "mid_trip_stops.$.payment_intent_id": f"manual:{note[:80]}",
            "mid_trip_stops.$.external_note": note,
        }},
    )
    return {"recorded": True, "external": True, "stop_id": stop["id"], "amount": stop.get("total")}


@api_router.post("/admin/bookings/{booking_id}/mark-damage-external")
async def admin_mark_damage_external(
    booking_id: str,
    payload: AdminMarkExternalChargeRequest,
    _: dict = Depends(require_admin),
):
    """Record a damage/incidental charge handled externally."""
    if payload.amount is None or payload.amount < 0:
        raise HTTPException(status_code=400, detail="Missing amount.")
    if not (payload.reason and len(payload.reason.strip()) >= 4):
        raise HTTPException(status_code=400, detail="Reason is required (min 4 chars).")
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    note = (payload.note or "").strip() or "Recorded as manually charged by admin."
    entry = {
        "amount": round(float(payload.amount), 2),
        "reason": payload.reason.strip(),
        "charged_at": now_iso,
        "payment_intent_id": f"manual:{note[:80]}",
        "external_note": note,
    }
    await db.bookings.update_one({"id": b["id"]}, {"$push": {"damage_charges": entry}})
    return {"recorded": True, "external": True, "entry": entry}


@api_router.post("/admin/bookings/{booking_id}/charge-mid-trip-stop")
async def admin_charge_mid_trip_stop(
    booking_id: str,
    payload: AdminChargeMidTripStopRequest,
    _: dict = Depends(require_admin),
):
    """Admin reviews a driver-recorded mid-trip stop and triggers the off-session charge."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not b.get("wait_time_consent"):
        raise HTTPException(
            status_code=400,
            detail="Customer did not consent to off-session charges on this booking.",
        )
    pm_id = b.get("stripe_payment_method_id")
    customer_id = b.get("stripe_customer_id")
    if not pm_id or not customer_id:
        raise HTTPException(status_code=400, detail="No saved card on this booking.")

    stops = b.get("mid_trip_stops") or []
    idx = next((i for i, s in enumerate(stops) if s.get("id") == payload.stop_id), -1)
    if idx == -1:
        raise HTTPException(status_code=404, detail="Mid-trip stop not found on this booking.")
    stop = stops[idx]
    if stop.get("charged_at"):
        return {"already_charged": True, "stop": stop}
    total = float(stop.get("total") or 0)
    if total < 0.50:
        raise HTTPException(status_code=400, detail="Charge too small (under $0.50 minimum).")

    pi = await _stripe_off_session_charge(
        customer_id=customer_id,
        payment_method_id=pm_id,
        amount_cents=int(round(total * 100)),
        description=f"Mid-trip stop · {stop.get('address','')[:60]} · #{b.get('confirmation_number','')}",
        metadata={
            "booking_id": b["id"],
            "kind": "mid_trip_stop",
            "stop_id": stop["id"],
            "detour_miles": stop.get("detour_miles", 0),
            "minutes_at_stop": stop.get("minutes_at_stop", 0),
        },
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": b["id"], "mid_trip_stops.id": stop["id"]},
        {"$set": {
            "mid_trip_stops.$.charged_at": now_iso,
            "mid_trip_stops.$.payment_intent_id": pi.get("id"),
        }},
    )

    # Email the customer with an itemized receipt
    try:
        from email_service import render_mid_trip_stop_charge_email
        html = render_mid_trip_stop_charge_email(b, stop=stop)
        await send_email(
            to=b["email"],
            subject=f"Mid-trip stop charge · ${total:.2f} · #{b.get('confirmation_number','')}",
            html=html,
            bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
        )
    except Exception as e:
        logger.warning(f"Mid-trip stop email failed (non-fatal): {e}")

    refreshed_stop = {**stop, "charged_at": now_iso, "payment_intent_id": pi.get("id")}
    return {"charged": True, "stop": refreshed_stop}


@api_router.post("/driver/{driver_token}/no-show")
async def driver_mark_no_show(driver_token: str, payload: NoShowPayload):
    """Driver marks the trip as customer no-show. Forfeits the fare (no refund)."""
    b = await db.bookings.find_one({"driver_token": driver_token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": b["id"]},
        {
            "$set": {
                "no_show": True,
                "status": "no_show",
                "trip_status": "completed",
                "completed_at": now_iso,
                "cancellation_reason": (payload.reason or "").strip() or "Customer no-show",
            }
        },
    )
    return {"ok": True}


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
    allowed_vehicle_types: List[str] = Field(default_factory=list)  # empty = all vehicles eligible


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
    allowed_vehicle_types: Optional[List[str]] = None


class Promo(PromoBase):
    id: str
    uses: int = 0
    total_discount_given: float = 0.0
    created_at: str


class PromoValidateRequest(BaseModel):
    code: str = Field(..., min_length=1, max_length=40)
    amount: float = Field(..., gt=0)
    email: Optional[EmailStr] = None
    vehicle_type: Optional[str] = Field(None, max_length=40)



# ---------- ANNOUNCEMENTS ----------
# Sitewide news/promo messages — published by admin, shown in a sticky banner
# (short headline only) and the dedicated "Latest news" homepage section (full body).
class AnnouncementBase(BaseModel):
    title: str = Field(..., min_length=2, max_length=120)
    body: Optional[str] = Field(None, max_length=2000)  # markdown-ish plain text shown on homepage section
    cta_label: Optional[str] = Field(None, max_length=40)
    cta_url: Optional[str] = Field(None, max_length=300)
    show_in_banner: bool = True   # show in the sticky top banner (truncated)
    show_on_homepage: bool = True  # render in the homepage section
    active: bool = True
    starts_at: Optional[str] = None  # ISO date — optional schedule start
    ends_at: Optional[str] = None    # ISO date — optional schedule end


class AnnouncementCreate(AnnouncementBase):
    pass


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = Field(None, min_length=2, max_length=120)
    body: Optional[str] = Field(None, max_length=2000)
    cta_label: Optional[str] = Field(None, max_length=40)
    cta_url: Optional[str] = Field(None, max_length=300)
    show_in_banner: Optional[bool] = None
    show_on_homepage: Optional[bool] = None
    active: Optional[bool] = None
    starts_at: Optional[str] = None
    ends_at: Optional[str] = None


class Announcement(AnnouncementBase):
    id: str
    slug: str
    created_at: str
    updated_at: Optional[str] = None


def _slugify(s: str) -> str:
    import re
    s = re.sub(r"[^a-zA-Z0-9\s-]", "", s or "").strip().lower()
    s = re.sub(r"\s+", "-", s)
    return s[:60] or "news"


def _announcement_active_now(a: dict) -> bool:
    """Public visibility = active flag AND within optional start/end window."""
    if not a.get("active"):
        return False
    today = datetime.now(timezone.utc).date().isoformat()
    sa = (a.get("starts_at") or "").strip()
    ea = (a.get("ends_at") or "").strip()
    if sa and today < sa:
        return False
    if ea and today > ea:
        return False
    return True


@api_router.get("/announcements")
async def list_announcements_public():
    """Public feed of currently-active announcements for the homepage + banner."""
    out = []
    async for a in db.announcements.find({"active": True}, {"_id": 0}).sort("created_at", -1):
        if _announcement_active_now(a):
            out.append(a)
    return {
        "banner": [a for a in out if a.get("show_in_banner")][:1],  # only show the latest one in the banner
        "homepage": [a for a in out if a.get("show_on_homepage")][:10],
    }


@api_router.get("/announcements/{slug}")
async def get_announcement_by_slug(slug: str):
    """Indexable detail page. Returns 404 if not visible."""
    a = await db.announcements.find_one({"slug": slug}, {"_id": 0})
    if not a or not _announcement_active_now(a):
        raise HTTPException(status_code=404, detail="Announcement not found")
    return a


@api_router.get("/admin/announcements")
async def admin_list_announcements(_: dict = Depends(require_admin)):
    items = []
    async for a in db.announcements.find({}, {"_id": 0}).sort("created_at", -1):
        items.append(a)
    return items


@api_router.post("/admin/announcements", response_model=Announcement)
async def admin_create_announcement(
    payload: AnnouncementCreate, _: dict = Depends(require_admin)
):
    aid = str(uuid.uuid4())
    base_slug = _slugify(payload.title)
    slug = base_slug
    n = 2
    while await db.announcements.find_one({"slug": slug}, {"_id": 0}):
        slug = f"{base_slug}-{n}"
        n += 1
    now = datetime.now(timezone.utc).isoformat()
    doc = {
        **payload.model_dump(),
        "id": aid,
        "slug": slug,
        "created_at": now,
        "updated_at": now,
    }
    await db.announcements.insert_one(doc.copy())
    return Announcement(**{k: v for k, v in doc.items() if k != "_id"})


@api_router.patch("/admin/announcements/{aid}", response_model=Announcement)
async def admin_update_announcement(
    aid: str, payload: AnnouncementUpdate, _: dict = Depends(require_admin)
):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    # NOTE: slug is intentionally NOT regenerated on title edits — it would
    # break already-shared /news/<old-slug> URLs and previously-published
    # sitemap entries. Admin can delete + recreate if the URL needs to change.
    r = await db.announcements.update_one({"id": aid}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Announcement not found")
    a = await db.announcements.find_one({"id": aid}, {"_id": 0})
    return Announcement(**a)


@api_router.delete("/admin/announcements/{aid}")
async def admin_delete_announcement(aid: str, _: dict = Depends(require_admin)):
    r = await db.announcements.delete_one({"id": aid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"deleted": True}


# -------- Driver Roster (admin saved drivers) --------
class DriverBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=80)
    phone: str = Field(..., min_length=5, max_length=30)
    email: Optional[str] = Field(None, max_length=120)
    plate: Optional[str] = Field(None, max_length=20)
    vehicle: Optional[str] = Field(None, max_length=80)
    active: bool = True


class DriverCreate(DriverBase):
    pass


class DriverUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    phone: Optional[str] = Field(None, min_length=5, max_length=30)
    email: Optional[str] = Field(None, max_length=120)
    plate: Optional[str] = Field(None, max_length=20)
    vehicle: Optional[str] = Field(None, max_length=80)
    active: Optional[bool] = None


class Driver(DriverBase):
    id: str
    created_at: str
    updated_at: Optional[str] = None


@api_router.get("/admin/drivers")
async def admin_list_drivers(_: dict = Depends(require_admin)):
    items = []
    async for d in db.drivers.find({}, {"_id": 0}).sort([("active", -1), ("name", 1)]):
        items.append(d)
    return items


@api_router.post("/admin/drivers", response_model=Driver)
async def admin_create_driver(payload: DriverCreate, _: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {**payload.model_dump(), "id": str(uuid.uuid4()), "created_at": now, "updated_at": now}
    await db.drivers.insert_one(doc.copy())
    return Driver(**{k: v for k, v in doc.items() if k != "_id"})


@api_router.patch("/admin/drivers/{driver_id}", response_model=Driver)
async def admin_update_driver(driver_id: str, payload: DriverUpdate, _: dict = Depends(require_admin)):
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.drivers.update_one({"id": driver_id}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Driver not found")
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    return Driver(**d)


@api_router.delete("/admin/drivers/{driver_id}")
async def admin_delete_driver(driver_id: str, _: dict = Depends(require_admin)):
    r = await db.drivers.delete_one({"id": driver_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"deleted": True}


# -------- Quote Requests (for call-only vehicles: Party Bus / Stretch / Sprinter) --------
class QuoteRequestCreate(BaseModel):
    full_name: str = Field(..., min_length=1, max_length=80)
    phone: str = Field(..., min_length=5, max_length=30)
    email: Optional[str] = Field(None, max_length=120)
    vehicle_type: str = Field(..., max_length=40)
    pickup_date: Optional[str] = Field(None, max_length=20)
    pickup_time: Optional[str] = Field(None, max_length=10)
    pickup_location: Optional[str] = Field(None, max_length=300)
    dropoff_location: Optional[str] = Field(None, max_length=300)
    passengers: Optional[int] = Field(None, ge=1, le=60)
    occasion: Optional[str] = Field(None, max_length=80)
    notes: Optional[str] = Field(None, max_length=1000)


@api_router.post("/quote-requests")
async def submit_quote_request(payload: QuoteRequestCreate, request: Request):
    """Customer-facing endpoint. Creates a quote_request row + alerts admin via
    email and SMS gateway. Returns the request id so the UI can show success."""
    doc = payload.model_dump()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["status"] = "new"
    await db.quote_requests.insert_one(doc.copy())

    # Admin SMS — single short text so it lands cleanly on iOS Messages
    try:
        line_pickup = (doc.get("pickup_location") or "(no pickup)")[:60]
        line_drop = (doc.get("dropoff_location") or "(no drop)")[:60]
        sms_text = (
            f"QUOTE REQUEST · {doc['vehicle_type']}\n"
            f"{doc['full_name']} · {doc['phone']}\n"
            f"{doc.get('pickup_date','') or 'no date'} {doc.get('pickup_time','') or ''}\n"
            f"Pick: {line_pickup}\n"
            f"Drop: {line_drop}\n"
            f"Pax: {doc.get('passengers','?')} · {doc.get('occasion','')}"
        )
        await send_admin_sms(sms_text)
    except Exception as e:
        logger.warning(f"Quote-request SMS failed: {e}")

    # Admin email — simple readable HTML
    if SUPPORT_EMAIL:
        try:
            origin = _frontend_origin_from_request(request)
            admin_url = f"{origin}/admin"
            email_html = _render_quote_request_admin_email(doc, admin_url)
            subj = f"💬 Quote request · {doc['vehicle_type']} · {doc['full_name']}"
            await send_email(to=SUPPORT_EMAIL, subject=subj, html=email_html)
        except Exception as e:
            logger.warning(f"Quote-request admin email failed: {e}")

    return {"id": doc["id"], "ok": True}


def _render_quote_request_admin_email(doc: dict, admin_url: str) -> str:
    def row(label, value):
        if not value:
            return ""
        v = str(value).replace("<", "&lt;").replace(">", "&gt;")
        return f'<tr><td style="padding:8px 14px;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.15em;border-bottom:1px solid #1f1f1f;width:140px;">{label}</td><td style="padding:8px 14px;color:#eee;font-size:13px;border-bottom:1px solid #1f1f1f;">{v}</td></tr>'

    rows = "".join([
        row("Customer", doc.get("full_name")),
        row("Phone", doc.get("phone")),
        row("Email", doc.get("email")),
        row("Vehicle", doc.get("vehicle_type")),
        row("Date / Time", f"{doc.get('pickup_date','')} {doc.get('pickup_time','')}".strip()),
        row("Pickup", doc.get("pickup_location")),
        row("Dropoff", doc.get("dropoff_location")),
        row("Passengers", doc.get("passengers")),
        row("Occasion", doc.get("occasion")),
        row("Notes", doc.get("notes")),
    ])
    return f"""<!doctype html>
<html><body style="margin:0;background:#050505;color:#eee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<table cellpadding=0 cellspacing=0 width="100%" style="background:#050505;padding:32px 0;">
  <tr><td align="center">
    <table cellpadding=0 cellspacing=0 width="640" style="background:#111;border:1px solid #1f1f1f;border-radius:12px;overflow:hidden;">
      <tr><td style="padding:22px 28px;background:#1a1410;border-bottom:1px solid #2a1f1f;">
        <div style="color:#D4AF37;font-size:11px;text-transform:uppercase;letter-spacing:.25em;">Quote request</div>
        <div style="color:#fff;font-size:18px;margin-top:6px;font-weight:600;">A customer wants a custom quote</div>
      </td></tr>
      <tr><td style="padding:0;">
        <table cellpadding=0 cellspacing=0 width="100%" style="border-collapse:collapse;">{rows}</table>
      </td></tr>
      <tr><td style="padding:22px 28px;background:#0a0a0a;">
        <a href="{admin_url}" style="display:inline-block;padding:10px 22px;background:#D4AF37;color:#000;text-decoration:none;border-radius:999px;font-weight:600;font-size:13px;">Open Admin Dashboard →</a>
        <div style="color:#666;font-size:11px;margin-top:14px;line-height:1.6;">Reply directly to the customer's phone or email. Send them a Stripe link from the dashboard when ready.</div>
      </td></tr>
    </table>
  </td></tr>
</table>
</body></html>"""


@api_router.get("/admin/quote-requests")
async def admin_list_quote_requests(_: dict = Depends(require_admin)):
    items = []
    async for d in db.quote_requests.find({}, {"_id": 0}).sort("created_at", -1).limit(200):
        items.append(d)
    return items


@api_router.patch("/admin/quote-requests/{rid}")
async def admin_update_quote_request(rid: str, payload: dict, _: dict = Depends(require_admin)):
    update = {}
    if "status" in payload and payload["status"] in {"new", "contacted", "won", "lost"}:
        update["status"] = payload["status"]
        update["status_updated_at"] = datetime.now(timezone.utc).isoformat()
    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")
    r = await db.quote_requests.update_one({"id": rid}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Not found")
    return {"ok": True}


@api_router.delete("/admin/quote-requests/{rid}")
async def admin_delete_quote_request(rid: str, _: dict = Depends(require_admin)):
    r = await db.quote_requests.delete_one({"id": rid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


# -------- Production error alerts (Sentry-lite via Resend) --------
class ClientErrorReport(BaseModel):
    message: str = Field(..., max_length=2000)
    page_url: str = Field(..., max_length=500)
    user_agent: str = Field("", max_length=500)
    stack: Optional[str] = Field(None, max_length=8000)
    context: Optional[dict] = None  # arbitrary debug info (booking_id, route, etc.)


# In-process dedupe + rate-limit (resets on backend restart, fine for this volume)
_error_alert_state = {
    "seen": {},        # fingerprint -> last_alert_iso
    "minute_count": 0,
    "minute_started": None,
}
_ERROR_DEDUPE_WINDOW_SECS = 300   # 5 min
_ERROR_MAX_PER_MINUTE = 5


def _error_fingerprint(message: str, page_url: str) -> str:
    """Coarse dedupe key — first 120 chars of message + path of URL."""
    from urllib.parse import urlparse
    try:
        path = urlparse(page_url).path or "/"
    except Exception:
        path = "/"
    return f"{(message or '')[:120]}|{path}"


@api_router.post("/errors/report")
async def report_client_error(payload: ClientErrorReport):
    """
    Public endpoint — production JS errors POST here. We dedupe by message+path
    over 5 min and cap at 5 emails/min so an error loop can't spam the inbox.
    Always returns 204 so the reporter is fire-and-forget.
    """
    from email_service import render_admin_error_alert_email, send_email, SUPPORT_EMAIL

    now = datetime.now(timezone.utc)

    # Per-minute rate-limit
    started = _error_alert_state["minute_started"]
    if started is None or (now - started).total_seconds() >= 60:
        _error_alert_state["minute_started"] = now
        _error_alert_state["minute_count"] = 0
    if _error_alert_state["minute_count"] >= _ERROR_MAX_PER_MINUTE:
        return Response(status_code=204)

    # Dedupe
    fp = _error_fingerprint(payload.message, payload.page_url)
    last = _error_alert_state["seen"].get(fp)
    if last:
        try:
            last_dt = datetime.fromisoformat(last)
            if (now - last_dt).total_seconds() < _ERROR_DEDUPE_WINDOW_SECS:
                return Response(status_code=204)
        except Exception:
            pass
    _error_alert_state["seen"][fp] = now.isoformat()
    _error_alert_state["minute_count"] += 1

    # Prune dedupe map if it grows
    if len(_error_alert_state["seen"]) > 500:
        _error_alert_state["seen"].clear()

    html = render_admin_error_alert_email(
        message=payload.message,
        page_url=payload.page_url,
        user_agent=payload.user_agent,
        stack=payload.stack,
        context=payload.context,
        occurred_at_iso=now.isoformat(),
    )
    subject = f"[TuranEliteLimo] JS error: {(payload.message or '')[:80]}"
    try:
        await send_email(to=SUPPORT_EMAIL, subject=subject, html=html)
    except Exception as e:
        logger.warning(f"Couldn't send admin error alert: {e}")

    return Response(status_code=204)


SITE_BASE_URL = os.environ.get("SITE_BASE_URL", "https://turanelitelimo.com").rstrip("/")


@api_router.get("/sitemap.xml")
async def dynamic_sitemap():
    """Dynamic sitemap: homepage + all currently-active announcements at /news/<slug>."""
    today = datetime.now(timezone.utc).date().isoformat()
    urls = [
        {"loc": f"{SITE_BASE_URL}/", "changefreq": "weekly", "priority": "1.0", "lastmod": today},
    ]
    async for a in db.announcements.find({"active": True}, {"_id": 0}).sort("created_at", -1):
        if not _announcement_active_now(a):
            continue
        last = (a.get("updated_at") or a.get("created_at") or "")[:10] or today
        urls.append({
            "loc": f"{SITE_BASE_URL}/news/{a['slug']}",
            "changefreq": "weekly",
            "priority": "0.7",
            "lastmod": last,
        })
    xml_parts = ['<?xml version="1.0" encoding="UTF-8"?>',
                 '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">']
    for u in urls:
        xml_parts.append("  <url>")
        xml_parts.append(f"    <loc>{u['loc']}</loc>")
        xml_parts.append(f"    <lastmod>{u['lastmod']}</lastmod>")
        xml_parts.append(f"    <changefreq>{u['changefreq']}</changefreq>")
        xml_parts.append(f"    <priority>{u['priority']}</priority>")
        xml_parts.append("  </url>")
    xml_parts.append("</urlset>")
    return Response(content="\n".join(xml_parts), media_type="application/xml")




def _normalize_promo_code(raw: str) -> str:
    return (raw or "").strip().upper()


async def _validate_promo_for_booking(
    code: str, amount: float, email: Optional[str], vehicle_type: Optional[str] = None,
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
    # Vehicle-type restriction (admin can limit a promo to specific vehicles)
    allowed_vehicles = promo.get("allowed_vehicle_types") or []
    if allowed_vehicles and vehicle_type and vehicle_type not in allowed_vehicles:
        pretty = " / ".join(allowed_vehicles)
        return {
            "ok": False,
            "reason": f"This code only works for {pretty}",
        }
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
    result = await _validate_promo_for_booking(
        payload.code, payload.amount, payload.email, payload.vehicle_type,
    )
    return result


@api_router.get("/promos/banner")
async def public_banner_promo():
    """Returns the currently advertised promo (if any) for the sitewide banner.
    Picks the most recently created promo that is active + has show_on_banner=True
    + not expired + hasn't hit max_uses.
    Defensive: skips malformed promo docs instead of 500-ing on missing fields.
    """
    today = datetime.now(timezone.utc).date().isoformat()
    try:
        cursor = db.promos.find(
            {"active": True, "show_on_banner": True},
            {"_id": 0},
        ).sort("created_at", -1)
        rows = await cursor.to_list(20)
    except Exception as e:
        logger.warning(f"public_banner_promo: db query failed: {e}")
        return {"code": None}
    for p in rows:
        try:
            # Required fields — skip silently if any malformed legacy doc lacks them
            code = p.get("code")
            dtype = p.get("discount_type")
            val = p.get("value")
            if not code or not dtype or val is None:
                continue
            # Expiry guard
            exp = p.get("expires_at")
            if exp and exp < today:
                continue
            # Max uses guard
            mu = p.get("max_uses")
            if mu is not None and int(p.get("uses") or 0) >= int(mu):
                continue
            return {
                "code": code,
                "description": p.get("description") or "",
                "discount_type": dtype,
                "value": float(val),
                "min_ride_amount": float(p.get("min_ride_amount") or 0),
                "first_ride_only": bool(p.get("first_ride_only")),
                "expires_at": p.get("expires_at"),
            }
        except Exception as e:
            logger.warning(f"public_banner_promo: skipping malformed promo {p.get('id','?')}: {e}")
            continue
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
    cancellation_tiers: List[dict] = Field(
        default_factory=lambda: [
            {"hours_before_pickup": 24, "refund_percent": 100},
            {"hours_before_pickup": 6, "refund_percent": 50},
            {"hours_before_pickup": 0, "refund_percent": 0},
        ]
    )
    service_fee_percent: float = Field(3.5, ge=0, le=20)  # default 3.5% — covers Stripe processing on refunds
    per_stop_fee: float = Field(15.0, ge=0)  # flat fee added per additional stop on a transfer


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
        "per_stop_fee": s.per_stop_fee,
        "cancellation_tiers": s.cancellation_tiers,
        "currency": s.currency,
    }


class SettingsUpdate(BaseModel):
    deposit_percent: Optional[int] = Field(None, ge=0, le=100)
    currency: Optional[str] = None
    meet_greet_fee: Optional[float] = Field(None, ge=0)
    service_fee_percent: Optional[float] = Field(None, ge=0, le=20)
    per_stop_fee: Optional[float] = Field(None, ge=0)
    cancellation_tiers: Optional[List[dict]] = None


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
    # Extend the priced route through any pre-booked additional stops (transfer trips only).
    pre_stops = booking.get("additional_stops") or []
    if pre_stops:
        stop_coords = await _resolve_coords_for_addresses(pre_stops)
        if stop_coords:
            miles = _route_total_miles(pickup, stop_coords, dropoff)
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
    # Per-stop flat fee (every additional stop on the trip)
    stops_count = len(booking.get("additional_stops") or [])
    if stops_count > 0 and settings.per_stop_fee and settings.per_stop_fee > 0:
        price += stops_count * float(settings.per_stop_fee)
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
        promo = await _validate_promo_for_booking(
            code_raw, original_amount, booking.get("email"), booking.get("vehicle_type"),
        )
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
    # Stable thank-you URL — same path for every successful booking so Google
    # Ads / Meta / TikTok can use URL-match conversion goals. Booking ID + session
    # ID move into query params (the success page reads them to render the receipt).
    success_url = f"{origin}/thank-you?bid={payload.booking_id}&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pay/{payload.booking_id}"

    # IMPORTANT: We create the Stripe Checkout session via direct REST so we can pass
    # `payment_intent_data[setup_future_usage]=off_session`. This saves the customer's
    # card for Phase 2 wait-time charges (consented at booking) without needing them
    # to re-enter card details.
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")
    amount_cents = int(round(float(amount) * 100))
    customer_email = booking.get("email") or ""
    cn_for_desc = booking.get("confirmation_number") or ""
    product_name = f"TuranEliteLimo chauffeur — {booking.get('vehicle_type','Reservation')}{(' · ' + cn_for_desc) if cn_for_desc else ''}"
    form = [
        ("mode", "payment"),
        ("success_url", success_url),
        ("cancel_url", cancel_url),
        ("payment_method_types[]", "card"),
        ("customer_creation", "always"),
        ("line_items[0][quantity]", "1"),
        ("line_items[0][price_data][currency]", settings.currency),
        ("line_items[0][price_data][unit_amount]", str(amount_cents)),
        ("line_items[0][price_data][product_data][name]", product_name),
        ("payment_intent_data[setup_future_usage]", "off_session"),
        ("payment_intent_data[metadata][booking_id]", payload.booking_id),
        ("payment_intent_data[metadata][confirmation_number]", cn_for_desc),
        ("metadata[booking_id]", payload.booking_id),
        ("metadata[confirmation_number]", cn_for_desc),
        ("metadata[customer_email]", customer_email),
    ]
    if customer_email:
        form.append(("customer_email", customer_email))

    async with httpx.AsyncClient(timeout=15.0) as cli:
        try:
            r = await cli.post(
                "https://api.stripe.com/v1/checkout/sessions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                content=urlencode(form).encode("utf-8"),
            )
        except (httpx.TimeoutException, httpx.RequestError, httpx.HTTPError) as e:
            # Stripe API call failed (network, timeout, DNS). Log + SMS admin so
            # we never silently lose a sale to "something went wrong" again.
            err_msg = f"{type(e).__name__}: {str(e)[:200]}"
            logger.error(f"Stripe checkout network/timeout failure for booking {payload.booking_id}: {err_msg}")
            await _record_checkout_failure(payload.booking_id, "network_error", err_msg, booking)
            raise HTTPException(
                status_code=502,
                detail="Our payment processor didn't respond in time. Please click 'Try again' or use the recovery link we just emailed you.",
            )
    if r.status_code != 200:
        err_body = r.text[:500]
        logger.error(f"Stripe checkout create failed: {r.status_code} {err_body}")
        await _record_checkout_failure(payload.booking_id, f"stripe_{r.status_code}", err_body, booking)
        raise HTTPException(
            status_code=502,
            detail="Could not start Stripe checkout. We've been notified and will call you to complete the booking.",
        )
    sess_json = r.json()
    session_url = sess_json.get("url")
    session_id = sess_json.get("id")
    payment_intent_id = sess_json.get("payment_intent")
    if not session_url or not session_id:
        await _record_checkout_failure(payload.booking_id, "stripe_invalid_session", str(sess_json)[:300], booking)
        raise HTTPException(status_code=502, detail="Stripe returned an invalid session")

    await db.payment_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "booking_id": payload.booking_id,
            "session_id": session_id,
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
    booking_set = {
        **booking_updates,
        "payment_status": "pending",
        "payment_session_id": session_id,
    }
    if payment_intent_id:
        booking_set["stripe_payment_intent_id"] = payment_intent_id
    await db.bookings.update_one(
        {"id": payload.booking_id},
        {
            "$set": {
                **booking_set,
                "last_checkout_attempt_at": datetime.now(timezone.utc).isoformat(),
            },
            "$inc": {"checkout_attempts": 1},
        },
    )

    return CheckoutCreateResponse(url=session_url, session_id=session_id, amount=float(amount))


async def _record_checkout_failure(booking_id: str, error_kind: str, error_detail: str, booking: dict):
    """Centralized handler for any Stripe-checkout-create failure. Stamps the
    booking, logs to a dedicated collection, and pages the admin via SMS so we
    can call the customer back before they cancel out of frustration."""
    now_iso = datetime.now(timezone.utc).isoformat()
    try:
        await db.bookings.update_one(
            {"id": booking_id},
            {
                "$inc": {"checkout_attempts": 1, "checkout_failures": 1},
                "$set": {"last_checkout_error": error_detail[:300], "last_checkout_error_at": now_iso},
            },
        )
    except Exception as e:
        logger.warning(f"Failed to stamp checkout failure on booking {booking_id}: {e}")
    try:
        await db.checkout_failures.insert_one({
            "id": str(uuid.uuid4()),
            "booking_id": booking_id,
            "kind": error_kind,
            "detail": error_detail[:1000],
            "created_at": now_iso,
        })
    except Exception as e:
        logger.warning(f"Failed to log checkout failure: {e}")
    # Page the admin so they can call the customer NOW
    try:
        admin_to = sms_service.admin_phone()
        if admin_to:
            cn = booking.get("confirmation_number") or booking.get("id", "")[:8]
            name = booking.get("full_name") or "Customer"
            phone = booking.get("phone") or ""
            quote = booking.get("quote_amount")
            quote_str = f" · ${quote:.0f}" if quote else ""
            await sms_service.send_sms(
                admin_to,
                f"TuranEliteLimo · ⚠️ CHECKOUT FAILED · #{cn}\n"
                f"{name} · {phone}{quote_str}\n"
                f"Reason: {error_kind}\n"
                f"CALL THIS CUSTOMER NOW — they hit an error trying to pay.",
            )
    except Exception as e:
        logger.warning(f"Admin checkout-failure SMS failed: {e}")


# ---------- Client-side checkout telemetry (Stripe redirect blocked detection) ----------
class CheckoutTelemetryPayload(BaseModel):
    booking_id: str
    session_id: Optional[str] = None
    kind: str  # "redirect_blocked" | "manual_fallback_clicked" | "redirect_error"
    user_agent: Optional[str] = None
    detail: Optional[str] = None


@api_router.post("/payments/checkout-telemetry")
async def record_checkout_telemetry(payload: CheckoutTelemetryPayload, request: Request):
    """Public endpoint — no auth. Frontend pings this if the user is STILL on
    the booking page 2.5s after we issued window.location.href = stripeUrl,
    which means the redirect was blocked (iOS ITP, popup blocker, browser
    policy). Logging it lets us spot patterns and act on them."""
    try:
        await db.checkout_telemetry.insert_one({
            "id": str(uuid.uuid4()),
            "booking_id": payload.booking_id,
            "session_id": payload.session_id,
            "kind": payload.kind[:40],
            "user_agent": (payload.user_agent or "")[:300],
            "detail": (payload.detail or "")[:500],
            "ip": (request.client.host if request.client else "") or "",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"Telemetry insert failed: {e}")
    return {"ok": True}




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
            # Look up the Stripe session to capture customer + payment_method IDs
            # so admin can later trigger off-session wait-time / damage / mid-trip-stop charges.
            ids = await _capture_off_session_ids(session_id)
            # Backfill: if the webhook beat us to marking paid but didn't save the IDs,
            # save them now even though payment_status is already "paid".
            if booking and (
                booking.get("payment_status") == "paid"
                and not booking.get("stripe_payment_method_id")
                and ids.get("stripe_payment_method_id")
            ):
                await db.bookings.update_one(
                    {"id": txn["booking_id"]},
                    {"$set": {
                        **({"stripe_customer_id": ids["stripe_customer_id"]} if ids.get("stripe_customer_id") else {}),
                        "stripe_payment_method_id": ids["stripe_payment_method_id"],
                    }},
                )
                booking = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
            if booking and booking.get("payment_status") != "paid":
                # Generate manage token if not yet issued (legacy bookings)
                token = booking.get("manage_token") or _generate_manage_token()
                # Generate confirmation number now so the customer has one in their receipt
                cn = booking.get("confirmation_number") or await _next_unique_confirmation_number()
                # IMPORTANT: do NOT auto-confirm — admin reviews chauffeur availability first.
                # Status stays "pending" until admin explicitly confirms in the dashboard.
                update_set = {
                    "payment_status": "paid",
                    "paid_amount": amount,
                    "paid_currency": currency,
                    "manage_token": token,
                    "confirmation_number": cn,
                    "quote_amount": booking.get("quote_amount") or amount,
                }
                if ids.get("stripe_customer_id"):
                    update_set["stripe_customer_id"] = ids["stripe_customer_id"]
                if ids.get("stripe_payment_method_id"):
                    update_set["stripe_payment_method_id"] = ids["stripe_payment_method_id"]
                await db.bookings.update_one(
                    {"id": txn["booking_id"]},
                    {"$set": update_set},
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


async def _capture_off_session_ids(session_id: str) -> dict:
    """Look up a Stripe Checkout Session and return its customer + payment_method IDs.
    Returns {} if Stripe isn't configured or the call fails — caller handles missing keys.
    Used by both the polling endpoint AND the webhook so we don't depend on a race."""
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        return {}
    try:
        async with httpx.AsyncClient(timeout=10.0) as cli:
            r = await cli.get(
                f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
                params={"expand[]": "payment_intent"},
                headers={"Authorization": f"Bearer {api_key}"},
            )
            if r.status_code != 200:
                return {}
            sj = r.json()
            out = {}
            cust = sj.get("customer")
            if cust:
                out["stripe_customer_id"] = cust
            pi = sj.get("payment_intent") or {}
            if isinstance(pi, dict):
                pm = pi.get("payment_method")
                if pm:
                    out["stripe_payment_method_id"] = pm
            return out
    except Exception as e:
        logger.warning(f"_capture_off_session_ids({session_id}) failed: {e}")
        return {}


@api_router.post("/admin/bookings/{booking_id}/backfill-saved-card")
async def admin_backfill_saved_card(booking_id: str, _: dict = Depends(require_admin)):
    """For paid bookings where the Stripe webhook beat the polling endpoint and we never
    saved customer/payment_method IDs — re-look them up from Stripe and save now.
    No-op if already saved or the booking has no payment_session_id."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Booking is not paid yet.")
    sid = b.get("payment_session_id")
    if not sid:
        # Fallback: look up via payment_transactions
        txn = await db.payment_transactions.find_one({"booking_id": booking_id}, {"_id": 0})
        sid = txn.get("session_id") if txn else None
    if not sid:
        raise HTTPException(status_code=400, detail="No Stripe session ID on this booking.")
    ids = await _capture_off_session_ids(sid)
    if not ids.get("stripe_payment_method_id"):
        raise HTTPException(
            status_code=400,
            detail="Stripe didn't return a payment_method for this session. The customer may have paid with a method that can't be reused off-session.",
        )
    update_set = {}
    if ids.get("stripe_customer_id"):
        update_set["stripe_customer_id"] = ids["stripe_customer_id"]
    if ids.get("stripe_payment_method_id"):
        update_set["stripe_payment_method_id"] = ids["stripe_payment_method_id"]
    if update_set:
        await db.bookings.update_one({"id": booking_id}, {"$set": update_set})
    return {"backfilled": True, **update_set}


@api_router.post("/admin/payments/backfill-saved-cards")
async def admin_backfill_all_saved_cards(_: dict = Depends(require_admin)):
    """Bulk version: scan all paid bookings missing `stripe_payment_method_id` and
    look up their saved card IDs from Stripe. Useful one-shot after this fix."""
    affected = []
    skipped = []
    cursor = db.bookings.find(
        {
            "payment_status": "paid",
            "stripe_payment_method_id": {"$in": [None, ""]},
        },
        {"_id": 0, "id": 1, "payment_session_id": 1, "confirmation_number": 1},
    )
    async for b in cursor:
        sid = b.get("payment_session_id")
        if not sid:
            txn = await db.payment_transactions.find_one({"booking_id": b["id"]}, {"_id": 0})
            sid = txn.get("session_id") if txn else None
        if not sid:
            skipped.append({"id": b["id"], "cn": b.get("confirmation_number"), "reason": "no session id"})
            continue
        ids = await _capture_off_session_ids(sid)
        if not ids.get("stripe_payment_method_id"):
            skipped.append({"id": b["id"], "cn": b.get("confirmation_number"), "reason": "stripe returned no payment_method"})
            continue
        await db.bookings.update_one({"id": b["id"]}, {"$set": ids})
        affected.append({"id": b["id"], "cn": b.get("confirmation_number")})
    return {"backfilled_count": len(affected), "skipped_count": len(skipped), "affected": affected, "skipped": skipped}


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
        # Custom-invoice flow (admin-issued, no booking record)
        try:
            import asyncio as _asyncio
            sess = await _asyncio.to_thread(_stripe_retrieve_session, sid)
            md = (getattr(sess, "metadata", None) or {}) if sess else {}
            if isinstance(md, dict) and md.get("kind") == "custom_invoice" and event.payment_status == "paid":
                await _maybe_mark_custom_invoice_paid(md, sid)
        except Exception as e:
            logging.getLogger(__name__).warning(f"Custom invoice webhook check failed: {e}")
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
                update_set = {
                    "payment_status": "paid",
                    "paid_amount": amount,
                    "paid_currency": txn.get("currency", "usd"),
                    "manage_token": token,
                    "confirmation_number": cn,
                    "quote_amount": booking.get("quote_amount") or amount,
                }
                # Capture customer + payment_method so admin can later trigger
                # off-session wait-time / damage / mid-trip-stop charges.
                ids = await _capture_off_session_ids(sid)
                update_set.update(ids)
                await db.bookings.update_one(
                    {"id": txn["booking_id"]},
                    {"$set": update_set},
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
def _parse_pickup_dt(booking: dict) -> Optional[datetime]:
    """Combine pickup_date + pickup_time into a tz-aware datetime (UTC).
    The site doesn't store a timezone — we assume the pickup time is local Pacific time
    since this is a Bay Area limo service. For tier math we just need a stable delta."""
    d = booking.get("pickup_date")
    t = booking.get("pickup_time") or "00:00"
    if not d:
        return None
    try:
        dt = datetime.strptime(f"{d} {t}", "%Y-%m-%d %H:%M")
        return dt.replace(tzinfo=timezone.utc)
    except Exception:
        return None


def _select_cancellation_tier(hours_until_pickup: float, tiers: List[dict]) -> dict:
    """Return the matching tier (the highest threshold the booking still qualifies for)."""
    sorted_tiers = sorted(
        [t for t in (tiers or [])],
        key=lambda t: float(t.get("hours_before_pickup") or 0),
        reverse=True,
    )
    for tier in sorted_tiers:
        if hours_until_pickup >= float(tier.get("hours_before_pickup") or 0):
            return tier
    # Fallback: lowest tier (or 0%)
    return sorted_tiers[-1] if sorted_tiers else {"hours_before_pickup": 0, "refund_percent": 0}


@api_router.get("/admin/bookings/{booking_id}/refund-preview")
async def admin_refund_preview(booking_id: str, _: dict = Depends(require_admin)):
    """Show what each refund option would pay out for this booking — without actually
    refunding anything. Frontend uses this to populate the refund dialog."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Booking is not paid.")
    paid = float(b.get("paid_amount") or 0)
    settings = await _load_settings()
    pickup_dt = _parse_pickup_dt(b)
    now = datetime.now(timezone.utc)
    hours_until = round((pickup_dt - now).total_seconds() / 3600.0, 1) if pickup_dt else None
    tier = _select_cancellation_tier(hours_until or 0, settings.cancellation_tiers or [])
    tier_pct = float(tier.get("refund_percent") or 0)
    tier_amount = round(paid * tier_pct / 100.0, 2)
    return {
        "paid_amount": paid,
        "hours_until_pickup": hours_until,
        "pickup_in_past": (hours_until is not None and hours_until < 0),
        "full_refund_amount": paid,
        "tier_refund_amount": tier_amount,
        "tier_refund_percent": tier_pct,
        "tier_threshold_hours": float(tier.get("hours_before_pickup") or 0),
        "tiers": settings.cancellation_tiers or [],
        "stripe_fee_estimate": round(paid * 0.029 + 0.30, 2) if paid > 0 else 0.0,
        "cancellation_requested": b.get("cancellation_requested", False),
    }


class RefundRequest(BaseModel):
    amount: Optional[float] = Field(None, ge=0)  # if None → full refund
    reason: Optional[str] = Field(None, max_length=80)  # e.g. "admin_cancel", "tier", "custom", "goodwill"
    note: Optional[str] = Field(None, max_length=300)


@api_router.post("/admin/payments/{booking_id}/refund")
async def admin_refund(booking_id: str, payload: RefundRequest, _: dict = Depends(require_admin)):
    booking = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("payment_status") != "paid":
        raise HTTPException(status_code=400, detail="Booking is not paid")
    # Short-circuit: a $0 refund means "no money moves" — record the metadata only.
    # This lets admin issue a 0% tier (i.e., a hard no-refund cancellation) cleanly.
    if payload.amount is not None and payload.amount <= 0:
        await db.bookings.update_one(
            {"id": booking_id},
            {"$set": {
                "status": "cancelled",
                "refund_amount": 0,
                "refund_reason": (payload.reason or "").strip() or None,
                "refund_note": (payload.note or "").strip() or None,
                "refunded_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        return {"refunded": True, "amount": 0.0, "stripe_refund_id": None, "status": "no_refund"}
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
        r = await cli.post(
            "https://api.stripe.com/v1/refunds",
            headers={**headers, "Content-Type": "application/x-www-form-urlencoded"},
            content=urlencode(form).encode("utf-8"),
        )
        if r.status_code not in (200, 201):
            raise HTTPException(status_code=502, detail=f"Refund failed: {r.text}")
        rj = r.json()

    refund_amount = (rj.get("amount") or 0) / 100.0
    status_label = "refunded" if refund_amount >= float(booking.get("paid_amount") or 0) else "partially_refunded"
    await db.bookings.update_one(
        {"id": booking_id},
        {
            "$set": {
                "payment_status": status_label,
                "status": "cancelled",
                "refund_amount": refund_amount,
                "refund_reason": (payload.reason or "").strip() or None,
                "refund_note": (payload.note or "").strip() or None,
                "refunded_at": datetime.now(timezone.utc).isoformat(),
                "payment_intent_id": pi,
            }
        },
    )
    return {
        "refunded": True,
        "amount": refund_amount,
        "stripe_refund_id": rj.get("id"),
        "status": status_label,
    }


# ---------- Admin: charge wait time (uses driver-recorded minutes) ----------
class AdminWaitTimeChargeRequest(BaseModel):
    minutes_waited: Optional[int] = Field(None, ge=1, le=240)  # optional override; falls back to driver-recorded


@api_router.post("/admin/bookings/{booking_id}/charge-wait-time")
async def admin_charge_wait_time(
    booking_id: str,
    payload: AdminWaitTimeChargeRequest,
    _: dict = Depends(require_admin),
):
    """Admin reviews the wait minutes recorded by the driver (or supplies a value) and
    triggers the off-session Stripe charge against the customer's saved card. Idempotent."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("wait_time_charged_at"):
        return {
            "already_charged": True,
            "amount": b.get("wait_time_fee_amount"),
            "minutes_waited": b.get("wait_time_minutes"),
        }
    if not b.get("wait_time_consent"):
        raise HTTPException(
            status_code=400,
            detail="Customer did not consent to wait-time/damage charges on this booking.",
        )
    pm_id = b.get("stripe_payment_method_id")
    customer_id = b.get("stripe_customer_id")
    if not pm_id or not customer_id:
        raise HTTPException(
            status_code=400,
            detail="No saved card on this booking.",
        )

    minutes_waited = payload.minutes_waited or b.get("wait_time_minutes_pending")
    if not minutes_waited or minutes_waited < 1:
        raise HTTPException(
            status_code=400,
            detail="No wait minutes recorded yet. Ask the driver to record wait time first, or supply a value.",
        )

    pricing = await db.pricing_config.find_one({"vehicle_type": b["vehicle_type"]}, {"_id": 0})
    rate = float((pricing or {}).get("wait_minute_rate") or 0)
    if rate <= 0:
        raise HTTPException(
            status_code=400,
            detail="No wait-time rate set for this vehicle. Configure in Admin → Pricing.",
        )
    grace = _wait_time_grace(b.get("service_type"))
    if minutes_waited <= grace:
        raise HTTPException(
            status_code=400,
            detail=f"Wait time ({minutes_waited} min) is within the {grace}-min grace period — no charge needed.",
        )
    chargeable = minutes_waited - grace
    amount = round(chargeable * rate, 2)
    if amount < 0.50:
        raise HTTPException(status_code=400, detail="Charge too small (under $0.50 minimum).")

    pi = await _stripe_off_session_charge(
        customer_id=customer_id,
        payment_method_id=pm_id,
        amount_cents=int(round(amount * 100)),
        description=f"Wait-time charge ({chargeable} min × ${rate:.2f}) · #{b.get('confirmation_number','')}",
        metadata={
            "booking_id": b["id"],
            "kind": "wait_time",
            "minutes_waited": minutes_waited,
            "chargeable_minutes": chargeable,
        },
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": b["id"]},
        {
            "$set": {
                "wait_time_minutes": minutes_waited,
                "wait_time_fee_amount": amount,
                "wait_time_charged_at": now_iso,
                "wait_time_payment_intent_id": pi.get("id"),
            },
            "$unset": {"wait_time_minutes_pending": ""},
        },
    )

    # Email the customer
    try:
        receipt_html = render_wait_time_charge_email(
            b, chargeable_minutes=chargeable, rate=rate, amount=amount,
            grace_minutes=grace,
        )
        await send_email(
            to=b["email"],
            subject=f"Wait time charge · ${amount:.2f} · #{b.get('confirmation_number','')}",
            html=receipt_html,
            bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
        )
    except Exception as e:
        logger.warning(f"Wait-time email failed: {e}")

    return {
        "charged": True,
        "amount": amount,
        "minutes_waited": minutes_waited,
        "chargeable_minutes": chargeable,
        "rate": rate,
    }


# ---------- Admin: charge damages (separate from wait time) ----------
class AdminDamageChargeRequest(BaseModel):
    amount: float = Field(..., gt=0, le=10000)
    reason: str = Field(..., min_length=4, max_length=500)


@api_router.post("/admin/bookings/{booking_id}/charge-damages")
async def admin_charge_damages(
    booking_id: str,
    payload: AdminDamageChargeRequest,
    _: dict = Depends(require_admin),
):
    """Admin charges the customer's saved card for damages / cleaning / incidentals.
    Each call appends to `damage_charges[]` so multiple incidents are tracked."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if not b.get("wait_time_consent"):
        raise HTTPException(
            status_code=400,
            detail="Customer did not consent to wait-time/damage charges on this booking.",
        )
    pm_id = b.get("stripe_payment_method_id")
    customer_id = b.get("stripe_customer_id")
    if not pm_id or not customer_id:
        raise HTTPException(status_code=400, detail="No saved card on this booking.")

    amount = round(float(payload.amount), 2)
    if amount < 0.50:
        raise HTTPException(status_code=400, detail="Charge too small (under $0.50 minimum).")
    reason = payload.reason.strip()

    pi = await _stripe_off_session_charge(
        customer_id=customer_id,
        payment_method_id=pm_id,
        amount_cents=int(round(amount * 100)),
        description=f"Damage/incidental charge · #{b.get('confirmation_number','')} · {reason[:80]}",
        metadata={
            "booking_id": b["id"],
            "kind": "damages",
            "reason": reason[:200],
        },
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    entry = {
        "amount": amount,
        "reason": reason,
        "charged_at": now_iso,
        "payment_intent_id": pi.get("id"),
    }
    await db.bookings.update_one(
        {"id": b["id"]},
        {"$push": {"damage_charges": entry}},
    )

    # Email the customer (re-use wait-time template generically for now; subject + body wording differs)
    try:
        from email_service import render_damage_charge_email  # local optional import
        receipt_html = render_damage_charge_email(b, amount=amount, reason=reason)
        await send_email(
            to=b["email"],
            subject=f"Incidental charge · ${amount:.2f} · #{b.get('confirmation_number','')}",
            html=receipt_html,
            bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
        )
    except Exception as e:
        logger.warning(f"Damage-charge email failed (non-fatal): {e}")

    return {"charged": True, "amount": amount, "reason": reason, "payment_intent_id": pi.get("id")}


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
    # NOTE: The auto-cancel sweep for abandoned Stripe checkouts used to live here
    # (it fired on every dashboard load). It now runs as a scheduled background job
    # (_sweep_abandoned_checkouts, hourly) so a dashboard refresh is purely a read.
    cursor = db.bookings.find({}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(1000)
    # Defensive: a single malformed legacy booking (missing required field,
    # unexpected enum, etc.) must NOT take down the entire admin dashboard.
    out = []
    for i in items:
        try:
            out.append(Booking(**i))
        except Exception as e:
            logger.warning(f"list_bookings: skipping malformed booking {i.get('id','?')}: {e}")
    return out


@api_router.patch("/admin/bookings/{booking_id}", response_model=Booking)
async def update_booking_status(
    booking_id: str,
    payload: BookingStatusUpdate,
    request: Request,
    admin: dict = Depends(require_admin),
):
    if payload.status not in BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {BOOKING_STATUSES}")

    update_doc = {"status": payload.status}
    if payload.status == "completed":
        update_doc["completed_at"] = datetime.now(timezone.utc).isoformat()

    # When admin moves the booking to cancelled, stamp who did it + when so we
    # never lose the audit trail (visible as a badge in the admin UI).
    if payload.status == "cancelled":
        now_iso = datetime.now(timezone.utc).isoformat()
        update_doc["cancellation_source"] = "admin"
        update_doc["cancelled_at"] = now_iso
        update_doc["cancelled_by_admin_email"] = admin.get("sub") or ""

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


# ============================================================================
# Custom invoices (admin-issued, off-platform quote requests / affiliate rides)
# ============================================================================

class CustomInvoiceCreate(BaseModel):
    # Client info
    client_name: str = Field(..., min_length=2, max_length=120)
    client_email: EmailStr
    client_phone: Optional[str] = Field(None, max_length=30)
    # Trip info (free-form to support out-of-territory & multi-day)
    pickup_datetime: Optional[str] = None   # ISO local time, free-form acceptable
    pickup_location: Optional[str] = Field(None, max_length=300)
    dropoff_location: Optional[str] = Field(None, max_length=300)
    vehicle_type: Optional[str] = Field(None, max_length=80)
    passengers: Optional[int] = Field(None, ge=1, le=50)
    # Pricing
    amount: float = Field(..., gt=0)        # what the client pays
    affiliate_id: Optional[str] = None      # optional brokered ride link
    affiliate_cost: Optional[float] = Field(None, ge=0)  # what we pay them
    description: Optional[str] = Field(None, max_length=2000)
    internal_notes: Optional[str] = Field(None, max_length=2000)


class CustomInvoice(BaseModel):
    id: str
    invoice_number: str
    client_name: str
    client_email: EmailStr
    client_phone: Optional[str] = None
    pickup_datetime: Optional[str] = None
    pickup_location: Optional[str] = None
    dropoff_location: Optional[str] = None
    vehicle_type: Optional[str] = None
    passengers: Optional[int] = None
    amount: float
    affiliate_id: Optional[str] = None
    affiliate_name: Optional[str] = None
    affiliate_cost: Optional[float] = None
    profit: Optional[float] = None
    description: Optional[str] = None
    internal_notes: Optional[str] = None
    status: str  # "sent" | "paid" | "expired" | "cancelled"
    payment_link: Optional[str] = None
    stripe_session_id: Optional[str] = None
    created_at: str
    paid_at: Optional[str] = None


async def _next_invoice_number() -> str:
    """Monotonic invoice number INV-YYYY-NNNN scoped to the current year."""
    year = datetime.now(timezone.utc).year
    counter_doc = await db.counters.find_one_and_update(
        {"_id": f"invoice_{year}"},
        {"$inc": {"seq": 1}},
        upsert=True,
        return_document=True,
    )
    seq = (counter_doc or {}).get("seq", 1)
    return f"INV-{year}-{seq:04d}"


@api_router.post("/admin/invoices", response_model=CustomInvoice)
async def admin_create_invoice(
    payload: CustomInvoiceCreate,
    request: Request,
    _: dict = Depends(require_admin),
):
    """Create a one-off invoice + Stripe checkout link for quote-only customers."""
    # Optional affiliate link-up
    affiliate_name = None
    if payload.affiliate_id:
        aff = await db.affiliates.find_one(
            {"id": payload.affiliate_id}, {"_id": 0, "id": 1, "name": 1}
        )
        if not aff:
            raise HTTPException(status_code=400, detail="Affiliate not found")
        affiliate_name = aff.get("name")

    invoice_id = str(uuid.uuid4())
    invoice_number = await _next_invoice_number()
    now = datetime.now(timezone.utc).isoformat()

    # Build a clean trip description for the Stripe line-item
    trip_summary = " · ".join(
        [s for s in [
            payload.vehicle_type or "",
            (payload.pickup_location or "") + (f" → {payload.dropoff_location}" if payload.dropoff_location else ""),
            payload.pickup_datetime or "",
        ] if s]
    ) or f"Custom invoice {invoice_number}"

    # Create the Stripe checkout link
    base = str(request.base_url).rstrip("/")
    success_url = f"{base}/invoice/{invoice_id}?success=1"
    cancel_url = f"{base}/invoice/{invoice_id}?cancelled=1"

    checkout = _get_stripe_checkout(request)
    session = await checkout.create_checkout_session(
        CheckoutSessionRequest(
            amount=round(float(payload.amount), 2),
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "kind": "custom_invoice",
                "invoice_id": invoice_id,
                "invoice_number": invoice_number,
                "client_email": payload.client_email,
                "client_name": payload.client_name,
            },
        )
    )

    profit = None
    if payload.affiliate_cost is not None:
        profit = round(float(payload.amount) - float(payload.affiliate_cost), 2)

    doc = {
        "id": invoice_id,
        "invoice_number": invoice_number,
        "client_name": payload.client_name.strip(),
        "client_email": payload.client_email.lower(),
        "client_phone": payload.client_phone,
        "pickup_datetime": payload.pickup_datetime,
        "pickup_location": payload.pickup_location,
        "dropoff_location": payload.dropoff_location,
        "vehicle_type": payload.vehicle_type,
        "passengers": payload.passengers,
        "amount": round(float(payload.amount), 2),
        "affiliate_id": payload.affiliate_id,
        "affiliate_name": affiliate_name,
        "affiliate_cost": (round(float(payload.affiliate_cost), 2) if payload.affiliate_cost is not None else None),
        "profit": profit,
        "description": payload.description or trip_summary,
        "internal_notes": payload.internal_notes,
        "status": "sent",
        "payment_link": session.url,
        "stripe_session_id": session.session_id,
        "created_at": now,
        "paid_at": None,
    }
    await db.custom_invoices.insert_one(dict(doc))

    # Best-effort email — send the payment link to the client
    try:
        from server import _send_invoice_email  # type: ignore
        await _send_invoice_email(doc)  # noqa
    except Exception:
        pass  # email failure shouldn't block invoice creation

    return CustomInvoice(**doc)


@api_router.get("/admin/invoices", response_model=List[CustomInvoice])
async def admin_list_invoices(
    status: Optional[str] = None,
    _: dict = Depends(require_admin),
):
    query = {}
    if status:
        query["status"] = status
    items: List[CustomInvoice] = []
    async for d in db.custom_invoices.find(query, {"_id": 0}).sort("created_at", -1).limit(500):
        items.append(CustomInvoice(**d))
    return items


@api_router.get("/admin/invoices/{invoice_id}", response_model=CustomInvoice)
async def admin_get_invoice(invoice_id: str, _: dict = Depends(require_admin)):
    d = await db.custom_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return CustomInvoice(**d)


@api_router.post("/admin/invoices/{invoice_id}/cancel")
async def admin_cancel_invoice(invoice_id: str, _: dict = Depends(require_admin)):
    d = await db.custom_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Invoice not found")
    if d.get("status") == "paid":
        raise HTTPException(status_code=400, detail="Cannot cancel a paid invoice")
    await db.custom_invoices.update_one(
        {"id": invoice_id}, {"$set": {"status": "cancelled"}}
    )
    return {"ok": True}


@api_router.post("/admin/invoices/{invoice_id}/resend")
async def admin_resend_invoice(invoice_id: str, _: dict = Depends(require_admin)):
    d = await db.custom_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Invoice not found")
    try:
        from server import _send_invoice_email  # type: ignore
        await _send_invoice_email(d)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to send: {e}")
    return {"ok": True}


# Webhook hook: when Stripe says a custom_invoice session completed, mark paid.
# (We patch the existing webhook handler — see further down in this file.)
async def _maybe_mark_custom_invoice_paid(session_metadata: dict, session_id: str) -> None:
    if (session_metadata or {}).get("kind") != "custom_invoice":
        return
    invoice_id = session_metadata.get("invoice_id")
    if not invoice_id:
        return
    await db.custom_invoices.update_one(
        {"id": invoice_id, "status": {"$ne": "paid"}},
        {"$set": {"status": "paid", "paid_at": datetime.now(timezone.utc).isoformat()}},
    )


def _stripe_retrieve_session(session_id: str):
    """Sync helper used inside `asyncio.to_thread()` from the webhook."""
    import stripe as _stripe
    _stripe.api_key = os.environ.get("STRIPE_API_KEY", "")
    if not _stripe.api_key:
        return None
    try:
        return _stripe.checkout.Session.retrieve(session_id)
    except Exception:
        return None


async def _send_invoice_email(invoice: dict) -> None:
    """Email the payment link to the client."""
    html = _render_invoice_email_html(invoice)
    subject = f"Your TuranEliteLimo invoice {invoice.get('invoice_number','')}"
    await send_email(
        to=invoice["client_email"],
        subject=subject,
        html=html,
        reply_to="support@turanelitelimo.com",
    )


def _render_invoice_email_html(inv: dict) -> str:
    pay_url = inv.get("payment_link") or "#"
    trip_lines = []
    if inv.get("pickup_datetime"):
        trip_lines.append(f"<tr><td style='padding:6px 0;color:#888'>Pickup time</td><td style='padding:6px 0;color:#fff'>{inv['pickup_datetime']}</td></tr>")
    if inv.get("pickup_location"):
        trip_lines.append(f"<tr><td style='padding:6px 0;color:#888'>From</td><td style='padding:6px 0;color:#fff'>{inv['pickup_location']}</td></tr>")
    if inv.get("dropoff_location"):
        trip_lines.append(f"<tr><td style='padding:6px 0;color:#888'>To</td><td style='padding:6px 0;color:#fff'>{inv['dropoff_location']}</td></tr>")
    if inv.get("vehicle_type"):
        trip_lines.append(f"<tr><td style='padding:6px 0;color:#888'>Vehicle</td><td style='padding:6px 0;color:#fff'>{inv['vehicle_type']}</td></tr>")
    if inv.get("passengers"):
        trip_lines.append(f"<tr><td style='padding:6px 0;color:#888'>Passengers</td><td style='padding:6px 0;color:#fff'>{inv['passengers']}</td></tr>")
    trip_html = "".join(trip_lines) or "<tr><td style='padding:6px 0;color:#fff' colspan='2'>Custom service</td></tr>"
    desc = (inv.get("description") or "").strip()
    desc_html = f"<p style='color:#aaa;font-size:13px;margin:12px 0 0'>{desc}</p>" if desc else ""
    return f"""
<html><body style="margin:0;background:#0a0a0a;font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#fff;padding:0">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#0a0a0a;padding:40px 16px">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#121212;border-radius:16px;overflow:hidden;border:1px solid #1f1f1f">
        <tr><td style="padding:36px 32px 0;text-align:center">
          <h1 style="color:#D4AF37;font-weight:300;font-size:22px;margin:0;letter-spacing:0.5px">TuranEliteLimo</h1>
          <p style="color:#777;font-size:11px;letter-spacing:3px;margin:6px 0 0;text-transform:uppercase">Invoice {inv.get('invoice_number','')}</p>
        </td></tr>
        <tr><td style="padding:28px 32px 8px">
          <p style="color:#fff;font-size:16px;margin:0">Hi {inv.get('client_name','')},</p>
          <p style="color:#bbb;font-size:14px;line-height:1.6;margin:16px 0 0">
            Here's your private chauffeur invoice. Tap the button below to securely pay
            via Stripe (Apple Pay, Visa, Mastercard, Amex all accepted).
          </p>
          {desc_html}
        </td></tr>
        <tr><td style="padding:24px 32px 0">
          <table width="100%" style="background:#0d0d0d;border:1px solid #1f1f1f;border-radius:10px;padding:18px 20px">
            {trip_html}
            <tr><td style="padding:14px 0 6px;color:#888;border-top:1px solid #1f1f1f">Amount due</td><td style="padding:14px 0 6px;color:#D4AF37;font-size:22px;font-weight:500;text-align:right;border-top:1px solid #1f1f1f">${inv.get('amount',0):.2f}</td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:24px 32px;text-align:center">
          <a href="{pay_url}" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;font-size:14px">Pay invoice securely →</a>
          <p style="color:#666;font-size:11px;margin:18px 0 0">Or copy this link: <br><span style="color:#888">{pay_url}</span></p>
        </td></tr>
        <tr><td style="padding:24px 32px;border-top:1px solid #1f1f1f;text-align:center">
          <p style="color:#888;font-size:12px;margin:0">Questions? Reply to this email or call <a href="tel:+16504100687" style="color:#D4AF37;text-decoration:none">(650) 410-0687</a>.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>
"""


@api_router.post("/admin/bookings/backfill-cancellation-source")
async def backfill_cancellation_source(_: dict = Depends(require_admin)):
    """One-shot backfill: scan all already-cancelled bookings that don't yet
    have a `cancellation_source` and infer it from existing signals so the
    admin UI badges work retroactively (e.g. for Krista's reservation).

    Inference rules (same priorities used by the live cancel paths):
      - cancellation_reason starts with "Checkout abandoned" -> auto_abandoned
      - cancellation_requested == true                        -> customer_web
                                                                 (mobile_app is
                                                                  indistinguishable
                                                                  from web on
                                                                  legacy data,
                                                                  so we stamp
                                                                  the safer web)
      - everything else                                       -> admin
    Returns a count breakdown so the user knows what happened.
    """
    cursor = db.bookings.find(
        {
            "status": "cancelled",
            "$or": [
                {"cancellation_source": {"$exists": False}},
                {"cancellation_source": None},
                {"cancellation_source": ""},
            ],
        },
        {"_id": 0},
    )
    counts = {"auto_abandoned": 0, "customer_web": 0, "admin": 0}
    async for b in cursor:
        reason = (b.get("cancellation_reason") or "").lower()
        if reason.startswith("checkout abandoned"):
            source = "auto_abandoned"
            when = b.get("auto_cancelled_at") or b.get("cancelled_at")
            extra = {"auto_cancelled_at": when} if when else {}
        elif b.get("cancellation_requested"):
            source = "customer_web"
            when = b.get("cancellation_requested_at") or b.get("cancelled_at")
            extra = {}
        else:
            source = "admin"
            when = b.get("cancelled_at")
            extra = {}
        set_doc = {"cancellation_source": source, **extra}
        # Best-effort cancelled_at if missing — use the request timestamp or
        # the booking's created_at as a last-resort marker.
        if not b.get("cancelled_at"):
            set_doc["cancelled_at"] = (
                b.get("cancellation_requested_at")
                or b.get("auto_cancelled_at")
                or b.get("created_at")
            )
        await db.bookings.update_one({"id": b["id"]}, {"$set": set_doc})
        counts[source] += 1
    counts["total"] = counts["auto_abandoned"] + counts["customer_web"] + counts["admin"]
    return {"ok": True, "updated": counts}



# ---------- Admin protected: pricing ----------
class PricingRow(BaseModel):
    model_config = ConfigDict(extra="ignore")
    vehicle_type: str
    base: float = 0.0
    per_mile: float = 0.0
    minimum: float = 0.0
    hourly_rate: float = 0.0
    wait_minute_rate: float = 0.0  # $/min after grace period
    call_only: bool = False
    updated_at: Optional[str] = None


class PricingUpdate(BaseModel):
    base: Optional[float] = Field(None, ge=0)
    per_mile: Optional[float] = Field(None, ge=0)
    minimum: Optional[float] = Field(None, ge=0)
    hourly_rate: Optional[float] = Field(None, ge=0)
    wait_minute_rate: Optional[float] = Field(None, ge=0)
    call_only: Optional[bool] = None


@api_router.get("/admin/pricing", response_model=List[PricingRow])
async def list_pricing(_: dict = Depends(require_admin)):
    cursor = db.pricing_config.find({}, {"_id": 0})
    rows = await cursor.to_list(50)
    by_vt = {r["vehicle_type"]: r for r in rows}
    # Maintain canonical order matching VEHICLE_TYPES
    ordered = [by_vt[v] for v in VEHICLE_TYPES if v in by_vt]
    return [PricingRow(**r) for r in ordered]


@api_router.get("/pricing/wait-rates")
async def public_wait_rates():
    """Public read of wait-time policy for booking form + email rendering."""
    rows = await db.pricing_config.find({}, {"_id": 0}).to_list(50)
    by_vt = {r["vehicle_type"]: float(r.get("wait_minute_rate") or 0) for r in rows}
    ordered = {v: by_vt.get(v, 0.0) for v in VEHICLE_TYPES}
    return {
        "rates": ordered,
        "airport_grace_minutes": 45,
        "default_grace_minutes": 15,
        "no_show_after_minutes_of_wait": 45,
    }


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
    # Defensive: a single malformed legacy doc shouldn't 500 the whole list.
    out = []
    for i in items:
        try:
            out.append(ContactInquiry(**i))
        except Exception as e:
            logger.warning(f"list_contacts: skipping malformed contact {i.get('id','?')}: {e}")
    return out


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


# ============================================================================
# Customer auth (used by the mobile app — separate from admin auth)
# ============================================================================

class CustomerSignupRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    password: str = Field(..., min_length=8, max_length=128)


class CustomerLoginRequest(BaseModel):
    email: EmailStr
    password: str


class CustomerProfile(BaseModel):
    id: str
    name: str
    email: str
    phone: Optional[str] = None


class CustomerAuthResponse(BaseModel):
    token: str
    user: CustomerProfile


def _customer_to_profile(doc: dict) -> CustomerProfile:
    return CustomerProfile(
        id=doc["id"],
        name=doc["name"],
        email=doc["email"],
        phone=doc.get("phone"),
    )


@api_router.post("/customer/signup", response_model=CustomerAuthResponse)
async def customer_signup(payload: CustomerSignupRequest):
    email = payload.email.lower()
    existing = await db.customers.find_one({"email": email}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=409, detail="An account already exists with this email.")
    cid = str(uuid.uuid4())
    doc = {
        "id": cid,
        "name": payload.name.strip(),
        "email": email,
        "phone": (payload.phone or "").strip() or None,
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.customers.insert_one(doc)
    token = create_customer_token(cid, email)
    return CustomerAuthResponse(token=token, user=_customer_to_profile(doc))


@api_router.post("/customer/login", response_model=CustomerAuthResponse)
async def customer_login(payload: CustomerLoginRequest):
    email = payload.email.lower()
    user = await db.customers.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_customer_token(user["id"], email)
    return CustomerAuthResponse(token=token, user=_customer_to_profile(user))


# ----- Social sign-in (Apple + Google) ---------------------------------------

class SocialLoginRequest(BaseModel):
    id_token: str = Field(..., min_length=10)
    # Optional fields Apple may include on FIRST sign-in only (the SDK returns
    # them once; on subsequent sign-ins the name fields are empty). We accept
    # them as a courtesy so the client can pre-populate the customer name.
    full_name: Optional[str] = Field(None, max_length=120)


async def _login_or_link_social(
    provider: str,
    provider_user_id: str,
    email: Optional[str],
    name_hint: Optional[str],
    is_private_email: bool = False,
) -> dict:
    """Find or create a customer for this social identity and return the
    customer document. Linking rules:
      1. (provider, provider_user_id) is the strongest match — use it first.
      2. If no identity row yet, try linking by verified email (NOT for Apple
         private relay addresses — those would link unrelated accounts).
      3. Otherwise create a new customer.
    """
    from social_oauth import verify_apple_id_token  # noqa - import side-effect safe

    # 1. Existing OAuth identity → reuse linked customer
    identity = await db.oauth_identities.find_one(
        {"provider": provider, "provider_user_id": provider_user_id},
        {"_id": 0},
    )
    if identity:
        customer = await db.customers.find_one({"id": identity["customer_id"]}, {"_id": 0})
        if customer:
            await db.oauth_identities.update_one(
                {"provider": provider, "provider_user_id": provider_user_id},
                {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
            )
            return customer
        # fall through if linked customer was deleted (data integrity issue)

    # 2. Try to link to existing customer by email (skip for Apple private relay)
    customer = None
    if email and not is_private_email:
        customer = await db.customers.find_one({"email": email.lower()}, {"_id": 0})

    # 3. Otherwise create a brand new customer
    if not customer:
        cid = str(uuid.uuid4())
        customer = {
            "id": cid,
            "name": (name_hint or "").strip() or (email.split("@")[0] if email else "Rider"),
            "email": email.lower() if email else f"{provider}-{provider_user_id[:10]}@noemail.invalid",
            "phone": None,
            "password_hash": None,  # social-only account
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auth_provider": provider,
        }
        await db.customers.insert_one(dict(customer))

    # Create the OAuth identity row
    await db.oauth_identities.insert_one({
        "id": str(uuid.uuid4()),
        "customer_id": customer["id"],
        "provider": provider,
        "provider_user_id": provider_user_id,
        "email": email.lower() if email else None,
        "is_private_email": bool(is_private_email),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_login_at": datetime.now(timezone.utc).isoformat(),
    })

    return customer


@api_router.post("/customer/oauth/apple", response_model=CustomerAuthResponse)
async def customer_oauth_apple(payload: SocialLoginRequest):
    from social_oauth import verify_apple_id_token
    claims = verify_apple_id_token(payload.id_token)
    apple_sub = claims.get("sub")
    if not apple_sub:
        raise HTTPException(status_code=401, detail="Apple token missing subject")
    email = claims.get("email")
    is_private = bool(claims.get("is_private_email") or claims.get("is_private"))
    customer = await _login_or_link_social(
        provider="apple",
        provider_user_id=apple_sub,
        email=email,
        name_hint=payload.full_name,
        is_private_email=is_private,
    )
    token = create_customer_token(customer["id"], customer["email"])
    return CustomerAuthResponse(token=token, user=_customer_to_profile(customer))


@api_router.post("/customer/oauth/google", response_model=CustomerAuthResponse)
async def customer_oauth_google(payload: SocialLoginRequest):
    from social_oauth import verify_google_id_token
    claims = verify_google_id_token(payload.id_token)
    google_sub = claims.get("sub")
    if not google_sub:
        raise HTTPException(status_code=401, detail="Google token missing subject")
    email = claims.get("email")
    name_hint = payload.full_name or claims.get("name") or claims.get("given_name")
    customer = await _login_or_link_social(
        provider="google",
        provider_user_id=google_sub,
        email=email,
        name_hint=name_hint,
        is_private_email=False,
    )
    token = create_customer_token(customer["id"], customer["email"])
    return CustomerAuthResponse(token=token, user=_customer_to_profile(customer))


# ----- Customer forgot password (Resend email + reset token) -----

class CustomerForgotPasswordRequest(BaseModel):
    email: EmailStr


class CustomerResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


@api_router.post("/customer/forgot-password")
async def customer_forgot_password(payload: CustomerForgotPasswordRequest):
    """Email the customer a one-time password-reset link.
    Always returns 200 even if the email is unknown — prevents user enumeration."""
    email = payload.email.lower().strip()
    user = await db.customers.find_one({"email": email}, {"_id": 0, "id": 1, "name": 1})
    if user:
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        await db.password_reset_tokens.insert_one({
            "token": token,
            "customer_id": user["id"],
            "email": email,
            "expires_at": expires,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        reset_url = f"{SITE_BASE_URL}/reset-password?token={token}"
        try:
            from email_service import send_email
            html = f"""
            <div style="background:#050505;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#fff;">
              <div style="max-width:520px;margin:0 auto;background:#0e0e0e;border:1px solid rgba(212,175,55,0.2);border-radius:16px;padding:32px;">
                <div style="text-align:center;margin-bottom:24px;">
                  <img src="{SITE_BASE_URL}/logo-mark.png" alt="TuranEliteLimo" style="height:60px;">
                </div>
                <h1 style="color:#D4AF37;font-size:22px;font-weight:400;margin:0 0 12px;">Reset your password</h1>
                <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;">
                  Hi {user.get('name') or 'there'}, we received a request to reset your TuranEliteLimo password.
                  Click the button below to choose a new one. This link expires in 2 hours.
                </p>
                <div style="text-align:center;margin:28px 0;">
                  <a href="{reset_url}" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600;font-size:14px;">Reset password</a>
                </div>
                <p style="color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;">
                  If you didn't ask to reset your password, you can safely ignore this email. The link will expire on its own.
                </p>
                <p style="color:rgba(255,255,255,0.3);font-size:11px;line-height:1.5;margin-top:24px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
                  TuranEliteLimo · Bay Area &amp; Northern California · (650) 410-0687
                </p>
              </div>
            </div>
            """
            await send_email(to=email, subject="Reset your TuranEliteLimo password", html=html)
        except Exception as e:
            logger.error(f"Forgot-password email send failed for {email}: {e}")
    # Generic response — never reveal whether the email exists
    return {"ok": True, "message": "If an account exists for this email, a reset link has been sent."}


@api_router.post("/customer/reset-password")
async def customer_reset_password(payload: CustomerResetPasswordRequest):
    rec = await db.password_reset_tokens.find_one({"token": payload.token, "used": False}, {"_id": 0})
    if not rec:
        raise HTTPException(status_code=400, detail="Reset link is invalid or has already been used.")
    if rec.get("expires_at") and rec["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")
    await db.customers.update_one(
        {"id": rec["customer_id"]},
        {"$set": {"password_hash": hash_password(payload.new_password), "password_reset_at": datetime.now(timezone.utc).isoformat()}},
    )
    await db.password_reset_tokens.update_one(
        {"token": payload.token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "message": "Password updated. Please sign in with your new password."}


@api_router.get("/customer/me", response_model=CustomerProfile)
async def customer_me(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    user = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    return _customer_to_profile(user)


# ============================================================================
# Customer self-service endpoints (v1.0 — wires the mobile app's profile menu).
# Each endpoint requires a valid customer JWT (require_customer dependency).
# ============================================================================

class CustomerProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    phone: Optional[str] = Field(None, max_length=30)


@api_router.patch("/customer/me", response_model=CustomerProfile)
async def customer_update_profile(payload: CustomerProfileUpdate, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    update = {k: v for k, v in payload.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")
    update["updated_at"] = datetime.now(timezone.utc).isoformat()
    r = await db.customers.update_one({"id": cid}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Account not found")
    user = await db.customers.find_one({"id": cid}, {"_id": 0})
    return _customer_to_profile(user)


# ----- Saved addresses -----
class SavedAddress(BaseModel):
    id: str
    label: str  # "Home", "Work", "Mom's place", etc
    address: str
    is_default_pickup: bool = False
    is_default_dropoff: bool = False
    created_at: str


class SavedAddressCreate(BaseModel):
    label: str = Field(..., min_length=1, max_length=40)
    address: str = Field(..., min_length=3, max_length=300)
    is_default_pickup: bool = False
    is_default_dropoff: bool = False


@api_router.get("/customer/me/addresses", response_model=List[SavedAddress])
async def customer_list_addresses(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    cursor = db.customer_addresses.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1)
    return [SavedAddress(**doc) async for doc in cursor]


@api_router.post("/customer/me/addresses", response_model=SavedAddress)
async def customer_create_address(payload: SavedAddressCreate, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    doc = {
        "id": str(uuid.uuid4()),
        "customer_id": cid,
        "label": payload.label.strip(),
        "address": payload.address.strip(),
        "is_default_pickup": payload.is_default_pickup,
        "is_default_dropoff": payload.is_default_dropoff,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    # If marking default, clear the flag on siblings
    if payload.is_default_pickup:
        await db.customer_addresses.update_many({"customer_id": cid}, {"$set": {"is_default_pickup": False}})
    if payload.is_default_dropoff:
        await db.customer_addresses.update_many({"customer_id": cid}, {"$set": {"is_default_dropoff": False}})
    await db.customer_addresses.insert_one(doc.copy())
    return SavedAddress(**{k: v for k, v in doc.items() if k != "customer_id"})


@api_router.delete("/customer/me/addresses/{address_id}")
async def customer_delete_address(address_id: str, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    r = await db.customer_addresses.delete_one({"id": address_id, "customer_id": cid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"deleted": True}


# ----- Promo history (which promos this customer has actually used) -----
@api_router.get("/customer/me/promos")
async def customer_promo_history(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    # Get all the customer's bookings that have promo_code set
    cursor = db.bookings.find(
        {"customer_id": cid, "promo_code": {"$exists": True, "$ne": None, "$ne": ""}},
        {"_id": 0, "promo_code": 1, "promo_discount_amount": 1, "created_at": 1, "confirmation_number": 1},
    ).sort("created_at", -1)
    items = []
    async for b in cursor:
        items.append({
            "promo_code": b.get("promo_code"),
            "discount_amount": b.get("promo_discount_amount") or 0,
            "used_at": b.get("created_at"),
            "confirmation_number": b.get("confirmation_number") or "",
        })
    return items


# ----- Notification preferences -----
class NotificationPrefs(BaseModel):
    ride_updates_push: bool = True
    ride_updates_email: bool = True
    promotions_push: bool = False
    promotions_email: bool = False
    receipts_email: bool = True


@api_router.get("/customer/me/notifications", response_model=NotificationPrefs)
async def customer_get_notification_prefs(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    user = await db.customers.find_one({"id": cid}, {"_id": 0, "notification_prefs": 1})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    return NotificationPrefs(**(user.get("notification_prefs") or {}))


@api_router.patch("/customer/me/notifications", response_model=NotificationPrefs)
async def customer_update_notification_prefs(payload: NotificationPrefs, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    r = await db.customers.update_one(
        {"id": cid},
        {"$set": {"notification_prefs": payload.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Account not found")
    return payload


# ----- Privacy & Security: change password + delete account -----
class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=200)


@api_router.post("/customer/me/change-password")
async def customer_change_password(payload: ChangePasswordRequest, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    user = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    if not bcrypt.checkpw(payload.current_password.encode(), user.get("password_hash", "").encode()):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    new_hash = bcrypt.hashpw(payload.new_password.encode(), bcrypt.gensalt()).decode()
    await db.customers.update_one(
        {"id": cid},
        {"$set": {"password_hash": new_hash, "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True}


@api_router.delete("/customer/me")
async def customer_delete_account(claims: dict = Depends(require_customer)):
    """Soft-delete: anonymize the account but keep booking history for accounting."""
    cid = claims.get("customer_id")
    user = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    anon = {
        "name": "Deleted user",
        "email": f"deleted+{cid[:8]}@deleted.local",
        "phone": "",
        "password_hash": "",
        "deleted": True,
        "deleted_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.customers.update_one({"id": cid}, {"$set": anon})
    await db.customer_addresses.delete_many({"customer_id": cid})
    return {"ok": True}


# ============================================================================
# Push notifications — Expo Push Tokens & dispatch helpers
# ----------------------------------------------------------------------------
# Riders & drivers register their Expo push token on app launch / login.
# When dispatch / ride-status events fire, we send pushes via Expo's HTTP API.
# This module is intentionally fail-soft: a network error never blocks the
# booking pipeline.
# ============================================================================
class PushTokenIn(BaseModel):
    token: str = Field(..., min_length=10, max_length=200)
    platform: Optional[str] = Field(None, max_length=20)
    device_model: Optional[str] = Field(None, max_length=120)


@api_router.post("/customer/push-token")
async def customer_register_push_token(payload: PushTokenIn, claims: dict = Depends(require_customer)):
    """Save the Expo push token on the rider's customer document. Idempotent."""
    cid = claims.get("customer_id")
    await db.customers.update_one(
        {"id": cid},
        {"$set": {
            "push_token": payload.token,
            "push_platform": payload.platform or "ios",
            "push_device": payload.device_model or "",
            "push_registered_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True}


# The driver push-token endpoint is defined later in this file, after
# `require_driver` is declared (around line 5614).


async def _send_expo_push(tokens: List[str], title: str, body: str, data: Optional[Dict] = None, channel_id: str = "ride-updates"):
    """Best-effort send to Expo Push API. Silent on any failure — pushes are
    additive UX, never blockers."""
    if not tokens:
        return
    try:
        import httpx
        messages = [
            {
                "to": t,
                "title": title,
                "body": body,
                "data": data or {},
                "sound": "default",
                "channelId": channel_id,
                "priority": "high",
            }
            for t in tokens if t and t.startswith("ExponentPushToken")
        ]
        if not messages:
            return
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(
                "https://exp.host/--/api/v2/push/send",
                headers={"Accept": "application/json", "Content-Type": "application/json"},
                json=messages,
            )
    except Exception as e:
        logger.warning(f"Expo push send failed (non-fatal): {e}")


async def _push_to_customer(customer_id: str, title: str, body: str, data: Optional[Dict] = None):
    """Send a ride-update push to a specific rider, by customer_id."""
    cust = await db.customers.find_one({"id": customer_id}, {"_id": 0, "push_token": 1})
    if cust and cust.get("push_token"):
        await _send_expo_push([cust["push_token"]], title, body, data, channel_id="ride-updates")


async def _push_to_driver(driver_id: str, title: str, body: str, data: Optional[Dict] = None):
    """Send a dispatch push to a specific driver, by drivers.id."""
    drv = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "push_token": 1})
    if drv and drv.get("push_token"):
        await _send_expo_push([drv["push_token"]], title, body, data, channel_id="dispatch-alerts")





# ----- Help & Support: contact form from inside the app -----
class CustomerHelpRequest(BaseModel):
    subject: str = Field(..., min_length=2, max_length=120)
    message: str = Field(..., min_length=2, max_length=4000)
    booking_id: Optional[str] = None


@api_router.post("/customer/me/help")
async def customer_submit_help(payload: CustomerHelpRequest, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    user = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    # Reuse the existing contacts collection so admin sees this in the Contacts tab
    doc = {
        "id": str(uuid.uuid4()),
        "name": user.get("name") or "",
        "email": user.get("email") or "",
        "phone": user.get("phone") or "",
        "subject": payload.subject.strip(),
        "message": payload.message.strip(),
        "source": "mobile_app",
        "customer_id": cid,
        "booking_id": payload.booking_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.contacts.insert_one(doc.copy())
    # Notify admin via SMS
    try:
        admin_to = sms_service.admin_phone()
        if admin_to:
            await sms_service.send_sms(
                admin_to,
                f"TuranEliteLimo · 💬 IN-APP HELP REQUEST\n"
                f"{user.get('name') or 'Customer'} · {user.get('phone') or ''}\n"
                f"Subject: {payload.subject[:60]}\n"
                f"Open admin → Contacts.",
            )
    except Exception as e:
        logger.warning(f"Help-request admin SMS failed: {e}")
    return {"ok": True}


# ============================================================================
# Admin: Riders management (lets admin see all riders + trigger password reset)
# ============================================================================
@api_router.get("/admin/riders")
async def admin_list_riders(_: dict = Depends(require_admin)):
    cursor = db.customers.find(
        {"deleted": {"$ne": True}},
        {"_id": 0, "id": 1, "name": 1, "email": 1, "phone": 1, "created_at": 1, "updated_at": 1},
    ).sort("created_at", -1)
    items = []
    async for c in cursor:
        # Count bookings + total spent
        bookings_count = await db.bookings.count_documents({"customer_id": c["id"]})
        # Sum paid amounts
        pipe = [
            {"$match": {"customer_id": c["id"], "payment_status": "paid"}},
            {"$group": {"_id": None, "total": {"$sum": "$paid_amount"}}},
        ]
        total_cursor = db.bookings.aggregate(pipe)
        total = 0.0
        async for row in total_cursor:
            total = float(row.get("total") or 0)
        items.append({
            **c,
            "bookings_count": bookings_count,
            "total_spent": total,
        })
    return items


@api_router.post("/admin/riders/{rider_id}/send-password-reset")
async def admin_send_rider_password_reset(rider_id: str, _: dict = Depends(require_admin)):
    """Admin triggers a password reset email for a customer who lost their password."""
    user = await db.customers.find_one({"id": rider_id, "deleted": {"$ne": True}}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Rider not found")
    token = secrets.token_urlsafe(40)
    expires_at = (datetime.now(timezone.utc) + timedelta(hours=1)).isoformat()
    await db.password_reset_tokens.insert_one({
        "token": token,
        "customer_id": user["id"],
        "email": user["email"],
        "used": False,
        "expires_at": expires_at,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    reset_url = f"{SITE_BASE_URL}/reset-password?token={token}"
    try:
        html = f"""
        <div style="font-family:Helvetica,Arial,sans-serif;background:#0A0A0A;color:#EDEDED;padding:32px;max-width:560px;margin:auto;">
          <div style="text-align:center;color:#D4AF37;letter-spacing:.3em;font-size:11px;margin-bottom:24px;">TURAN ELITE LIMO</div>
          <h2 style="color:#FFF;font-weight:300;">Password reset requested for you</h2>
          <p style="color:#BFBFBF;line-height:1.6;">
            Hi {user.get('name') or 'there'}, our support team has triggered a password reset on your behalf.
            Tap the button below to choose a new password. The link expires in 1 hour.
          </p>
          <a href="{reset_url}" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600;">Reset password</a>
          <p style="color:#888;font-size:12px;margin-top:24px;">
            If you didn't expect this, you can safely ignore it.
          </p>
        </div>
        """
        await send_email(
            to=user["email"],
            subject="Your TuranEliteLimo password reset link",
            html=html,
        )
    except Exception as e:
        logger.warning(f"Admin-triggered rider password reset email failed: {e}")
        raise HTTPException(status_code=500, detail="Could not send reset email")
    return {"ok": True, "email": user["email"]}



# ----- Customer trip flow (mobile) -----

class CustomerBookingCreate(BaseModel):
    pickup_location: str = Field(..., min_length=2)
    dropoff_location: str = Field(..., min_length=2)
    pickup_datetime: str  # ISO 8601
    vehicle_type: str
    quote_amount: float = Field(..., gt=0)
    passenger_count: int = Field(1, ge=1, le=60)
    promo_code: Optional[str] = None
    notes: Optional[str] = ""
    # Mobile-only optional fields — mirror the website BookingCreate schema so
    # airport transfers and hourly chauffeur bookings can be created from the
    # phone without falling back to the web form.
    service_type: Optional[str] = None  # "A to B Transfer" | "Airport Transfer" | "Hourly Chauffeur"
    flight_number: Optional[str] = Field(None, max_length=20)
    hours: Optional[int] = Field(None, ge=2, le=24)


class CustomerCheckoutResponse(BaseModel):
    booking_id: str
    checkout_url: str
    session_id: str


@api_router.post("/customer/book-and-pay", response_model=CustomerCheckoutResponse)
async def customer_book_and_pay(
    payload: CustomerBookingCreate,
    request: Request,
    claims: dict = Depends(require_customer),
):
    """Mobile-only single-call endpoint: creates a booking + Stripe Checkout session
       configured with a deep-link return URL into the native app."""
    cid = claims.get("customer_id")
    user = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    if payload.vehicle_type not in VEHICLE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid vehicle_type")

    # Parse pickup datetime
    try:
        dt = datetime.fromisoformat(payload.pickup_datetime.replace("Z", "+00:00"))
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid pickup_datetime")
    pickup_date = dt.date().isoformat()
    pickup_time = dt.strftime("%H:%M")

    # Validate optional service_type & extras (mobile flow). Fall back to the
    # default "A to B Transfer" when not specified for backwards compatibility
    # with older app builds.
    svc_type = (payload.service_type or "A to B Transfer").strip()
    if svc_type not in SERVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid service_type. Must be one of {SERVICE_TYPES}")
    if svc_type == "Airport Transfer" and not (payload.flight_number or "").strip():
        raise HTTPException(status_code=400, detail="Flight number is required for Airport Transfer")
    if svc_type == "Hourly Chauffeur" and (not payload.hours or payload.hours < 2):
        raise HTTPException(status_code=400, detail="Hours (>=2) required for Hourly Chauffeur")

    bid = str(uuid.uuid4())
    doc = {
        "id": bid,
        "customer_id": cid,
        "full_name": user["name"],
        "email": user["email"],
        "phone": user.get("phone") or "",
        "service_type": svc_type,
        "pickup_date": pickup_date,
        "pickup_time": pickup_time,
        "pickup_location": payload.pickup_location,
        "dropoff_location": payload.dropoff_location,
        "passengers": payload.passenger_count,
        "luggage_count": 0,
        "child_seat": False,
        "additional_stops": [],
        "return_trip": False,
        "return_location": "",
        "vehicle_type": payload.vehicle_type,
        "notes": payload.notes or "",
        "promo_code": payload.promo_code,
        "wait_time_consent": True,  # Mobile flow shows policy at signup time
        "quote_amount": float(payload.quote_amount),
        "status": "pending",
        # Airport-specific
        "flight_number": (payload.flight_number or "").strip().upper() or None,
        "meet_and_greet": False,
        # Hourly-specific
        "hours": payload.hours if svc_type == "Hourly Chauffeur" else None,
        "payment_status": "unpaid",
        "manage_token": _generate_manage_token(),
        "source": "mobile_app",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.bookings.insert_one(doc)

    # Create Stripe Checkout session with native-app deep link
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    settings = await _load_settings()

    # ----- Apply promo code (matches web flow at /checkout/session) -----
    # Discount is applied to the BASE fare; service fee is added AFTER discount,
    # so a customer using WELCOME20 pays fee on the discounted total — same as web.
    original_amount = float(payload.quote_amount)
    discount_amount = 0.0
    applied_promo = None
    code_raw = (payload.promo_code or "").strip()
    if code_raw:
        promo = await _validate_promo_for_booking(
            code_raw, original_amount, user["email"], payload.vehicle_type,
        )
        if promo.get("ok"):
            discount_amount = round(promo["discount"], 2)
            applied_promo = promo["code"]
        else:
            logger.warning(f"Mobile promo '{code_raw}' rejected for {bid}: {promo.get('reason')}")

    fare_after_discount = round(original_amount - discount_amount, 2)
    if fare_after_discount < 0.5:
        fare_after_discount = 0.5
        discount_amount = round(original_amount - fare_after_discount, 2)

    fee_pct = float(settings.service_fee_percent or 0)
    fee = round(fare_after_discount * fee_pct / 100.0, 2)
    total = round(fare_after_discount + fee, 2)
    amount_cents = int(round(total * 100))

    # Persist final amounts onto the booking so the receipt + admin views show the
    # actual numbers (not the pre-discount quote).
    booking_updates = {}
    if applied_promo:
        booking_updates["promo_code"] = applied_promo
        booking_updates["discount_amount"] = discount_amount
        booking_updates["original_quote_amount"] = original_amount
        booking_updates["quote_amount"] = fare_after_discount
    if booking_updates:
        await db.bookings.update_one({"id": bid}, {"$set": booking_updates})

    # Deep-link back into the native app (registered via app.json scheme + universal links).
    # Stripe interpolates {CHECKOUT_SESSION_ID} into the success_url at redirect time.
    # On native iOS/Android Expo Go the app handles the deep link via Linking.
    # On web (browser preview at /m/), custom schemes don't work — fall back to a regular https URL.
    ua = (request.headers.get("user-agent") or "").lower()
    # ExpoGo, React Native and the native Expo client all identify themselves; a real browser doesn't.
    is_native_app = "expo" in ua or "reactnative" in ua or "okhttp" in ua or "darwin" in ua
    if not is_native_app:
        web_origin = str(request.base_url).rstrip("/")
        success_url = f"{web_origin}/m/?booking_id={bid}&session_id={{CHECKOUT_SESSION_ID}}"
        cancel_url = f"{web_origin}/m/"
    else:
        # Use HTTPS URLs so Chrome Custom Tabs (Android) and ASWebAuthenticationSession (iOS)
        # can both reliably detect the redirect and auto-dismiss. The mobile app sets the
        # redirectUrl prefix to "https://turanelitelimo.com/thank-you" so any URL starting
        # with that triggers completion. The /thank-you web page flashes briefly before
        # the in-app browser closes itself.
        success_url = (
            f"https://turanelitelimo.com/thank-you?booking_id={bid}&session_id={{CHECKOUT_SESSION_ID}}&mobile=1"
        )
        cancel_url = f"https://turanelitelimo.com/?pay_cancelled=1&booking_id={bid}"

    form = [
        ("mode", "payment"),
        ("success_url", success_url),
        ("cancel_url", cancel_url),
        # Save the customer's card for future off-session charges (wait-time,
        # mid-trip detour, damages). Matches the web /book flow behavior so
        # admin/dispatch can pull the saved card from the booking later.
        ("customer_creation", "always"),
        ("payment_intent_data[setup_future_usage]", "off_session"),
        ("line_items[0][quantity]", "1"),
        ("line_items[0][price_data][currency]", settings.currency),
        ("line_items[0][price_data][unit_amount]", str(amount_cents)),
        ("line_items[0][price_data][product_data][name]",
            f"{payload.vehicle_type} · {payload.pickup_location[:40]} → {payload.dropoff_location[:40]}"),
        ("customer_email", user["email"]),
        ("metadata[booking_id]", bid),
        ("metadata[customer_id]", cid),
        ("metadata[source]", "mobile_app"),
    ]
    async with httpx.AsyncClient(timeout=15.0) as cli:
        r = await cli.post(
            "https://api.stripe.com/v1/checkout/sessions",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/x-www-form-urlencoded",
            },
            content=urlencode(form).encode("utf-8"),
        )
    if r.status_code != 200:
        logger.error(f"Stripe mobile checkout failed: {r.status_code} {r.text[:300]}")
        raise HTTPException(status_code=502, detail="Could not start Stripe checkout")
    sess = r.json()
    url = sess.get("url")
    sid = sess.get("id")
    if not url or not sid:
        raise HTTPException(status_code=502, detail="Stripe returned an invalid session")

    await db.bookings.update_one(
        {"id": bid},
        {"$set": {"payment_status": "pending", "payment_session_id": sid}},
    )
    return CustomerCheckoutResponse(booking_id=bid, checkout_url=url, session_id=sid)


class CustomerTripSummary(BaseModel):
    id: str
    confirmation_number: Optional[str] = None
    pickup_date: str
    pickup_time: str
    pickup_location: str
    dropoff_location: str
    vehicle_type: str
    quote_amount: Optional[float] = None
    status: str
    payment_status: Optional[str] = None
    trip_status: Optional[str] = None
    created_at: Optional[str] = None


@api_router.get("/customer/trips", response_model=List[CustomerTripSummary])
async def customer_trips(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    cursor = db.bookings.find(
        {"customer_id": cid},
        {"_id": 0, "id": 1, "confirmation_number": 1, "pickup_date": 1, "pickup_time": 1,
         "pickup_location": 1, "dropoff_location": 1, "vehicle_type": 1, "quote_amount": 1,
         "status": 1, "payment_status": 1, "trip_status": 1, "created_at": 1},
    ).sort("created_at", -1).limit(50)
    rows = await cursor.to_list(50)
    return [CustomerTripSummary(**r) for r in rows]


@api_router.get("/customer/bookings/{booking_id}")
async def customer_booking_detail(booking_id: str, claims: dict = Depends(require_customer)):
    """For the deep-link return — confirm payment and show trip details."""
    cid = claims.get("customer_id")
    b = await db.bookings.find_one({"id": booking_id, "customer_id": cid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    # If payment is still 'pending' but Stripe says paid, sync it.
    if b.get("payment_status") == "pending" and b.get("payment_session_id"):
        api_key = os.environ.get("STRIPE_API_KEY", "")
        if api_key:
            try:
                async with httpx.AsyncClient(timeout=8.0) as cli:
                    r = await cli.get(
                        f"https://api.stripe.com/v1/checkout/sessions/{b['payment_session_id']}",
                        headers={"Authorization": f"Bearer {api_key}"},
                    )
                if r.status_code == 200:
                    sess = r.json()
                    if sess.get("payment_status") == "paid":
                        await db.bookings.update_one(
                            {"id": booking_id},
                            {"$set": {
                                "payment_status": "paid",
                                "status": "confirmed",
                                "paid_amount": (sess.get("amount_total") or 0) / 100.0,
                                "paid_at": datetime.now(timezone.utc).isoformat(),
                            }},
                        )
                        b["payment_status"] = "paid"
                        b["status"] = "confirmed"
            except Exception as ex:
                logger.warning(f"Stripe sync on detail call failed: {ex}")
    return {
        "id": b["id"],
        "confirmation_number": b.get("confirmation_number"),
        "status": b.get("status"),
        "payment_status": b.get("payment_status"),
        "trip_status": b.get("trip_status"),
        "pickup_date": b.get("pickup_date"),
        "pickup_time": b.get("pickup_time"),
        "pickup_location": b.get("pickup_location"),
        "dropoff_location": b.get("dropoff_location"),
        "vehicle_type": b.get("vehicle_type"),
        "quote_amount": b.get("quote_amount"),
        "paid_amount": b.get("paid_amount"),
        "driver_name": b.get("driver_name"),
        "driver_phone": b.get("driver_phone"),
    }


@api_router.post("/customer/bookings/{booking_id}/cancel")
async def customer_jwt_cancel_booking(
    booking_id: str,
    payload: ManageCancelRequest,
    claims: dict = Depends(require_customer),
):
    """JWT-authenticated cancel for the mobile app. Same business rules as
    the token-based /api/bookings/manage/{token}/cancel endpoint:
      - Unpaid: cancelled immediately.
      - Paid:   flagged 'cancellation_requested' for admin refund review.
    """
    cid = claims.get("customer_id")
    b = await db.bookings.find_one({"id": booking_id, "customer_id": cid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    if b.get("status") == "completed":
        raise HTTPException(status_code=400, detail="This ride is already completed.")
    if b.get("status") == "cancelled":
        return {"ok": True, "status": "cancelled", "already_cancelled": True}

    is_paid = b.get("payment_status") == "paid"
    now_iso = datetime.now(timezone.utc).isoformat()
    update_doc = {
        "cancellation_requested": True,
        "cancellation_reason": (payload.reason or "")[:500],
        "cancellation_requested_at": now_iso,
        "cancellation_source": "mobile_app",
    }
    if not is_paid:
        update_doc["status"] = "cancelled"
        update_doc["cancelled_at"] = now_iso
    await db.bookings.update_one({"id": b["id"]}, {"$set": update_doc})

    admin_to = sms_service.admin_phone()
    if admin_to:
        merged = {**b, **update_doc}
        try:
            await sms_service.send_sms(
                admin_to, sms_service.render_cancellation_sms(merged, requested=is_paid)
            )
        except Exception as e:
            logger.warning(f"Admin cancellation SMS failed (mobile): {e}")

    if is_paid:
        return {
            "ok": True,
            "status": "cancellation_requested",
            "message": "We've received your cancellation. Our team will review it and contact you about a refund within 24 hours.",
        }
    return {
        "ok": True,
        "status": "cancelled",
        "message": "Your reservation has been cancelled. We hope to chauffeur you another time.",
    }


@api_router.post("/customer/bookings/{booking_id}/modify")
async def customer_jwt_modify_booking(
    booking_id: str,
    payload: "CustomerModifyBookingRequest",
    claims: dict = Depends(require_customer),
):
    """Modify an unpaid reservation. Customer can change pickup time, pickup/dropoff
    address, vehicle type, passenger count, or notes BEFORE the trip is paid.

    Rules:
      - Booking must belong to this customer.
      - status must be 'pending' or 'confirmed' AND payment_status != 'paid'.
      - completed/cancelled bookings cannot be modified.
      - If pickup/dropoff/vehicle/time changed, we re-compute the quote and
        update quote_amount on the booking. The customer sees the new total on
        their next checkout attempt.
      - If only notes/passengers changed, we leave quote_amount untouched.

    Paid bookings: returns 409 with a message asking the customer to contact dispatch.
    """
    cid = claims.get("customer_id")
    b = await db.bookings.find_one({"id": booking_id, "customer_id": cid}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    if b.get("status") in ("completed", "cancelled"):
        raise HTTPException(status_code=400, detail=f"This trip is {b.get('status')} and can't be modified.")
    if b.get("payment_status") == "paid":
        raise HTTPException(
            status_code=409,
            detail="This reservation is already paid. To make changes, please call dispatch at (650) 410-0687 so we can rebalance the fare and process any refund.",
        )

    update_doc: dict = {}
    pricing_inputs_changed = False

    if payload.pickup_datetime is not None and payload.pickup_datetime != b.get("pickup_datetime"):
        # Parse the new datetime
        try:
            dt = datetime.fromisoformat(payload.pickup_datetime.replace("Z", "+00:00"))
            update_doc["pickup_datetime"] = payload.pickup_datetime
            update_doc["pickup_date"] = dt.strftime("%Y-%m-%d")
            update_doc["pickup_time"] = dt.strftime("%H:%M")
            pricing_inputs_changed = True
        except Exception:
            raise HTTPException(status_code=400, detail="Pickup date/time is invalid.")

    if payload.pickup_location is not None and payload.pickup_location.strip() != (b.get("pickup_location") or "").strip():
        update_doc["pickup_location"] = payload.pickup_location.strip()
        update_doc["pickup_coord"] = None  # clear geocode cache
        pricing_inputs_changed = True

    if payload.dropoff_location is not None and payload.dropoff_location.strip() != (b.get("dropoff_location") or "").strip():
        update_doc["dropoff_location"] = payload.dropoff_location.strip()
        update_doc["dropoff_coord"] = None
        pricing_inputs_changed = True

    if payload.vehicle_type is not None and payload.vehicle_type != b.get("vehicle_type"):
        update_doc["vehicle_type"] = payload.vehicle_type
        pricing_inputs_changed = True

    if payload.passengers is not None and int(payload.passengers) != int(b.get("passengers") or 1):
        update_doc["passengers"] = int(payload.passengers)

    if payload.notes is not None:
        update_doc["notes"] = payload.notes[:1000]

    if not update_doc:
        return {"ok": True, "no_changes": True, "message": "No changes to apply."}

    # Re-compute quote if pricing inputs changed.
    new_quote = None
    if pricing_inputs_changed:
        merged = {**b, **update_doc}
        # _compute_quote_amount short-circuits if quote_amount is already present.
        # Force a fresh quote by clearing the old value from the merged doc.
        merged.pop("quote_amount", None)
        try:
            new_quote = await _compute_quote_amount(merged)
            if new_quote is not None:
                update_doc["quote_amount"] = round(float(new_quote), 2)
        except Exception as e:
            logger.warning(f"Modify booking quote recompute failed: {e}")

    update_doc["modified_at"] = datetime.now(timezone.utc).isoformat()
    update_doc["modified_by"] = "customer"

    await db.bookings.update_one({"id": b["id"]}, {"$set": update_doc})

    return {
        "ok": True,
        "booking_id": b["id"],
        "new_quote_amount": update_doc.get("quote_amount"),
        "previous_quote_amount": b.get("quote_amount"),
        "pricing_changed": pricing_inputs_changed and new_quote is not None,
        "message": "Your reservation has been updated.",
    }


@api_router.get("/vehicle-types")
async def list_vehicle_types_public():
    """Read-only fleet info for the mobile rider app."""
    pricing = await _load_pricing_map()
    out = []
    for vt in VEHICLE_TYPES:
        p = pricing.get(vt, {})
        out.append({
            "vehicle_type": vt,
            "call_only": bool(p.get("call_only", False)),
            "minimum_price": float(p.get("minimum", 0.0)),
            "per_mile": float(p.get("per_mile", 0.0)),
            "hourly_rate": float(p.get("hourly_rate", 0.0)),
        })
    return out


# ============================================================================
# Driver auth (used by the mobile chauffeur app)
# ============================================================================

class DriverLoginRequest(BaseModel):
    email: EmailStr
    password: str


class DriverSetPasswordRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=128)


class DriverForgotPasswordRequest(BaseModel):
    email: EmailStr


class DriverResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


class DriverProfileOut(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    phone: Optional[str] = None
    plate: Optional[str] = None
    vehicle: Optional[str] = None


class DriverAuthResponse(BaseModel):
    token: str
    driver: DriverProfileOut


def _driver_to_profile(doc: dict) -> DriverProfileOut:
    return DriverProfileOut(
        id=doc["id"],
        name=doc.get("name", ""),
        email=doc.get("email"),
        phone=doc.get("phone"),
        plate=doc.get("plate"),
        vehicle=doc.get("vehicle"),
    )


def create_driver_token(driver_id: str, email: str) -> str:
    payload = {
        "sub": email,
        "driver_id": driver_id,
        "role": "driver",
        "exp": datetime.now(timezone.utc) + timedelta(days=30),
        "type": "access",
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def require_driver(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer_scheme)) -> dict:
    if creds is None or not creds.credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(creds.credentials, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if payload.get("role") != "driver":
        raise HTTPException(status_code=403, detail="Driver access required")
    return payload


@api_router.post("/driver-auth/set-password")
async def driver_set_password(payload: DriverSetPasswordRequest):
    """First-time driver onboarding: admin pre-creates the driver record,
    then the driver sets their own password from the mobile app using their email."""
    email = payload.email.lower()
    d = await db.drivers.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="No driver account with this email. Ask dispatch to add you.")
    if d.get("password_hash"):
        raise HTTPException(status_code=409, detail="Password already set. Use Sign In.")
    await db.drivers.update_one(
        {"id": d["id"]},
        {"$set": {"password_hash": hash_password(payload.password), "password_set_at": datetime.now(timezone.utc).isoformat()}},
    )
    fresh = await db.drivers.find_one({"id": d["id"]}, {"_id": 0})
    return DriverAuthResponse(token=create_driver_token(d["id"], email), driver=_driver_to_profile(fresh or d))


@api_router.post("/driver-auth/login", response_model=DriverAuthResponse)
async def driver_login(payload: DriverLoginRequest):
    email = payload.email.lower()
    d = await db.drivers.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
    if not d or not d.get("password_hash") or not verify_password(payload.password, d.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return DriverAuthResponse(token=create_driver_token(d["id"], email), driver=_driver_to_profile(d))


@api_router.post("/driver-auth/forgot-password")
async def driver_forgot_password(payload: DriverForgotPasswordRequest):
    """Email the driver a one-time password-reset link.
    Always returns 200 even if the email is unknown — prevents user enumeration.
    Reset tokens are stored in `password_reset_tokens` with role='driver' so the
    customer + driver flows can share the same collection + TTL index but
    /api/driver-auth/reset-password only accepts driver-role tokens."""
    email = payload.email.lower().strip()
    d = await db.drivers.find_one(
        {"email": {"$regex": f"^{re.escape(email)}$", "$options": "i"}},
        {"_id": 0, "id": 1, "name": 1},
    )
    if d:
        token = secrets.token_urlsafe(32)
        expires = (datetime.now(timezone.utc) + timedelta(hours=2)).isoformat()
        await db.password_reset_tokens.insert_one({
            "token": token,
            "driver_id": d["id"],
            "role": "driver",
            "email": email,
            "expires_at": expires,
            "used": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        reset_url = f"{SITE_BASE_URL}/driver-reset-password?token={token}"
        try:
            from email_service import send_email
            html = f"""
            <div style="background:#050505;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#fff;">
              <div style="max-width:520px;margin:0 auto;background:#0e0e0e;border:1px solid rgba(212,175,55,0.2);border-radius:16px;padding:32px;">
                <div style="text-align:center;margin-bottom:24px;">
                  <img src="{SITE_BASE_URL}/logo-mark.png" alt="TuranEliteLimo" style="height:60px;">
                </div>
                <h1 style="color:#D4AF37;font-size:22px;font-weight:400;margin:0 0 12px;">Reset your driver password</h1>
                <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.6;">
                  Hi {d.get('name') or 'there'}, we received a request to reset your TuranEliteLimo driver password.
                  Click the button below to choose a new one. This link expires in 2 hours.
                </p>
                <div style="text-align:center;margin:28px 0;">
                  <a href="{reset_url}" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:14px 26px;border-radius:999px;font-weight:600;font-size:14px;">Reset password</a>
                </div>
                <p style="color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;">
                  If you didn't ask to reset your password, you can safely ignore this email. The link will expire on its own.
                </p>
                <p style="color:rgba(255,255,255,0.3);font-size:11px;line-height:1.5;margin-top:24px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
                  TuranEliteLimo · Bay Area &amp; Northern California · (650) 410-0687
                </p>
              </div>
            </div>
            """
            await send_email(to=email, subject="Reset your TuranEliteLimo driver password", html=html)
        except Exception as e:
            logger.error(f"Driver forgot-password email send failed for {email}: {e}")
    return {"ok": True, "message": "If a driver account exists for this email, a reset link has been sent."}


@api_router.post("/driver-auth/reset-password")
async def driver_reset_password(payload: DriverResetPasswordRequest):
    """Complete the driver password reset flow using a token from
    /driver-auth/forgot-password."""
    rec = await db.password_reset_tokens.find_one(
        {"token": payload.token, "used": False, "role": "driver"},
        {"_id": 0},
    )
    if not rec:
        raise HTTPException(status_code=400, detail="Reset link is invalid or has already been used.")
    if rec.get("expires_at") and rec["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(status_code=400, detail="Reset link has expired. Please request a new one.")
    await db.drivers.update_one(
        {"id": rec["driver_id"]},
        {"$set": {
            "password_hash": hash_password(payload.new_password),
            "password_reset_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    await db.password_reset_tokens.update_one(
        {"token": payload.token},
        {"$set": {"used": True, "used_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "message": "Password updated. Please sign in with your new password."}


@api_router.post("/admin/drivers/{driver_id}/clear-password")
async def admin_clear_driver_password(driver_id: str, _: dict = Depends(require_admin)):
    """Admin force-reset: wipe a driver's password_hash so they can use the
    one-time /driver-auth/set-password flow again from the mobile app. Useful
    when a driver is locked out and email delivery is unreliable, or for
    onboarding flow re-runs."""
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0, "id": 1, "email": 1})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    await db.drivers.update_one(
        {"id": driver_id},
        {"$unset": {"password_hash": "", "password_set_at": ""},
         "$set": {"password_cleared_by_admin_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "driver_email": d.get("email"), "message": "Driver password cleared. They can now use the 'Set password' flow."}


@api_router.post("/admin/bookings/sync-completed")
async def admin_sync_completed_bookings(_: dict = Depends(require_admin)):
    """Backfill helper: finds bookings whose driver marked trip_status='completed'
    but whose booking.status was left as 'paid'/'confirmed'/etc. (an old bug),
    and stamps them as 'completed'. Idempotent."""
    cursor = db.bookings.find(
        {
            "trip_status": "completed",
            "status": {"$nin": ["completed", "cancelled", "refunded"]},
        },
        {"_id": 0, "id": 1, "status": 1, "completed_at": 1},
    )
    rows = await cursor.to_list(1000)
    fixed = []
    now_iso = datetime.now(timezone.utc).isoformat()
    for r in rows:
        await db.bookings.update_one(
            {"id": r["id"]},
            {"$set": {
                "status": "completed",
                "completed_at": r.get("completed_at") or now_iso,
                "backfilled_to_completed_at": now_iso,
            }},
        )
        fixed.append(r["id"])
    return {"ok": True, "fixed_count": len(fixed), "booking_ids": fixed}


@api_router.post("/driver/push-token")
async def driver_register_push_token(payload: PushTokenIn, claims: dict = Depends(require_driver)):
    """Save the Expo push token on the driver document. Idempotent — safe to
    call on every login from the driver mobile app."""
    did = claims.get("driver_id")
    if not did:
        raise HTTPException(status_code=401, detail="Not a driver")
    await db.drivers.update_one(
        {"id": did},
        {"$set": {
            "push_token": payload.token,
            "push_platform": payload.platform or "ios",
            "push_device": payload.device_model or "",
            "push_registered_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True}




@api_router.get("/driver-auth/me", response_model=DriverProfileOut)
async def driver_me(claims: dict = Depends(require_driver)):
    d = await db.drivers.find_one({"id": claims.get("driver_id")}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    return _driver_to_profile(d)


@api_router.get("/driver-auth/trips")
async def driver_my_trips(claims: dict = Depends(require_driver)):
    """All trips currently assigned to this driver, sorted by pickup time."""
    did = claims.get("driver_id")
    cursor = db.bookings.find(
        {"driver_id": did, "status": {"$in": ["confirmed", "pending"]}},
        {"_id": 0},
    ).sort([("pickup_date", 1), ("pickup_time", 1)]).limit(100)
    rows = await cursor.to_list(100)
    return [
        {
            "id": r["id"],
            "confirmation_number": r.get("confirmation_number"),
            "trip_status": r.get("trip_status") or "assigned",
            "customer_name": r.get("full_name"),
            "customer_phone": r.get("phone"),
            "pickup_date": r.get("pickup_date"),
            "pickup_time": r.get("pickup_time"),
            "pickup_location": r.get("pickup_location"),
            "dropoff_location": r.get("dropoff_location"),
            "passengers": r.get("passengers", 1),
            "vehicle_type": r.get("vehicle_type"),
            "notes": r.get("notes"),
            "quote_amount": r.get("quote_amount"),
        }
        for r in rows
    ]


@api_router.get("/driver-auth/stats")
async def driver_my_stats(claims: dict = Depends(require_driver)):
    """Driver dashboard stats: weekly trips, week revenue, rating placeholder."""
    did = claims.get("driver_id")
    # Last 7 days completed trips
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    completed = await db.bookings.count_documents({"driver_id": did, "status": "completed", "created_at": {"$gte": week_ago}})
    # All-time
    total = await db.bookings.count_documents({"driver_id": did, "status": "completed"})
    # Earnings = sum of quote_amount for completed this week
    pipeline = [
        {"$match": {"driver_id": did, "status": "completed", "created_at": {"$gte": week_ago}}},
        {"$group": {"_id": None, "total": {"$sum": "$quote_amount"}}},
    ]
    agg = await db.bookings.aggregate(pipeline).to_list(1)
    week_earnings = agg[0]["total"] if agg else 0.0
    return {
        "trips_this_week": completed,
        "trips_all_time": total,
        "earnings_this_week": float(week_earnings or 0.0),
        "rating": 4.97,  # Placeholder until reviews tie in
    }


# ----- JWT-driver: trip actions (status / wait time / mid-trip stop) -----
# These mirror the token-based /driver/{token}/* endpoints but use the
# JWT-authenticated driver mobile app instead. Same business logic, same DB writes.

async def _booking_for_jwt_driver(booking_id: str, driver_id: str) -> dict:
    """Fetch a booking & verify it belongs to this JWT-authenticated driver."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    if b.get("driver_id") != driver_id:
        raise HTTPException(status_code=403, detail="This trip is not assigned to you.")
    return b


@api_router.post("/driver-auth/bookings/{booking_id}/status")
async def driver_jwt_update_status(
    booking_id: str,
    payload: DriverStatusUpdate,
    request: Request,
    claims: dict = Depends(require_driver),
):
    """JWT-driver advances trip status (en_route → arrived → on_trip → completed)."""
    b = await _booking_for_jwt_driver(booking_id, claims.get("driver_id"))

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
    if new_status == "completed":
        set_doc["completed_at"] = now_iso
        if b.get("status") in ("confirmed", "pending"):
            set_doc["status"] = "completed"
    await db.bookings.update_one({"id": b["id"]}, {"$set": set_doc})

    # Customer + admin SMS (same logic as token-based endpoint)
    merged = {**b, **set_doc}
    post_trip_url = None
    if new_status == "completed" and b.get("manage_token"):
        origin = _frontend_origin_from_request(request)
        post_trip_url = f"{origin}/post-trip/{b['manage_token']}"
    customer_sms = sms_service.render_customer_status_sms(merged, new_status, post_trip_url=post_trip_url)
    if customer_sms and b.get("phone"):
        try:
            await sms_service.send_sms(b["phone"], customer_sms)
        except Exception as e:
            logger.warning(f"Customer status SMS failed (jwt-driver): {e}")
    admin_to = sms_service.admin_phone()
    if admin_to:
        try:
            await sms_service.send_sms(admin_to, sms_service.render_admin_status_sms(merged, new_status))
        except Exception as e:
            logger.warning(f"Admin status SMS failed (jwt-driver): {e}")

    return {"ok": True, "trip_status": new_status, "trip_status_updated_at": now_iso}


@api_router.post("/driver-auth/bookings/{booking_id}/record-wait-time")
async def driver_jwt_record_wait_time(
    booking_id: str,
    payload: WaitTimeRecordPayload,
    claims: dict = Depends(require_driver),
):
    """JWT-driver records minutes waited; admin reviews & charges from the dashboard.
    Uses the same shared logic as the token-based endpoint so admin charge flow works identically."""
    b = await _booking_for_jwt_driver(booking_id, claims.get("driver_id"))
    return await _record_wait_time_for_booking(b, payload)


@api_router.post("/driver-auth/bookings/{booking_id}/record-mid-trip-stop")
async def driver_jwt_record_mid_trip_stop(
    booking_id: str,
    payload: MidTripStopPayload,
    claims: dict = Depends(require_driver),
):
    """JWT-driver logs an unplanned stop. Uses the shared helper so the schema
    is identical to the token-based endpoint and admin charge flow Just Works."""
    b = await _booking_for_jwt_driver(booking_id, claims.get("driver_id"))
    return await _record_mid_trip_stop_for_booking(b, payload)


@api_router.get("/driver-auth/bookings/{booking_id}")
async def driver_jwt_get_booking(booking_id: str, claims: dict = Depends(require_driver)):
    """Full trip detail for a single trip assigned to this driver."""
    b = await _booking_for_jwt_driver(booking_id, claims.get("driver_id"))
    return {
        "id": b["id"],
        "confirmation_number": b.get("confirmation_number"),
        "trip_status": b.get("trip_status") or "assigned",
        "status": b.get("status"),
        "service_type": b.get("service_type"),
        "customer_name": b.get("full_name"),
        "customer_phone": b.get("phone"),
        "pickup_date": b.get("pickup_date"),
        "pickup_time": b.get("pickup_time"),
        "pickup_location": b.get("pickup_location"),
        "dropoff_location": b.get("dropoff_location"),
        "passengers": b.get("passengers", 1),
        "vehicle_type": b.get("vehicle_type"),
        "notes": b.get("notes"),
        "quote_amount": b.get("quote_amount"),
        "mid_trip_stops": b.get("mid_trip_stops") or [],
        "wait_time_minutes_pending": b.get("wait_time_minutes_pending"),
        "wait_time_charged_at": b.get("wait_time_charged_at"),
        "wait_time_fee_amount": b.get("wait_time_fee_amount"),
        "wait_time_minutes": b.get("wait_time_minutes"),
    }


# ============================================================================
# Live driver location streaming
# - Driver app posts current GPS every ~15s to /driver-auth/location
# - Rider polls /customer/bookings/{id}/driver-location during an active trip
# - Admin web polls /admin/drivers/live to see all drivers
# ============================================================================

class DriverLocationUpdate(BaseModel):
    latitude: float = Field(..., ge=-90, le=90)
    longitude: float = Field(..., ge=-180, le=180)
    # heading/speed validators are intentionally PERMISSIVE.
    # expo-location returns -1 (and sometimes NaN) when the device is stationary
    # or the sensor can't determine direction/speed yet. Strict ge=0 validation
    # turned those legitimate "unknown" sentinels into 422 errors that broke
    # the driver app's location stream. We accept any number and normalise on
    # write (negatives → None).
    heading: Optional[float] = None
    speed: Optional[float] = None
    accuracy: Optional[float] = None
    active_booking_id: Optional[str] = None

    @field_validator("heading", "speed", "accuracy", mode="before")
    @classmethod
    def _drop_negative_sentinels(cls, v):
        # expo/native sentinels for "unknown" come through as -1 (sometimes
        # very large negative numbers). Map those to None so they don't end
        # up in the DB and confuse rider-side rendering.
        if v is None:
            return None
        try:
            f = float(v)
        except (TypeError, ValueError):
            return None
        if f < 0:
            return None
        return f


@api_router.post("/driver-auth/location")
async def driver_post_location(payload: DriverLocationUpdate, claims: dict = Depends(require_driver)):
    did = claims.get("driver_id")
    now = datetime.now(timezone.utc)
    update = {
        "driver_id": did,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "heading": payload.heading,
        "speed": payload.speed,
        "accuracy": payload.accuracy,
        "active_booking_id": payload.active_booking_id,
        "updated_at": now.isoformat(),
        "updated_at_ts": now.timestamp(),
    }
    await db.driver_locations.update_one(
        {"driver_id": did},
        {"$set": update},
        upsert=True,
    )
    # If the driver flagged a booking, mirror the latest fix on that booking for fast rider polls.
    if payload.active_booking_id:
        await db.bookings.update_one(
            {"id": payload.active_booking_id, "driver_id": did},
            {"$set": {
                "driver_latitude": payload.latitude,
                "driver_longitude": payload.longitude,
                "driver_heading": payload.heading,
                "driver_location_updated_at": now.isoformat(),
            }},
        )
    return {"ok": True, "updated_at": now.isoformat()}


@api_router.get("/customer/bookings/{booking_id}/driver-location")
async def customer_driver_location(booking_id: str, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    b = await db.bookings.find_one({"id": booking_id, "customer_id": cid}, {
        "_id": 0, "id": 1, "driver_id": 1, "driver_name": 1, "driver_phone": 1, "driver_plate": 1, "driver_vehicle": 1,
        "driver_email": 1,
        "driver_latitude": 1, "driver_longitude": 1, "driver_heading": 1, "driver_location_updated_at": 1,
        "pickup_location": 1, "dropoff_location": 1, "pickup_coord": 1, "dropoff_coord": 1, "trip_status": 1, "status": 1,
    })
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")

    # Lazy-cache pickup/dropoff coords onto the booking so the rider map can show
    # the pickup pin + route polyline without a geocode call on every poll.
    pickup_coord = b.get("pickup_coord")
    if not pickup_coord and b.get("pickup_location"):
        pickup_coord = await _geocode(b["pickup_location"])
        if pickup_coord:
            await db.bookings.update_one({"id": b["id"]}, {"$set": {"pickup_coord": pickup_coord}})
    dropoff_coord = b.get("dropoff_coord")
    if not dropoff_coord and b.get("dropoff_location"):
        dropoff_coord = await _geocode(b["dropoff_location"])
        if dropoff_coord:
            await db.bookings.update_one({"id": b["id"]}, {"$set": {"dropoff_coord": dropoff_coord}})

    # Driver location resolution — tolerant multi-step lookup:
    #   1. Use the mirrored fields on the booking (fast path, set when the
    #      driver-auth/location endpoint matched booking.driver_id).
    #   2. If those are missing, look up the live row in `driver_locations`
    #      via booking.driver_id (handles dispatch flows where the mirror
    #      update didn't run yet — e.g. driver started GPS before the trip
    #      had driver_id, or the dispatch endpoint set driver_id by a
    #      different identifier).
    #   3. If still missing AND booking has driver_email/driver_phone, look
    #      up the drivers collection by those, then re-query driver_locations.
    #      This catches the case where admin assigned the trip by typing a
    #      name + phone in the web form that didn't exactly match the
    #      driver record on the mobile app account.
    drv_lat = b.get("driver_latitude")
    drv_lng = b.get("driver_longitude")
    drv_heading = b.get("driver_heading")
    drv_updated = b.get("driver_location_updated_at")
    if drv_lat is None or drv_lng is None:
        driver_id_to_try = b.get("driver_id")
        # Fallback 1: try by booking.driver_id
        if driver_id_to_try:
            loc = await db.driver_locations.find_one(
                {"driver_id": driver_id_to_try},
                {"_id": 0, "latitude": 1, "longitude": 1, "heading": 1, "updated_at": 1},
            )
            if loc:
                drv_lat = loc.get("latitude")
                drv_lng = loc.get("longitude")
                drv_heading = loc.get("heading")
                drv_updated = loc.get("updated_at")
        # Fallback 2: try by booking.driver_email / driver_phone → drivers row → driver_locations
        if (drv_lat is None or drv_lng is None) and (b.get("driver_email") or b.get("driver_phone")):
            drv_lookup: Optional[dict] = None
            if b.get("driver_email"):
                drv_lookup = await db.drivers.find_one(
                    {"email": {"$regex": f"^{re.escape(b['driver_email'])}$", "$options": "i"}},
                    {"_id": 0, "id": 1},
                )
            if not drv_lookup and b.get("driver_phone"):
                drv_lookup = await db.drivers.find_one(
                    {"phone": b["driver_phone"]},
                    {"_id": 0, "id": 1},
                )
            if drv_lookup and drv_lookup.get("id"):
                # Backfill booking.driver_id for next time so the fast path works.
                await db.bookings.update_one(
                    {"id": b["id"]},
                    {"$set": {"driver_id": drv_lookup["id"]}},
                )
                loc = await db.driver_locations.find_one(
                    {"driver_id": drv_lookup["id"]},
                    {"_id": 0, "latitude": 1, "longitude": 1, "heading": 1, "updated_at": 1},
                )
                if loc:
                    drv_lat = loc.get("latitude")
                    drv_lng = loc.get("longitude")
                    drv_heading = loc.get("heading")
                    drv_updated = loc.get("updated_at")

    return {
        "booking_id": b["id"],
        "status": b.get("status"),
        "trip_status": b.get("trip_status"),
        "driver": {
            "id": b.get("driver_id"),
            "name": b.get("driver_name"),
            "phone": b.get("driver_phone"),
            "plate": b.get("driver_plate"),
            "vehicle": b.get("driver_vehicle"),
            "latitude": drv_lat,
            "longitude": drv_lng,
            "heading": drv_heading,
            "updated_at": drv_updated,
        },
        "pickup_location": b.get("pickup_location"),
        "dropoff_location": b.get("dropoff_location"),
        "pickup_coord": pickup_coord,
        "dropoff_coord": dropoff_coord,
    }


@api_router.get("/admin/drivers/live")
async def admin_drivers_live(claims: dict = Depends(require_admin)):
    cursor = db.driver_locations.find({}, {"_id": 0}).sort("updated_at_ts", -1).limit(200)
    rows = await cursor.to_list(200)
    # Join with driver basics
    driver_ids = list({r["driver_id"] for r in rows})
    drivers = {}
    async for d in db.drivers.find({"id": {"$in": driver_ids}}, {"_id": 0, "id": 1, "name": 1, "plate": 1, "vehicle": 1, "phone": 1}):
        drivers[d["id"]] = d
    now_ts = datetime.now(timezone.utc).timestamp()
    out = []
    for r in rows:
        d = drivers.get(r["driver_id"], {})
        age = now_ts - (r.get("updated_at_ts") or 0)
        out.append({
            "driver_id": r["driver_id"],
            "name": d.get("name") or "Driver",
            "plate": d.get("plate"),
            "vehicle": d.get("vehicle"),
            "phone": d.get("phone"),
            "latitude": r.get("latitude"),
            "longitude": r.get("longitude"),
            "heading": r.get("heading"),
            "active_booking_id": r.get("active_booking_id"),
            "updated_at": r.get("updated_at"),
            "stale_seconds": int(age),
            "is_online": age < 120,
        })
    return out


# ============================================================================
# Customer trip rating + Admin driver assignment
# ============================================================================

class CustomerRatingSubmit(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=600)


@api_router.post("/customer/bookings/{booking_id}/rate")
async def customer_rate_trip(booking_id: str, payload: CustomerRatingSubmit, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    b = await db.bookings.find_one({"id": booking_id, "customer_id": cid}, {"_id": 0, "id": 1, "driver_id": 1, "rating": 1})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    if b.get("rating"):
        raise HTTPException(status_code=409, detail="You've already rated this trip.")
    now = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {"rating": payload.rating, "rating_comment": payload.comment or "", "rated_at": now}},
    )
    did = b.get("driver_id")
    if did:
        pipeline = [{"$match": {"driver_id": did, "rating": {"$exists": True}}},
                    {"$group": {"_id": None, "avg": {"$avg": "$rating"}, "count": {"$sum": 1}}}]
        agg = await db.bookings.aggregate(pipeline).to_list(1)
        if agg:
            await db.drivers.update_one(
                {"id": did},
                {"$set": {"avg_rating": round(float(agg[0]["avg"]), 2), "ratings_count": int(agg[0]["count"])}},
            )
    return {"ok": True, "rating": payload.rating}


class AdminAssignDriverRequest(BaseModel):
    booking_id: str
    driver_id: str


@api_router.post("/admin/bookings/assign-driver")
async def admin_assign_driver(payload: AdminAssignDriverRequest, claims: dict = Depends(require_admin)):
    d = await db.drivers.find_one({"id": payload.driver_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    b = await db.bookings.find_one({"id": payload.booking_id}, {"_id": 0, "id": 1})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    await db.bookings.update_one(
        {"id": payload.booking_id},
        {"$set": {
            "driver_id": d["id"],
            "driver_name": d.get("name"),
            "driver_phone": d.get("phone"),
            "driver_plate": d.get("plate"),
            "driver_vehicle": d.get("vehicle"),
            "trip_status": "assigned",
            "assigned_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"ok": True}


# ---------- Account deletion request (Google Play / GDPR compliance) ----------
class AccountDeletionRequest(BaseModel):
    email: EmailStr
    reason: Optional[str] = ""


@api_router.post("/account/deletion-request")
async def request_account_deletion(payload: AccountDeletionRequest):
    """Public endpoint. Anyone can request deletion of their own account.
    We record the request and email support; deletion is processed manually
    within 30 days to allow ID verification (prevents malicious deletion of
    someone else's account by an attacker who knows their email).
    """
    req_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc).isoformat()
    rec = {
        "id": req_id,
        "email": payload.email.lower().strip(),
        "reason": (payload.reason or "")[:1000],
        "requested_at": now,
        "status": "pending",
    }
    try:
        await db.account_deletion_requests.insert_one(rec)
    except Exception as e:
        logger.error(f"Failed to record deletion request: {e}")
    # Notify support so a human can verify and process
    try:
        from email_service import SUPPORT_EMAIL
        subject = f"Account deletion request — {payload.email}"
        html = (
            f"<p>A new account deletion request was submitted.</p>"
            f"<p><strong>Email:</strong> {payload.email}<br/>"
            f"<strong>Reason:</strong> {payload.reason or '(none)'}<br/>"
            f"<strong>Request ID:</strong> {req_id}<br/>"
            f"<strong>Submitted at:</strong> {now}</p>"
            f"<p>Please verify identity within 30 days and process via admin panel.</p>"
        )
        await send_email(to=SUPPORT_EMAIL, subject=subject, html=html)
    except Exception as e:
        logger.warning(f"Could not email support about deletion request {req_id}: {e}")
    return {"ok": True, "request_id": req_id, "message": "Deletion request received. We will process within 30 days."}


# Register router
app.include_router(api_router)

# Affiliate network (out-of-territory partner operators)
from affiliates import router as affiliates_router
api_router_affiliates = APIRouter(prefix="/api")
api_router_affiliates.include_router(affiliates_router)
app.include_router(api_router_affiliates)

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

    # One-time migration: set default service_fee_percent to 3.5% on legacy docs
    # that either don't have the field or have it at 0 (was the prior default).
    # We gate with a flag so admin overrides are never clobbered on restart.
    try:
        await db.settings.update_one(
            {
                "key": "global",
                "service_fee_migrated_v1": {"$ne": True},
                "$or": [
                    {"service_fee_percent": {"$exists": False}},
                    {"service_fee_percent": 0},
                    {"service_fee_percent": 0.0},
                ],
            },
            {"$set": {"service_fee_percent": 3.5, "service_fee_migrated_v1": True}},
        )
    except Exception as e:
        logger.warning(f"service_fee_percent backfill skipped: {e}")

    # One-time migration: set default per_stop_fee to $15 on legacy docs without it.
    try:
        await db.settings.update_one(
            {
                "key": "global",
                "per_stop_fee_migrated_v1": {"$ne": True},
                "per_stop_fee": {"$exists": False},
            },
            {"$set": {"per_stop_fee": 15.0, "per_stop_fee_migrated_v1": True}},
        )
    except Exception as e:
        logger.warning(f"per_stop_fee backfill skipped: {e}")

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

    # Migration: backfill wait_minute_rate for existing pricing rows that pre-date Phase 2.
    try:
        for vt, defaults in DEFAULT_VEHICLE_PRICING.items():
            await db.pricing_config.update_one(
                {"vehicle_type": vt, "wait_minute_rate": {"$exists": False}},
                {"$set": {"wait_minute_rate": defaults.get("wait_minute_rate", 1.0)}},
            )
    except Exception as e:
        logger.warning(f"wait_minute_rate backfill skipped: {e}")

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
        _scheduler.add_job(
            _sweep_abandoned_checkouts,
            "interval",
            minutes=60,
            id="abandoned_checkout_sweep",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=120),
        )
        _scheduler.add_job(
            _send_payment_recovery_emails,
            "interval",
            minutes=5,
            id="payment_recovery_email",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=90),
        )
        _scheduler.start()
        logger.info("Background scheduler started (review requests every 30 min, abandoned-checkout sweep every 60 min, payment-recovery every 5 min).")
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


# ---------- Abandoned-checkout sweep (replaces the inline sweep that used to
# fire on every GET /admin/bookings load — that sweep was killing real customer
# bookings the moment the dashboard was opened post-deploy). New rules:
#   1. Wait 72 hours after creation (was 24h) before cancelling — gives weekend
#      bookers and slow-payers plenty of time to come back.
#   2. At ~23h send the customer ONE polite "your reservation needs payment"
#      email with their manage link, so they're never silently dropped.
#   3. Only cancel if: status=pending + payment_status=pending + no driver
#      assigned + payment_method != "manual" + age > 72h.
# Runs hourly from APScheduler. ----------
_PAYMENT_REMINDER_HOURS = 23
_ABANDONED_CANCEL_HOURS = 72


def _public_origin() -> str:
    """Best-effort frontend origin for emailed links from a background job
    (no Request object). Falls back to the production domain if env not set."""
    return (
        os.environ.get("PUBLIC_FRONTEND_ORIGIN")
        or os.environ.get("FRONTEND_ORIGIN")
        or "https://turanelitelimo.com"
    ).rstrip("/")


def _render_payment_reminder_email(b: dict, manage_url: Optional[str]) -> str:
    name = (b.get("full_name") or "there").split()[0]
    cnum = b.get("confirmation_number") or ""
    pickup_when = f"{b.get('pickup_date','')} at {b.get('pickup_time','')}".strip()
    btn = ""
    if manage_url:
        btn = (
            f'<a href="{manage_url}" style="display:inline-block;background:#D4AF37;'
            f'color:#0A0A0A;text-decoration:none;padding:14px 28px;border-radius:6px;'
            f'font-weight:600;letter-spacing:.05em;margin:18px 0;">FINISH PAYMENT</a>'
        )
    return f"""
    <div style="font-family:Helvetica,Arial,sans-serif;background:#0A0A0A;color:#EDEDED;padding:32px;max-width:560px;margin:auto;">
      <div style="text-align:center;color:#D4AF37;letter-spacing:.3em;font-size:11px;margin-bottom:24px;">TURAN ELITE LIMO</div>
      <h2 style="color:#FFF;font-weight:300;margin:0 0 16px;">Hi {name}, your reservation is still waiting for payment.</h2>
      <p style="color:#BFBFBF;line-height:1.6;">
        We're holding your chauffeur reservation{f' <strong style="color:#D4AF37;">{cnum}</strong>' if cnum else ''}
        for <strong>{pickup_when}</strong>, but we haven't received your payment yet.
      </p>
      <p style="color:#BFBFBF;line-height:1.6;">
        To make sure we don't release the vehicle, please complete checkout in the next 48 hours.
      </p>
      {btn}
      <p style="color:#888;font-size:12px;line-height:1.6;margin-top:24px;">
        If you no longer need the ride, you can cancel from the same link — no charge.
        Reply to this email if you have any trouble paying and we'll help personally.
      </p>
      <div style="border-top:1px solid #1F1F1F;margin-top:28px;padding-top:16px;color:#666;font-size:11px;text-align:center;">
        TuranEliteLimo · Bay Area Chauffeur Service
      </div>
    </div>
    """


async def _sweep_abandoned_checkouts():
    """Background job: send 23h reminder emails and then cancel any pending
    Stripe checkouts that have been abandoned for > 72h. Runs hourly."""
    try:
        now = datetime.now(timezone.utc)
        reminder_cutoff = (now - timedelta(hours=_PAYMENT_REMINDER_HOURS)).isoformat()
        cancel_cutoff = (now - timedelta(hours=_ABANDONED_CANCEL_HOURS)).isoformat()
        base_filter = {
            "status": "pending",
            "payment_status": "pending",
            "$and": [
                {"$or": [{"driver_id": {"$exists": False}}, {"driver_id": None}, {"driver_id": ""}]},
                {"$or": [{"payment_method": {"$exists": False}}, {"payment_method": {"$ne": "manual"}}]},
            ],
        }

        # 1) Send one-time reminder email to bookings >23h old and not yet reminded
        reminder_filter = {
            **base_filter,
            "created_at": {"$lt": reminder_cutoff},
            "payment_reminder_sent_at": {"$exists": False},
        }
        to_remind = await db.bookings.find(reminder_filter, {"_id": 0}).to_list(50)
        origin = _public_origin()
        for b in to_remind:
            try:
                manage_url = (
                    f"{origin}/manage/{b.get('manage_token')}" if b.get("manage_token") else None
                )
                html = _render_payment_reminder_email(b, manage_url)
                cnum = b.get("confirmation_number") or ""
                subject = (
                    f"Reminder: your reservation needs payment{' — ' + cnum if cnum else ''}"
                )
                sent_id = await send_email(to=b["email"], subject=subject, html=html)
                if sent_id is not None:
                    await db.bookings.update_one(
                        {"id": b["id"]},
                        {"$set": {"payment_reminder_sent_at": now.isoformat()}},
                    )
                    logger.info(f"Payment reminder sent for booking {b.get('id')}")
            except Exception as e:
                logger.warning(f"Payment reminder failed for {b.get('id')}: {e}")

        # 2) Auto-cancel anything >72h old (still pending). Quiet on the customer
        # side by design — they already got the 23h reminder and didn't act.
        cancel_filter = {**base_filter, "created_at": {"$lt": cancel_cutoff}}
        will_cancel = await db.bookings.find(
            cancel_filter,
            {"_id": 0, "id": 1, "confirmation_number": 1, "full_name": 1},
        ).to_list(50)
        if will_cancel:
            await db.bookings.update_many(
                cancel_filter,
                {"$set": {
                    "status": "cancelled",
                    "cancellation_reason": f"Checkout abandoned (auto-cleaned after {_ABANDONED_CANCEL_HOURS}h)",
                    "cancellation_source": "auto_abandoned",
                    "cancelled_at": now.isoformat(),
                    "auto_cancelled_at": now.isoformat(),
                }},
            )
            admin_to = sms_service.admin_phone()
            if admin_to:
                preview = ", ".join(
                    (b.get("confirmation_number") or b["id"][:8]) + f" ({b.get('full_name') or '?'})"
                    for b in will_cancel[:5]
                )
                extra = f" +{len(will_cancel) - 5} more" if len(will_cancel) > 5 else ""
                try:
                    await sms_service.send_sms(
                        admin_to,
                        f"TuranEliteLimo auto-cleanup: {len(will_cancel)} abandoned booking(s) cancelled (>72h unpaid). {preview}{extra}.",
                    )
                except Exception as e:
                    logger.warning(f"Admin auto-cleanup SMS failed: {e}")
            logger.info(f"Auto-cancelled {len(will_cancel)} abandoned bookings (>72h).")
    except Exception as e:
        logger.warning(f"_sweep_abandoned_checkouts failed: {e}")


# ---------- 15-minute payment-recovery email + admin SMS ----------
# When a customer creates a booking, the system creates a Stripe Checkout
# session and redirects them. If the redirect silently fails (iOS Safari ITP,
# network blip, popup blocker, JS error mid-redirect) they end up with
# payment_status="pending" but never see the Stripe page. Krista's story.
# This job catches that within 15 minutes:
#   1. Emails the customer a one-click "Finish payment" link (their manage URL)
#   2. Texts the admin so they can phone the customer immediately

def _render_payment_recovery_email(b: dict, manage_url: Optional[str]) -> str:
    name = (b.get("full_name") or "there").split()[0]
    cnum = b.get("confirmation_number") or ""
    pickup_when = f"{b.get('pickup_date','')} at {b.get('pickup_time','')}".strip()
    btn = ""
    if manage_url:
        btn = (
            f'<a href="{manage_url}" style="display:inline-block;background:#D4AF37;'
            f'color:#0A0A0A;text-decoration:none;padding:14px 28px;border-radius:6px;'
            f'font-weight:600;letter-spacing:.05em;margin:18px 0;">FINISH PAYMENT</a>'
        )
    return f"""
    <div style="font-family:Helvetica,Arial,sans-serif;background:#0A0A0A;color:#EDEDED;padding:32px;max-width:560px;margin:auto;">
      <div style="text-align:center;color:#D4AF37;letter-spacing:.3em;font-size:11px;margin-bottom:24px;">TURAN ELITE LIMO</div>
      <h2 style="color:#FFF;font-weight:300;margin:0 0 16px;">Hi {name}, looks like your checkout got interrupted.</h2>
      <p style="color:#BFBFBF;line-height:1.6;">
        We received your reservation request{f' <strong style="color:#D4AF37;">{cnum}</strong>' if cnum else ''}
        for <strong>{pickup_when}</strong>, but we never received the payment confirmation —
        looks like the secure-checkout page didn't open for you.
      </p>
      <p style="color:#BFBFBF;line-height:1.6;">
        Tap the button below to finish booking. It only takes a moment.
      </p>
      {btn}
      <p style="color:#888;font-size:12px;line-height:1.6;margin-top:24px;">
        Trouble with the page? Just reply to this email and we'll send you a direct payment link, or
        call us and we can take payment over the phone.
      </p>
      <div style="border-top:1px solid #1F1F1F;margin-top:28px;padding-top:16px;color:#666;font-size:11px;text-align:center;">
        TuranEliteLimo · Bay Area Chauffeur Service
      </div>
    </div>
    """


async def _send_payment_recovery_emails():
    """Background job: catch customers stuck on 'payment_status: pending' for
    more than 15 minutes and never paid. One-shot recovery (per booking)."""
    try:
        now = datetime.now(timezone.utc)
        cutoff = (now - timedelta(minutes=15)).isoformat()
        cursor = db.bookings.find(
            {
                "status": "pending",
                "payment_status": "pending",
                "created_at": {"$lt": cutoff},
                "payment_recovery_sent_at": {"$exists": False},
                "cancellation_requested": {"$ne": True},
                "$and": [
                    {"$or": [{"driver_id": {"$exists": False}}, {"driver_id": None}, {"driver_id": ""}]},
                    {"$or": [{"payment_method": {"$exists": False}}, {"payment_method": {"$ne": "manual"}}]},
                ],
            },
            {"_id": 0},
        ).limit(50)
        stuck = await cursor.to_list(50)
        if not stuck:
            return
        origin = _public_origin()
        for b in stuck:
            manage_url = (
                f"{origin}/manage/{b.get('manage_token')}" if b.get("manage_token") else None
            )
            cnum = b.get("confirmation_number") or ""
            # 1) Recovery email to the customer
            try:
                html = _render_payment_recovery_email(b, manage_url)
                subject = (
                    f"Quick fix: finish booking your ride{(' #' + cnum) if cnum else ''}"
                )
                sent_id = await send_email(to=b["email"], subject=subject, html=html)
                if sent_id is not None:
                    logger.info(f"Payment-recovery email sent for booking {b.get('id')}")
            except Exception as e:
                logger.warning(f"Payment-recovery email failed for {b.get('id')}: {e}")
            # 2) Admin SMS so they can call the customer NOW
            try:
                admin_to = sms_service.admin_phone()
                if admin_to:
                    name = b.get("full_name") or "Customer"
                    phone = b.get("phone") or ""
                    err = (b.get("last_checkout_error") or "")[:40]
                    err_str = f"\nLast error: {err}" if err else ""
                    await sms_service.send_sms(
                        admin_to,
                        f"TuranEliteLimo · 🔔 STUCK CHECKOUT · #{cnum or b.get('id','')[:8]}\n"
                        f"{name} · {phone}\n"
                        f"Booked 15+ min ago, never paid.{err_str}\n"
                        f"Call them — recovery email already sent.",
                    )
            except Exception as e:
                logger.warning(f"Admin stuck-checkout SMS failed: {e}")
            # 3) Stamp the booking so we don't email them twice
            await db.bookings.update_one(
                {"id": b["id"]},
                {"$set": {"payment_recovery_sent_at": now.isoformat()}},
            )
    except Exception as e:
        logger.warning(f"_send_payment_recovery_emails failed: {e}")


# ---------- Client-side telemetry: did the Stripe redirect actually fire? ----------
# Frontend pings this if the user is STILL on the booking page 3 seconds after
# we issued window.location.href = stripeUrl. That means the redirect was blocked
# (iOS ITP, popup blocker, browser policy). We log it so we can act on patterns.
# (Endpoint is registered earlier in the file before app.include_router.)


_scheduler = None


@app.on_event("shutdown")
async def shutdown_db_client():
    try:
        if _scheduler is not None:
            _scheduler.shutdown(wait=False)
    except Exception:
        pass
    client.close()
