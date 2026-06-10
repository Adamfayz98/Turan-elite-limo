from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import asyncio
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
import referral
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
    marketing_opt_in: bool = False  # CAN-SPAM/TCPA: explicit consent to receive
                                    # promotional emails. Stored on customer +
                                    # booking for audit trail.


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
    marketing_opt_in: bool = False
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
# [moved] POST /admin/bookings/{booking_id}/mark-read -> routes/admin.py




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

    # Persist marketing opt-in on a per-customer record so we have a single
    # source of truth for "may we email this person promotions?". The booking
    # itself also keeps the snapshot for audit (proves consent at time of
    # signup — important for CAN-SPAM/state privacy law compliance).
    try:
        if payload.marketing_opt_in:
            await db.email_opt_ins.update_one(
                {"email": payload.email.lower()},
                {
                    "$set": {
                        "email": payload.email.lower(),
                        "opted_in": True,
                        "opted_in_at": datetime.now(timezone.utc).isoformat(),
                        "source": "booking_form",
                        "ip": (request.client.host if request.client else None),
                    }
                },
                upsert=True,
            )
    except Exception as e:
        logger.warning(f"marketing opt-in upsert failed: {e}")

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
    # Promo display fields — set when an admin-flagged "auto_apply" promo
    # qualifies for this vehicle. Frontend uses these to render an Uber-style
    # strike-through original_price + bold price + "Save $X with CODE" badge.
    original_price: Optional[float] = None
    discount_amount: Optional[float] = None
    applied_promo: Optional[dict] = None  # {code, description, discount_type, value}


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


async def _apply_auto_promo_to_quote_response(qr: "QuoteResponse") -> "QuoteResponse":
    """If an admin-flagged auto-apply promo is active, decorate every priced
    vehicle quote with an `original_price`, `price` (post-discount),
    `discount_amount`, and `applied_promo` so the frontend can render an
    Uber-style strike-through.

    Rules:
      - Only one auto-apply promo wins (highest absolute discount on the
        cheapest qualifying quote — i.e. the customer's best deal is shown).
      - `allowed_vehicle_types` is respected per-vehicle.
      - `min_ride_amount` is respected per-vehicle.
      - Expired/inactive promos skipped.
      - No-op when nothing qualifies (response returned unchanged).
    """
    try:
        now_iso = datetime.now(timezone.utc).isoformat()
        candidates = []
        async for r in db.promos.find({"active": True, "auto_apply": True}, {"_id": 0}):
            exp = r.get("expires_at")
            if exp and exp < now_iso:
                continue
            try:
                p = Promo(**r)
            except Exception:
                continue
            candidates.append(p)
        if not candidates:
            return qr

        # Pick the most generous promo for the customer (deepest absolute $
        # off on the lowest-priced qualifying vehicle). Tie-break by largest
        # `value`.
        def _calc_off(promo: Promo, price: float) -> float:
            if promo.discount_type == "percent":
                return round(price * (promo.value / 100.0), 2)
            return round(min(price, promo.value), 2)

        best = None  # (promo, sample_off)
        for promo in candidates:
            allowed = promo.allowed_vehicle_types or []
            best_savings_for_promo = 0.0
            for q in qr.quotes:
                if q.price is None or q.price <= 0:
                    continue
                if allowed and q.vehicle_type not in allowed:
                    continue
                if promo.min_ride_amount and q.price < promo.min_ride_amount:
                    continue
                off = _calc_off(promo, q.price)
                if off > best_savings_for_promo:
                    best_savings_for_promo = off
            if best_savings_for_promo > 0 and (best is None or best_savings_for_promo > best[1] or (best_savings_for_promo == best[1] and promo.value > best[0].value)):
                best = (promo, best_savings_for_promo)

        if not best:
            return qr

        promo = best[0]
        allowed = promo.allowed_vehicle_types or []
        applied_promo_dict = {
            "code": promo.code,
            "description": promo.description or "",
            "discount_type": promo.discount_type,
            "value": promo.value,
        }
        for q in qr.quotes:
            if q.price is None or q.price <= 0:
                continue
            if allowed and q.vehicle_type not in allowed:
                continue
            if promo.min_ride_amount and q.price < promo.min_ride_amount:
                continue
            original = q.price
            off = _calc_off(promo, original)
            if off <= 0:
                continue
            new_price = round(max(0.0, original - off), 2)
            q.original_price = original
            q.discount_amount = off
            q.applied_promo = applied_promo_dict
            q.price = new_price
            q.formatted_price = f"${new_price:.2f}"
        return qr
    except Exception as e:
        logger.warning(f"_apply_auto_promo_to_quote_response failed: {e}")
        return qr


def _apply_post_pricing_layers(qr: "QuoteResponse", fee_percent: float):
    """Centralized post-processing: service fee FIRST (so the fee is included
    in the original sticker price), then auto-promo discount.
    Returns the same QuoteResponse, mutated in place."""
    _apply_service_fee_to_quote_response(qr, fee_percent)
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

    # Manual admin surge (e.g., admin flips it on when phones are ringing) —
    # multiplies on top of any event surge. Falls through silently if disabled.
    if settings.manual_surge_enabled and settings.manual_surge_multiplier and settings.manual_surge_multiplier > 1.0:
        surge_mult = (surge_mult or 1.0) * float(settings.manual_surge_multiplier)
        # If no event surge was active, expose the manual one in surge_info so
        # the website / admin tools display "High demand period · +25%" to users.
        if surge_info is None:
            surge_info = SurgeInfo(
                event_name=settings.manual_surge_label or "High demand period",
                pricing_type="multiplier",
                multiplier=float(settings.manual_surge_multiplier),
                flat_surcharge=None,
                reason="Manual surge enabled by operator",
                start_date="",
                end_date="",
            )

    # Hourly mode: ignore distance, use hourly_rate × hours (minimum 2 hours)
    if payload.service_type == "Hourly Chauffeur":
        if not payload.hours or payload.hours < 2:
            # Don't return distance-based prices — explicitly tell the customer.
            return await _apply_auto_promo_to_quote_response(_apply_service_fee_to_quote_response(QuoteResponse(
                quotes=[
                    VehicleQuote(vehicle_type=vt, message="Minimum 2 hours required")
                    for vt in VEHICLE_TYPES
                ],
                pricing_mode="hourly",
                hours=payload.hours,
                included_miles=None,
                fallback=True,
            ), settings.service_fee_percent))
        return await _apply_auto_promo_to_quote_response(_apply_service_fee_to_quote_response(QuoteResponse(
            quotes=_build_hourly_quotes(payload.hours, pricing_map, surge_mult=surge_mult, surge_flat=surge_flat),
            pricing_mode="hourly",
            hours=payload.hours,
            included_miles=payload.hours * HOURLY_MILES_INCLUDED_PER_HOUR,
            surge_applied=surge_info,
            per_stop_fee=per_stop_fee if per_stop_fee > 0 else None,
            additional_stops_count=stops_count or None,
        ), settings.service_fee_percent))

    pickup = await _geocode(payload.pickup_location)
    dropoff = await _geocode(payload.dropoff_location)
    if not pickup or not dropoff:
        return await _apply_auto_promo_to_quote_response(_apply_service_fee_to_quote_response(QuoteResponse(
            quotes=_build_quotes(None, pricing_map, addon_flat=addon_flat_total, addon_tags=addon_tags),
            fallback=True,
            meet_and_greet_fee=mg_fee if mg_fee > 0 else None,
            per_stop_fee=per_stop_fee if per_stop_fee > 0 else None,
            stop_fee_total=stop_fee_total if stop_fee_total > 0 else None,
            additional_stops_count=stops_count or None,
        ), settings.service_fee_percent))

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

    return await _apply_auto_promo_to_quote_response(_apply_service_fee_to_quote_response(QuoteResponse(
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
    ), settings.service_fee_percent))


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


# [moved] POST /admin/bookings/{booking_id}/assign-driver -> routes/admin.py


# [moved] DELETE /admin/bookings/{booking_id}/driver -> routes/admin.py


# [moved] GET /driver/{driver_token} -> routes/driver.py


# [moved] POST /driver/{driver_token}/status -> routes/driver.py


# ---------- Driver: flight landed + wait-time charge (Phase 2b) ----------
class FlightLandedPayload(BaseModel):
    landed_at: Optional[str] = None  # ISO timestamp; if omitted server uses "now"


# [moved] POST /driver/{driver_token}/flight-landed -> routes/driver.py


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


# [moved] POST /driver/{driver_token}/record-wait-time -> routes/driver.py


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


# [moved] POST /driver/{driver_token}/record-mid-trip-stop -> routes/driver.py


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


# [moved] POST /admin/bookings/{booking_id}/mark-wait-time-external -> routes/admin.py


# [moved] POST /admin/bookings/{booking_id}/mark-mid-trip-stop-external -> routes/admin.py


# [moved] POST /admin/bookings/{booking_id}/mark-damage-external -> routes/admin.py


# [moved] POST /admin/bookings/{booking_id}/charge-mid-trip-stop -> routes/payments.py


# [moved] POST /driver/{driver_token}/no-show -> routes/driver.py


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
    auto_apply: bool = False  # silently apply to every quote — strike-through pricing
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
    auto_apply: Optional[bool] = None
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


# [moved] GET /admin/announcements -> routes/admin.py


# [moved] POST /admin/announcements -> routes/admin.py


# [moved] PATCH /admin/announcements/{aid} -> routes/admin.py


# [moved] DELETE /admin/announcements/{aid} -> routes/admin.py


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


# [moved] GET /admin/drivers -> routes/admin.py


# [moved] POST /admin/drivers -> routes/admin.py


# [moved] PATCH /admin/drivers/{driver_id} -> routes/admin.py


# [moved] DELETE /admin/drivers/{driver_id} -> routes/admin.py


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


# [moved] GET /admin/quote-requests -> routes/admin.py



# ---------- Marketing email opt-in ----------
# [moved] GET /admin/email-list -> routes/admin.py


@api_router.post("/email/unsubscribe")
async def email_unsubscribe(payload: dict):
    """
    Public, no-auth unsubscribe endpoint. Linked from every promotional email
    footer (CAN-SPAM requirement). We honor the request immediately.
    """
    email = (payload.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(status_code=400, detail="Valid email required")
    await db.email_opt_ins.update_one(
        {"email": email},
        {
            "$set": {
                "email": email,
                "opted_in": False,
                "unsubscribed_at": datetime.now(timezone.utc).isoformat(),
                "source": payload.get("source") or "unsubscribe_link",
            }
        },
        upsert=True,
    )
    return {"ok": True}



# ----- Admin broadcast (Compose Promo) -- forward-references helpers defined
# later. They're resolved at request time, not at definition time, so this is
# safe even though the helpers come below.

class _BroadcastBody(BaseModel):
    subject: str = Field(..., min_length=4, max_length=120)
    kicker: str = Field("Special offer", min_length=2, max_length=40)
    headline: str = Field(..., min_length=4, max_length=120)
    body_html: str = Field(..., min_length=10, max_length=20000)
    cta_url: Optional[str] = Field(None, max_length=500)
    cta_label: Optional[str] = Field(None, max_length=40)
    test_only: bool = False
    test_email: Optional[str] = None


# [moved] POST /admin/broadcast/preview -> routes/admin.py


# [moved] POST /admin/broadcast/send -> routes/admin.py


# [moved] GET /admin/broadcast/history -> routes/admin.py


# ===== Refer-a-Friend =====================================================

def _frontend_origin_from_env() -> str:
    return (os.environ.get("PUBLIC_SITE_URL") or "https://turanelitelimo.com").rstrip("/")


@api_router.get("/referral/check/{code}")
async def referral_check(code: str):
    """Public lookup: does this referral code belong to a real customer?"""
    referrer_id = await referral.resolve_referrer(db, code)
    if not referrer_id:
        return {"valid": False}
    referrer = await db.customers.find_one({"id": referrer_id}, {"_id": 0, "name": 1})
    first_name = ((referrer or {}).get("name") or "").split(" ")[0] or None
    return {"valid": True, "referrer_name": first_name}


# [moved] GET /customer/referrals -> routes/customer.py


async def _send_referral_reward_email_safe(payout: dict) -> None:
    """Email the referrer that they've earned a $25-off promo. Non-blocking."""
    try:
        email = payout.get("referrer_email")
        if not email:
            return
        first = ((payout.get("referrer_name") or "").split(" ") or ["there"])[0] or "there"
        friend_first = ((payout.get("friend_name") or "your friend").split(" ") or ["your friend"])[0]
        promo = payout.get("promo_code") or "THANKS"
        amount = payout.get("amount") or 25
        html = f"""
        <div style="font-family:Inter,Helvetica,Arial,sans-serif;background:#0a0a0a;color:#fff;padding:40px 24px;">
          <div style="max-width:520px;margin:0 auto;background:#111;border:1px solid #222;border-radius:18px;overflow:hidden;">
            <div style="background:linear-gradient(135deg,#1a1305,#000);padding:32px;text-align:center;">
              <p style="color:#D4AF37;font-size:11px;letter-spacing:.3em;text-transform:uppercase;margin:0 0 8px;">Refer & earn</p>
              <h1 style="color:#fff;font-weight:300;font-size:28px;margin:0;">You earned <span style="color:#D4AF37;font-style:italic;">${amount} off</span></h1>
            </div>
            <div style="padding:28px 32px;">
              <p style="color:#cbd5e1;font-size:15px;line-height:1.6;margin:0 0 16px;">Hi {first},</p>
              <p style="color:#cbd5e1;font-size:15px;line-height:1.6;margin:0 0 16px;">{friend_first} just completed their first ride with TuranEliteLimo — thanks to you. Your reward is ready:</p>
              <div style="background:#0a0a0a;border:1px dashed #D4AF37;border-radius:12px;padding:18px;text-align:center;margin:18px 0;">
                <p style="color:#9ca3af;font-size:11px;letter-spacing:.25em;text-transform:uppercase;margin:0 0 6px;">Your promo code</p>
                <p style="color:#D4AF37;font-family:'JetBrains Mono',monospace;font-size:22px;letter-spacing:.1em;margin:0;">{promo}</p>
              </div>
              <p style="color:#cbd5e1;font-size:14px;line-height:1.6;margin:0 0 20px;">Apply this at checkout next time you book — it knocks ${amount} off any ride. Single-use, never expires.</p>
              <div style="text-align:center;margin-top:24px;">
                <a href="{_frontend_origin_from_env()}/#booking" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:14px 28px;border-radius:999px;font-weight:600;">Book Your Next Ride →</a>
              </div>
            </div>
          </div>
        </div>
        """
        await send_email(to=email, subject=f"You earned ${amount} off your next TuranEliteLimo ride", html=html)
    except Exception as e:
        logger.warning(f"_send_referral_reward_email_safe failed: {e}")


# ===== Push broadcast (admin) =============================================

class _PushBroadcastBody(BaseModel):
    title: str = Field(..., min_length=2, max_length=60)
    body: str = Field(..., min_length=4, max_length=200)
    deep_link: Optional[str] = Field(None, max_length=500)
    test_only: bool = False


# [moved] GET /admin/push/eligible-count -> routes/admin.py


# [moved] POST /admin/push/broadcast -> routes/admin.py


# [moved] GET /admin/push/history -> routes/admin.py





# [moved] PATCH /admin/quote-requests/{rid} -> routes/admin.py


# [moved] DELETE /admin/quote-requests/{rid} -> routes/admin.py


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


# [moved] GET /admin/promos -> routes/admin.py


# [moved] POST /admin/promos -> routes/admin.py


# [moved] PATCH /admin/promos/{promo_id} -> routes/admin.py


# [moved] DELETE /admin/promos/{promo_id} -> routes/admin.py


# [moved] POST /admin/login -> routes/admin.py


# [moved] POST /admin/verify-2fa -> routes/admin.py


# [moved] GET /admin/me -> routes/admin.py


# [moved] GET /admin/account -> routes/admin.py


# [moved] PATCH /admin/account -> routes/admin.py


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

    # Manual surge toggle — admin can flip ON when phones are ringing off the
    # hook (high-demand window) without waiting on an automated trigger.
    # Stacks on top of event-based surge (e.g., World Cup) AND last-minute
    # lead-time multiplier (Quick Quote tool only). Defaults OFF.
    manual_surge_enabled: bool = False
    manual_surge_multiplier: float = Field(1.25, ge=1.0, le=3.0)
    manual_surge_label: str = "High demand period"

    # Quick-Quote last-minute lead-time multipliers (Quick Quote tab only)
    # Tiers below are applied based on hours-until-pickup; admin can tune.
    lead_time_under_1h: float = Field(1.75, ge=1.0, le=4.0)
    lead_time_1_to_2h: float = Field(1.50, ge=1.0, le=4.0)
    lead_time_2_to_6h: float = Field(1.30, ge=1.0, le=4.0)
    lead_time_6_to_24h: float = Field(1.15, ge=1.0, le=4.0)
    lead_time_24_to_48h: float = Field(1.05, ge=1.0, le=4.0)


async def _load_settings() -> Settings:
    doc = await db.settings.find_one({"key": "global"}, {"_id": 0})
    if not doc:
        return Settings()
    return Settings(**doc)


# [moved] GET /admin/settings -> routes/admin.py


@api_router.get("/settings/public")
async def get_public_settings():
    """Public read of safe settings for the booking form (service fee, currency)."""
    s = await _load_settings()
    return {
        "service_fee_percent": s.service_fee_percent,
        "per_stop_fee": s.per_stop_fee,
        "cancellation_tiers": s.cancellation_tiers,
        "currency": s.currency,
        "manual_surge_enabled": s.manual_surge_enabled,
        "manual_surge_multiplier": s.manual_surge_multiplier,
        "manual_surge_label": s.manual_surge_label,
    }


class SettingsUpdate(BaseModel):
    deposit_percent: Optional[int] = Field(None, ge=0, le=100)
    currency: Optional[str] = None
    meet_greet_fee: Optional[float] = Field(None, ge=0)
    service_fee_percent: Optional[float] = Field(None, ge=0, le=20)
    per_stop_fee: Optional[float] = Field(None, ge=0)
    cancellation_tiers: Optional[List[dict]] = None
    manual_surge_enabled: Optional[bool] = None
    manual_surge_multiplier: Optional[float] = Field(None, ge=1.0, le=3.0)
    manual_surge_label: Optional[str] = Field(None, max_length=80)
    lead_time_under_1h: Optional[float] = Field(None, ge=1.0, le=4.0)
    lead_time_1_to_2h: Optional[float] = Field(None, ge=1.0, le=4.0)
    lead_time_2_to_6h: Optional[float] = Field(None, ge=1.0, le=4.0)
    lead_time_6_to_24h: Optional[float] = Field(None, ge=1.0, le=4.0)
    lead_time_24_to_48h: Optional[float] = Field(None, ge=1.0, le=4.0)


# [moved] PATCH /admin/settings -> routes/admin.py


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


# [moved] POST /payments/checkout -> routes/payments.py


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


# [moved] POST /payments/checkout-telemetry -> routes/payments.py




# [moved] GET /payments/status/{session_id} -> routes/payments.py


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


# [moved] POST /admin/bookings/{booking_id}/backfill-saved-card -> routes/payments.py


# [moved] POST /admin/payments/backfill-saved-cards -> routes/payments.py


# [moved] POST /webhook/stripe -> routes/payments.py


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


# [moved] GET /admin/bookings/{booking_id}/refund-preview -> routes/payments.py


class RefundRequest(BaseModel):
    amount: Optional[float] = Field(None, ge=0)  # if None → full refund
    reason: Optional[str] = Field(None, max_length=80)  # e.g. "admin_cancel", "tier", "custom", "goodwill"
    note: Optional[str] = Field(None, max_length=300)


# [moved] POST /admin/payments/{booking_id}/refund -> routes/payments.py


# ---------- Admin: charge wait time (uses driver-recorded minutes) ----------
class AdminWaitTimeChargeRequest(BaseModel):
    minutes_waited: Optional[int] = Field(None, ge=1, le=240)  # optional override; falls back to driver-recorded


# [moved] POST /admin/bookings/{booking_id}/charge-wait-time -> routes/payments.py


# ---------- Admin: charge damages (separate from wait time) ----------
class AdminDamageChargeRequest(BaseModel):
    amount: float = Field(..., gt=0, le=10000)
    reason: str = Field(..., min_length=4, max_length=500)


# [moved] POST /admin/bookings/{booking_id}/charge-damages -> routes/payments.py


# [moved] POST /admin/bookings/{booking_id}/force-sync-payment -> routes/payments.py


# ---------- Admin protected: bookings ----------
# [moved] GET /admin/bookings -> routes/admin.py


# [moved] PATCH /admin/bookings/{booking_id} -> routes/admin.py


# [moved] DELETE /admin/bookings/{booking_id} -> routes/admin.py


# ============================================================================

# ============================================================================
# Quick Quote (admin) — for on-demand phone callers
# ----------------------------------------------------------------------------
# Operator pattern: customer calls in asking for a ride RIGHT NOW. Admin
# enters pickup/dropoff/datetime, we run the same pricing engine the website
# uses, then auto-apply a last-minute surcharge based on how soon the
# pickup is. Output is a suggested per-vehicle price that the admin can pass
# straight into the Custom Invoice tool to generate a Stripe link.
# ============================================================================

class QuickQuoteRequest(BaseModel):
    pickup_location: str = Field(..., min_length=2, max_length=300)
    dropoff_location: str = Field(..., min_length=2, max_length=300)
    pickup_datetime: str  # ISO 8601, e.g. "2026-06-07T19:00:00-07:00" — used
                           # for both surge-event matching AND last-minute lead-time
    service_type: Optional[str] = "A to B Transfer"
    passengers: Optional[int] = Field(1, ge=1, le=60)
    hours: Optional[int] = Field(None, ge=1, le=24)


async def _last_minute_multiplier(pickup_iso: str) -> tuple[float, str]:
    """
    Computes a last-minute lead-time surcharge based on hours-until-pickup.
    Returns (multiplier, human_label). Tier thresholds are admin-configurable
    via Settings (lead_time_*). Defaults match industry standard for luxury
    chauffeur: 1.0× to 1.75×.
    """
    try:
        dt = datetime.fromisoformat(pickup_iso.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
    except Exception:
        return (1.0, "Unknown lead time")
    delta = (dt - datetime.now(timezone.utc)).total_seconds() / 3600.0  # hours
    s = await _load_settings()
    if delta < 1:
        return (float(s.lead_time_under_1h), f"Right-now premium (<1 hr) · +{int(round((s.lead_time_under_1h - 1) * 100))}%")
    if delta < 2:
        return (float(s.lead_time_1_to_2h), f"Last-minute premium (1-2 hr) · +{int(round((s.lead_time_1_to_2h - 1) * 100))}%")
    if delta < 6:
        return (float(s.lead_time_2_to_6h), f"Same-day premium (2-6 hr) · +{int(round((s.lead_time_2_to_6h - 1) * 100))}%")
    if delta < 24:
        return (float(s.lead_time_6_to_24h), f"Next-day premium (6-24 hr) · +{int(round((s.lead_time_6_to_24h - 1) * 100))}%")
    if delta < 48:
        return (float(s.lead_time_24_to_48h), f"Tight lead time (24-48 hr) · +{int(round((s.lead_time_24_to_48h - 1) * 100))}%")
    return (1.0, "Standard lead time (>48 hr)")


class QuickQuoteVehicle(BaseModel):
    vehicle_type: str
    base_price: Optional[float] = None
    suggested_price: Optional[float] = None  # base × lead-time multiplier × surge event
    formatted_suggested: Optional[str] = None
    message: Optional[str] = None


class QuickQuoteResponse(BaseModel):
    lead_time_multiplier: float
    lead_time_label: str
    surge_info: Optional[SurgeInfo] = None
    quotes: List[QuickQuoteVehicle]


# [moved] POST /admin/quick-quote -> routes/admin.py



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


# [moved] POST /admin/invoices -> routes/admin.py


# [moved] GET /admin/invoices -> routes/admin.py


# [moved] GET /admin/invoices/{invoice_id} -> routes/admin.py


# [moved] POST /admin/invoices/{invoice_id}/cancel -> routes/admin.py


# [moved] POST /admin/invoices/{invoice_id}/resend -> routes/admin.py


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


# [moved] POST /admin/bookings/backfill-cancellation-source -> routes/admin.py



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


# [moved] GET /admin/pricing -> routes/admin.py


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


# [moved] PATCH /admin/pricing/{vehicle_type} -> routes/admin.py


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


# [moved] GET /admin/zones -> routes/admin.py


# [moved] POST /admin/zones -> routes/admin.py


# [moved] PATCH /admin/zones/{zone_id} -> routes/admin.py


# [moved] DELETE /admin/zones/{zone_id} -> routes/admin.py


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


# [moved] GET /admin/surge-events -> routes/admin.py


# [moved] POST /admin/surge-events -> routes/admin.py


# [moved] PATCH /admin/surge-events/{event_id} -> routes/admin.py


# [moved] DELETE /admin/surge-events/{event_id} -> routes/admin.py


# ---------- Admin protected: contact inquiries ----------
# [moved] GET /admin/contacts -> routes/admin.py


# [moved] PATCH /admin/contacts/{contact_id} -> routes/admin.py


# [moved] DELETE /admin/contacts/{contact_id} -> routes/admin.py


# [moved] GET /admin/stats -> routes/admin.py


# ============================================================================
# Customer auth (used by the mobile app — separate from admin auth)
# ============================================================================

class CustomerSignupRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    phone: Optional[str] = Field(None, max_length=30)
    password: str = Field(..., min_length=8, max_length=128)
    referred_by_code: Optional[str] = Field(None, max_length=40)


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


# [moved] POST /customer/signup -> routes/customer.py


# [moved] POST /customer/login -> routes/customer.py


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

    # 1. Existing OAuth identity → reuse linked customer (unless deleted)
    identity = await db.oauth_identities.find_one(
        {"provider": provider, "provider_user_id": provider_user_id},
        {"_id": 0},
    )
    if identity:
        customer = await db.customers.find_one({"id": identity["customer_id"]}, {"_id": 0})
        if customer and not customer.get("deleted"):
            await db.oauth_identities.update_one(
                {"provider": provider, "provider_user_id": provider_user_id},
                {"$set": {"last_login_at": datetime.now(timezone.utc).isoformat()}},
            )
            return customer
        # Customer was deleted (or missing). Drop the stale identity so we
        # create a fresh account below.
        await db.oauth_identities.delete_many(
            {"provider": provider, "provider_user_id": provider_user_id}
        )

    # 2. Try to link to existing customer by email (skip for Apple private relay)
    customer = None
    if email and not is_private_email:
        customer = await db.customers.find_one(
            {"email": email.lower(), "deleted": {"$ne": True}},
            {"_id": 0},
        )

    # 3. Otherwise create a brand new customer
    if not customer:
        cid = str(uuid.uuid4())
        # Decide the default display name. If the email is an Apple private relay
        # address (or no email at all), the email prefix is gibberish like
        # "g994cc9rv8" and shouldn't be shown to drivers/dispatchers.
        # Leave the name blank so the customer is prompted to set it.
        is_relay_email = bool(email and email.lower().endswith("@privaterelay.appleid.com"))
        default_name = (name_hint or "").strip()
        if not default_name and email and not is_relay_email:
            default_name = email.split("@")[0]
        customer = {
            "id": cid,
            "name": default_name,  # may be empty — UI will prompt them to set it
            "email": email.lower() if email else f"{provider}-{provider_user_id[:10]}@noemail.invalid",
            "phone": None,
            "password_hash": None,  # social-only account
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auth_provider": provider,
        }
        await db.customers.insert_one(dict(customer))
        # Newly-created social customer → welcome email (only if not relay)
        if email and not is_relay_email:
            asyncio.create_task(_send_welcome_email_safe(customer))

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


# [moved] POST /customer/oauth/apple -> routes/customer.py


# [moved] POST /customer/oauth/google -> routes/customer.py


# ----- Customer forgot password (Resend email + reset token) -----

class CustomerForgotPasswordRequest(BaseModel):
    email: EmailStr


class CustomerResetPasswordRequest(BaseModel):
    token: str = Field(..., min_length=10)
    new_password: str = Field(..., min_length=8, max_length=128)


# [moved] POST /customer/forgot-password -> routes/customer.py


# [moved] POST /customer/reset-password -> routes/customer.py


# [moved] GET /customer/me -> routes/customer.py


# ============================================================================
# Customer self-service endpoints (v1.0 — wires the mobile app's profile menu).
# Each endpoint requires a valid customer JWT (require_customer dependency).
# ============================================================================

class CustomerProfileUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=80)
    phone: Optional[str] = Field(None, max_length=30)


# [moved] PATCH /customer/me -> routes/customer.py


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


# [moved] GET /customer/me/addresses -> routes/customer.py


# [moved] POST /customer/me/addresses -> routes/customer.py


# [moved] DELETE /customer/me/addresses/{address_id} -> routes/customer.py


# ----- Promo history (which promos this customer has actually used) -----
# [moved] GET /customer/me/promos -> routes/customer.py


# ----- Notification preferences -----
class NotificationPrefs(BaseModel):
    ride_updates_push: bool = True
    ride_updates_email: bool = True
    promotions_push: bool = False
    promotions_email: bool = False
    receipts_email: bool = True


# [moved] GET /customer/me/notifications -> routes/customer.py


# [moved] PATCH /customer/me/notifications -> routes/customer.py


# ----- Privacy & Security: change password + delete account -----
class ChangePasswordRequest(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8, max_length=200)


# [moved] POST /customer/me/change-password -> routes/customer.py


# [moved] DELETE /customer/me -> routes/customer.py


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


# [moved] POST /customer/push-token -> routes/customer.py


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


# [moved] POST /customer/me/help -> routes/customer.py


# ============================================================================
# Admin: Riders management (lets admin see all riders + trigger password reset)
# ============================================================================
# [moved] GET /admin/riders -> routes/admin.py


# [moved] POST /admin/riders/{rider_id}/send-password-reset -> routes/admin.py



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


# [moved] POST /customer/book-and-pay -> routes/customer.py


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


# [moved] GET /customer/trips -> routes/customer.py


# [moved] GET /customer/bookings/{booking_id} -> routes/customer.py


# [moved] POST /customer/bookings/{booking_id}/cancel -> routes/customer.py


# [moved] POST /customer/bookings/{booking_id}/modify -> routes/customer.py


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


# [moved] POST /driver-auth/set-password -> routes/driver.py


# [moved] POST /driver-auth/login -> routes/driver.py


# [moved] POST /driver-auth/forgot-password -> routes/driver.py


# [moved] POST /driver-auth/reset-password -> routes/driver.py


# [moved] POST /admin/drivers/{driver_id}/clear-password -> routes/admin.py


# [moved] POST /admin/bookings/sync-completed -> routes/admin.py


# [moved] POST /driver/push-token -> routes/driver.py




# [moved] GET /driver-auth/me -> routes/driver.py


# [moved] GET /driver-auth/trips -> routes/driver.py


# [moved] GET /driver-auth/stats -> routes/driver.py


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


# [moved] POST /driver-auth/bookings/{booking_id}/status -> routes/driver.py


# [moved] POST /driver-auth/bookings/{booking_id}/record-wait-time -> routes/driver.py


# [moved] POST /driver-auth/bookings/{booking_id}/record-mid-trip-stop -> routes/driver.py


# [moved] GET /driver-auth/bookings/{booking_id} -> routes/driver.py


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


# [moved] POST /driver-auth/location -> routes/driver.py


# [moved] GET /customer/bookings/{booking_id}/driver-location -> routes/customer.py


# [moved] GET /admin/drivers/live -> routes/admin.py


# ============================================================================
# Customer trip rating + Admin driver assignment
# ============================================================================

class CustomerRatingSubmit(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = Field(None, max_length=600)


# [moved] POST /customer/bookings/{booking_id}/rate -> routes/customer.py


class AdminAssignDriverRequest(BaseModel):
    booking_id: str
    driver_id: str


# [moved] POST /admin/bookings/assign-driver -> routes/admin.py


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



# Affiliate network (out-of-territory partner operators)
from affiliates import router as affiliates_router
api_router_affiliates = APIRouter(prefix="/api")
api_router_affiliates.include_router(affiliates_router)

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
        # P3 lifecycle: 24-hour pre-trip reminder + win-back email
        _scheduler.add_job(
            _send_pretrip_reminders,
            "interval",
            minutes=15,
            id="pretrip_reminder_email",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(seconds=150),
        )
        _scheduler.add_job(
            _send_winback_emails,
            "interval",
            hours=24,
            id="winback_email",
            replace_existing=True,
            next_run_time=datetime.now(timezone.utc) + timedelta(minutes=10),
        )
        _scheduler.start()
        logger.info("Background scheduler started (review requests, abandoned-checkout sweep, payment-recovery, pretrip reminder, winback).")
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



# ============================================================================
# P3: Lifecycle emails — welcome, 24h reminder, win-back, broadcast (promo)
# ============================================================================
from email_lifecycle import (
    render_welcome_email,
    render_pretrip_reminder_email,
    render_winback_email,
    render_broadcast_email,
)


def _public_site_url() -> str:
    """Customer-facing site URL, used in email CTAs."""
    return os.environ.get("PUBLIC_SITE_URL", "https://turanelitelimo.com")


async def _ensure_promo_code_exists(code: str, percent_off: int, max_uses_per_customer: int = 1) -> None:
    """Idempotently seed a promo code if it doesn't exist. Used by welcome/win-back."""
    existing = await db.promos.find_one({"code": code.upper()}, {"_id": 0, "id": 1})
    if existing:
        return
    try:
        await db.promos.insert_one({
            "id": str(uuid.uuid4()),
            "code": code.upper(),
            "percent_off": percent_off,
            "active": True,
            "max_uses_per_customer": max_uses_per_customer,
            "max_uses_total": None,  # unlimited globally
            "expires_at": None,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "auto_seeded": True,  # marker so admin knows it came from lifecycle
        })
        logger.info(f"Auto-seeded promo code {code}")
    except Exception as e:
        logger.warning(f"Auto-seed promo {code} failed: {e}")


def _unsubscribe_url(email: str) -> str:
    """Generates the public unsubscribe URL — wired to POST /api/email/unsubscribe."""
    return f"{_public_site_url()}/unsubscribe?email={email}"


async def _send_welcome_email_safe(customer: dict) -> None:
    """Fire-and-forget welcome email with $20-off code. Never raises."""
    try:
        email = (customer.get("email") or "").lower()
        if not email or "@" not in email or email.endswith(".invalid"):
            return
        # Ensure the WELCOME20 promo exists (idempotent)
        await _ensure_promo_code_exists("WELCOME20", 20)
        html = render_welcome_email(
            name=customer.get("name") or "",
            promo_code="WELCOME20",
            site_url=_public_site_url(),
        ).replace("{unsubscribe_url}", _unsubscribe_url(email))
        await send_email(
            to=email,
            subject="Welcome to TuranEliteLimo — $20 off your first ride",
            html=html,
        )
    except Exception as e:
        logger.warning(f"Welcome email failed: {e}")


async def _send_pretrip_reminders():
    """
    Scheduled (every 15 min): find bookings whose pickup is 23-25 hours away,
    confirmed and not yet reminded, and send a friendly heads-up.
    """
    try:
        now = datetime.now(timezone.utc)
        # Target window — 23 to 25 hours from now
        lower = (now + timedelta(hours=23)).isoformat()
        upper = (now + timedelta(hours=25)).isoformat()
        # We index by `pickup_iso` if present, otherwise build from pickup_date+time.
        cursor = db.bookings.find(
            {
                "payment_status": "paid",
                "status": {"$in": ["confirmed", "pending"]},
                "pretrip_reminder_sent_at": {"$exists": False},
                "cancellation_requested": {"$ne": True},
            },
            {"_id": 0},
        ).limit(200)
        bookings = await cursor.to_list(200)
        for b in bookings:
            # Build the pickup ISO from date+time if not already stored
            iso = b.get("pickup_iso") or f"{b.get('pickup_date','')}T{b.get('pickup_time','')}:00"
            try:
                # Naive parse — treat as UTC if no offset (rough, fine for ~window matching)
                pickup_dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
                if pickup_dt.tzinfo is None:
                    pickup_dt = pickup_dt.replace(tzinfo=timezone.utc)
            except Exception:
                continue
            if not (lower <= pickup_dt.isoformat() <= upper):
                continue
            # Send it
            try:
                manage_url = f"{_public_site_url()}/manage/{b.get('manage_token', '')}"
                html = render_pretrip_reminder_email(b, manage_url=manage_url).replace(
                    "{unsubscribe_url}", _unsubscribe_url(b.get("email") or ""),
                )
                await send_email(
                    to=b["email"],
                    subject=f"Tomorrow's reservation · {b.get('confirmation_number','')}",
                    html=html,
                )
                await db.bookings.update_one(
                    {"id": b["id"]},
                    {"$set": {"pretrip_reminder_sent_at": now.isoformat()}},
                )
            except Exception as e:
                logger.warning(f"pretrip reminder for {b.get('id')} failed: {e}")
    except Exception as e:
        logger.warning(f"_send_pretrip_reminders failed: {e}")


async def _send_winback_emails():
    """
    Scheduled (daily): find opted-in customers whose last completed ride was
    60-90 days ago and who haven't received a win-back this cycle, send
    $25-off "we miss you" email.
    """
    try:
        now = datetime.now(timezone.utc)
        cutoff_low = (now - timedelta(days=90)).isoformat()
        cutoff_high = (now - timedelta(days=60)).isoformat()
        # Pull all customers opted in for marketing
        opt_ins = await db.email_opt_ins.find(
            {"opted_in": True}, {"_id": 0, "email": 1}
        ).to_list(1000)
        opt_in_emails = {(o.get("email") or "").lower() for o in opt_ins if o.get("email")}
        if not opt_in_emails:
            return
        await _ensure_promo_code_exists("WEMISSYOU25", 25, max_uses_per_customer=1)

        sent = 0
        for email in opt_in_emails:
            # Did this customer ride in the last 60 days? If yes → skip.
            recent = await db.bookings.find_one(
                {"email": email, "status": "completed", "pickup_iso": {"$gte": cutoff_high}},
                {"_id": 0, "id": 1},
            )
            if recent:
                continue
            # Did they ride 60-90 days ago? If never → skip (handled by welcome).
            last = await db.bookings.find_one(
                {"email": email, "status": "completed", "pickup_iso": {"$gte": cutoff_low, "$lt": cutoff_high}},
                {"_id": 0, "id": 1, "full_name": 1},
            )
            if not last:
                continue
            # Has a win-back already been sent in the last 90 days?
            already = await db.email_winback_log.find_one(
                {"email": email, "sent_at": {"$gte": cutoff_low}},
                {"_id": 0, "email": 1},
            )
            if already:
                continue
            try:
                html = render_winback_email(
                    name=last.get("full_name") or "",
                    promo_code="WEMISSYOU25",
                    site_url=_public_site_url(),
                ).replace("{unsubscribe_url}", _unsubscribe_url(email))
                await send_email(
                    to=email,
                    subject="We've missed you — $25 off your next ride",
                    html=html,
                )
                await db.email_winback_log.insert_one({
                    "email": email,
                    "sent_at": now.isoformat(),
                    "code": "WEMISSYOU25",
                })
                sent += 1
            except Exception as e:
                logger.warning(f"winback for {email} failed: {e}")
        if sent:
            logger.info(f"Win-back emails sent: {sent}")
    except Exception as e:
        logger.warning(f"_send_winback_emails failed: {e}")


# ----- Admin: Compose & send a broadcast promo email ------------------------

class BroadcastEmailRequest(BaseModel):
    subject: str = Field(..., min_length=4, max_length=120)
    kicker: str = Field("Special offer", min_length=2, max_length=40)
    headline: str = Field(..., min_length=4, max_length=120)
    body_html: str = Field(..., min_length=10, max_length=20000)
    cta_url: Optional[str] = Field(None, max_length=500)
    cta_label: Optional[str] = Field(None, max_length=40)
    test_only: bool = False  # If true, sends only to the requesting admin
    test_email: Optional[str] = None  # Override admin email for test send


# NOTE: routes for broadcast preview/send/history are defined earlier in the file
# (before app.include_router so they get picked up).


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


# ============================================================================
# Modular routers — extracted from this file in the 2026-02 refactor.
# Imported HERE (at the bottom) so that `from server import *` inside each
# routes/X.py picks up every helper/model/dep defined above.
# ============================================================================
from routes import admin as _routes_admin  # noqa: E402
from routes import customer as _routes_customer  # noqa: E402
from routes import driver as _routes_driver  # noqa: E402
from routes import payments as _routes_payments  # noqa: E402

api_router.include_router(_routes_admin.router)
api_router.include_router(_routes_customer.router)
api_router.include_router(_routes_driver.router)
api_router.include_router(_routes_payments.router)

# Final registration — MUST come after all api_router.include_router() calls
# because FastAPI snapshots routes at the moment of include_router().
app.include_router(api_router)
app.include_router(api_router_affiliates)
