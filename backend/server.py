from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import logging
import math
import uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import httpx
import jwt
import bcrypt
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

app = FastAPI(title="Turonlimo API")
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
    "Executive Sedan": {"base": 75.0, "per_mile": 3.50, "minimum": 85.0, "call_only": False},
    "S-Class": {"base": 95.0, "per_mile": 4.50, "minimum": 115.0, "call_only": False},
    "Luxury SUV": {"base": 115.0, "per_mile": 4.75, "minimum": 135.0, "call_only": False},
    "Stretch Limousine": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "call_only": True},
    "Sprinter Van": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "call_only": True},
    "Party Bus": {"base": 0.0, "per_mile": 0.0, "minimum": 0.0, "call_only": True},
}

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
    status: str = "pending"
    created_at: str


class BookingStatusUpdate(BaseModel):
    status: str


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


# ---------- Public routes ----------
@api_router.get("/")
async def root():
    return {"message": "Turonlimo API", "status": "ok"}


@api_router.get("/options")
async def get_options():
    return {
        "vehicle_types": VEHICLE_TYPES,
        "service_types": SERVICE_TYPES,
        "booking_statuses": BOOKING_STATUSES,
    }


@api_router.post("/bookings", response_model=Booking)
async def create_booking(payload: BookingCreate):
    if payload.vehicle_type not in VEHICLE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid vehicle_type. Must be one of {VEHICLE_TYPES}")
    if payload.service_type not in SERVICE_TYPES:
        raise HTTPException(status_code=400, detail=f"Invalid service_type. Must be one of {SERVICE_TYPES}")

    doc = payload.model_dump()
    doc['id'] = str(uuid.uuid4())
    doc['status'] = 'pending'
    doc['created_at'] = datetime.now(timezone.utc).isoformat()
    doc['notes'] = doc.get('notes') or ""
    doc['return_location'] = doc.get('return_location') or ""
    doc['additional_stops'] = doc.get('additional_stops') or []

    insert_doc = doc.copy()
    await db.bookings.insert_one(insert_doc)
    return Booking(**doc)


# ---------- Quote / Pricing ----------
class QuoteRequest(BaseModel):
    pickup_location: str = Field(..., min_length=2, max_length=300)
    dropoff_location: str = Field(..., min_length=2, max_length=300)


class VehicleQuote(BaseModel):
    vehicle_type: str
    price: Optional[float] = None
    formatted_price: Optional[str] = None
    message: Optional[str] = None


class QuoteResponse(BaseModel):
    distance_miles: Optional[float] = None
    duration_minutes: Optional[float] = None
    pickup_resolved: Optional[str] = None
    dropoff_resolved: Optional[str] = None
    quotes: List[VehicleQuote]
    fallback: bool = False


def _haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    R = 3958.7613  # Earth radius in miles
    p1 = math.radians(lat1)
    p2 = math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


async def _geocode(address: str) -> Optional[dict]:
    """Geocode via Nominatim with MongoDB cache (30-day TTL).
    Tries the raw address first, then with ', California' appended for partial Bay-Area names."""
    key = address.strip().lower()
    cached = await db.geocode_cache.find_one({"key": key}, {"_id": 0})
    if cached and "lat" in cached and "lon" in cached:
        return cached

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
                    headers={"User-Agent": "TuronlimoQuoteBot/1.0 (reservations@turonlimo.com)"},
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
                        "cached_at": datetime.now(timezone.utc).isoformat(),
                    }
                    await db.geocode_cache.update_one({"key": key}, {"$set": doc}, upsert=True)
                    return doc
        return None
    except Exception as e:
        logging.getLogger(__name__).warning(f"Geocode failed for '{address}': {e}")
        return None


def _build_quotes(distance_miles: Optional[float], pricing_map: dict) -> List[VehicleQuote]:
    quotes: List[VehicleQuote] = []
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
        price = round(price, 2)
        quotes.append(VehicleQuote(
            vehicle_type=vt,
            price=price,
            formatted_price=f"${int(price):,}" if price == int(price) else f"${price:,.2f}",
            message="Estimated flat rate",
        ))
    return quotes


async def _load_pricing_map() -> dict:
    cursor = db.pricing_config.find({}, {"_id": 0})
    rows = await cursor.to_list(50)
    return {r["vehicle_type"]: r for r in rows}


@api_router.post("/quote", response_model=QuoteResponse)
async def quote_ride(payload: QuoteRequest):
    pricing_map = await _load_pricing_map()
    pickup = await _geocode(payload.pickup_location)
    dropoff = await _geocode(payload.dropoff_location)
    if not pickup or not dropoff:
        return QuoteResponse(quotes=_build_quotes(None, pricing_map), fallback=True)

    miles = _haversine_miles(pickup["lat"], pickup["lon"], dropoff["lat"], dropoff["lon"])
    miles = round(miles, 1)
    duration_minutes = round((miles * 1.4) / 32.0 * 60.0 + 8.0, 0)
    return QuoteResponse(
        distance_miles=miles,
        duration_minutes=duration_minutes,
        pickup_resolved=pickup.get("display"),
        dropoff_resolved=dropoff.get("display"),
        quotes=_build_quotes(miles, pricing_map),
        fallback=False,
    )


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


# ---------- Admin auth ----------
@api_router.post("/admin/login", response_model=LoginResponse)
async def admin_login(payload: LoginRequest):
    user = await db.admin_users.find_one({"email": payload.email.lower()}, {"_id": 0})
    if not user or not verify_password(payload.password, user.get('password_hash', '')):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user['email'])
    return LoginResponse(token=token, email=user['email'])


@api_router.get("/admin/me")
async def admin_me(payload: dict = Depends(require_admin)):
    return {"email": payload.get('sub'), "role": payload.get('role')}


# ---------- Admin protected: bookings ----------
@api_router.get("/admin/bookings", response_model=List[Booking])
async def list_bookings(_: dict = Depends(require_admin)):
    cursor = db.bookings.find({}, {"_id": 0}).sort("created_at", -1)
    items = await cursor.to_list(1000)
    return [Booking(**i) for i in items]


@api_router.patch("/admin/bookings/{booking_id}", response_model=Booking)
async def update_booking_status(
    booking_id: str,
    payload: BookingStatusUpdate,
    _: dict = Depends(require_admin),
):
    if payload.status not in BOOKING_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of {BOOKING_STATUSES}")
    result = await db.bookings.find_one_and_update(
        {"id": booking_id},
        {"$set": {"status": payload.status}},
        return_document=True,
        projection={"_id": 0},
    )
    if not result:
        raise HTTPException(status_code=404, detail="Booking not found")
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
    call_only: bool = False
    updated_at: Optional[str] = None


class PricingUpdate(BaseModel):
    base: Optional[float] = None
    per_mile: Optional[float] = None
    minimum: Optional[float] = None
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
        await db.contacts.create_index("id", unique=True)
        await db.pricing_config.create_index("vehicle_type", unique=True)
    except Exception as e:
        logger.warning(f"Index creation skipped: {e}")

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

    # Seed admin (idempotent)
    email = ADMIN_EMAIL.lower()
    existing = await db.admin_users.find_one({"email": email})
    if existing is None:
        await db.admin_users.insert_one({
            "email": email,
            "password_hash": hash_password(ADMIN_PASSWORD),
            "role": "admin",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        logger.info(f"Seeded admin user: {email}")
    elif not verify_password(ADMIN_PASSWORD, existing.get('password_hash', '')):
        await db.admin_users.update_one(
            {"email": email},
            {"$set": {"password_hash": hash_password(ADMIN_PASSWORD)}},
        )
        logger.info(f"Updated admin password: {email}")


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
