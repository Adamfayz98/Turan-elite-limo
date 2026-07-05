"""
Admin dashboard routes — extracted from server.py during 2026-02 refactor.

Handlers are imported into their own APIRouter and registered in server.py
via `api_router.include_router(router)`. Helpers/models/deps still live in
server.py and are pulled into this module's globals below (including
underscore-prefixed private helpers — `from server import *` skips those).
"""
# ruff: noqa: F821, F405
# pyright: reportUndefinedVariable=false
# Names like `db`, `datetime`, `HTTPException`, `Depends`, `logger`, model
# classes, and private helpers (`_generate_2fa_code`, etc.) are pulled in
# at runtime via `globals().update(vars(_server))` below. Static linters
# can't see this, so we silence F821/F405 for this file.
from __future__ import annotations

from fastapi import APIRouter

# Single shared router for this group. Mounted under /api in server.py.
router = APIRouter()

# Bulk-copy every public AND private name from server into our globals so that
# function bodies (which were originally written against server.py's module
# namespace) resolve correctly. This is safe because server.py imports this
# module at the BOTTOM, after every helper/model/dep is already defined.
import server as _server  # noqa: E402
globals().update({k: v for k, v in vars(_server).items() if not k.startswith("__")})


@router.post("/admin/bookings/{booking_id}/mark-read")
async def admin_mark_booking_read(booking_id: str, _: dict = Depends(require_admin)):
    """Flip is_read=True on a booking so the admin UI stops highlighting it.
    Used for unread-indicator pattern (like unread emails)."""
    r = await db.bookings.update_one(
        {"id": booking_id, "is_read": {"$ne": True}},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc).isoformat()}},
    )
    return {"ok": True, "marked": r.modified_count}


@router.post("/admin/bookings/{booking_id}/assign-driver")
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


@router.delete("/admin/bookings/{booking_id}/driver")
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


@router.post("/admin/bookings/{booking_id}/mark-wait-time-external")
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


@router.post("/admin/bookings/{booking_id}/mark-mid-trip-stop-external")
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


@router.post("/admin/bookings/{booking_id}/mark-damage-external")
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


@router.get("/admin/announcements")
async def admin_list_announcements(_: dict = Depends(require_admin)):
    items = []
    async for a in db.announcements.find({}, {"_id": 0}).sort("created_at", -1):
        items.append(a)
    return items


@router.post("/admin/announcements", response_model=Announcement)
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


@router.patch("/admin/announcements/{aid}", response_model=Announcement)
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


@router.delete("/admin/announcements/{aid}")
async def admin_delete_announcement(aid: str, _: dict = Depends(require_admin)):
    r = await db.announcements.delete_one({"id": aid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"deleted": True}


@router.get("/admin/drivers")
async def admin_list_drivers(_: dict = Depends(require_admin)):
    items = []
    async for d in db.drivers.find({}, {"_id": 0}).sort([("active", -1), ("name", 1)]):
        items.append(d)
    return items


@router.post("/admin/drivers", response_model=Driver)
async def admin_create_driver(payload: DriverCreate, _: dict = Depends(require_admin)):
    now = datetime.now(timezone.utc).isoformat()
    doc = {**payload.model_dump(), "id": str(uuid.uuid4()), "created_at": now, "updated_at": now}
    await db.drivers.insert_one(doc.copy())
    return Driver(**{k: v for k, v in doc.items() if k != "_id"})


@router.patch("/admin/drivers/{driver_id}", response_model=Driver)
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


@router.delete("/admin/drivers/{driver_id}")
async def admin_delete_driver(driver_id: str, _: dict = Depends(require_admin)):
    r = await db.drivers.delete_one({"id": driver_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Driver not found")
    return {"deleted": True}


@router.get("/admin/quote-requests")
async def admin_list_quote_requests(_: dict = Depends(require_admin)):
    items = []
    async for d in db.quote_requests.find({}, {"_id": 0}).sort("created_at", -1).limit(200):
        items.append(d)
    return items


# ---- Off-platform lead import (Yelp, Google Business Profile, phone call, etc.) ----
#
# Yelp doesn't expose a public Lead API, and operators paste-import leads
# manually multiple times a day. This endpoint accepts the raw lead text
# (whatever the admin copies from Yelp's inbox / a voicemail transcript /
# an inbound email) and uses an LLM to extract structured fields. Output
# matches the shape of `QuoteRequestCreate` so the lead lands on the
# Quote Requests tab identically to a website-submitted lead — same risk
# badge, same SMS alert, same downstream pipeline.
_LEAD_EXTRACTION_SYSTEM_PROMPT = """You are a structured-data extractor AND a friendly concierge copywriter for TuranEliteLimo (premium chauffeur service, Bay Area).

You will receive a raw, free-form lead message from a customer (Yelp inbox, Google
Business Profile, voicemail transcript, inbound email, or hand-typed phone-call
notes). You have TWO jobs:

1. Extract the booking details into structured JSON.
2. Draft a warm, professional first-response message the operator can send back
   on the same channel to acknowledge the lead, ask the few details still missing,
   and set expectations for when a formal quote follows.

Return ONLY a single JSON object with these exact keys (use null when unknown):

{
  "full_name": string | null,
  "phone": string | null,
  "email": string | null,
  "vehicle_type": string | null,        // "Party Bus" | "Sprinter" | "SUV" | "Sedan" | "Mini-Coach" | "Other" | null
  "pickup_date": string | null,         // ISO date "YYYY-MM-DD"
  "pickup_time": string | null,         // 24-hour "HH:MM"
  "pickup_location": string | null,
  "dropoff_location": string | null,
  "passengers": number | null,          // integer, total bodies (adults + kids)
  "occasion": string | null,            // "Wedding" | "Wine Tour" | "Concert" | "Airport" | "Birthday" | "Family Event" | "Corporate" | "Prom" | "Funeral" | "Other"
  "notes": string | null,               // any other useful details
  "suggested_reply": string             // first-response message ready to paste back to the customer
}

Extraction rules:
- Dates → YYYY-MM-DD. If only month/day given without year, assume next future occurrence.
- Times → 24-hour HH:MM ("1pm" → "13:00", "4:30 PM" → "16:30").
- passengers → single integer (total). Put adult/kid breakdown in notes.
- vehicle_type → infer from context ("party bus" → "Party Bus", "limo" → "Sprinter", "SUV"). Null if unclear.
- Round-trip details (return time, return pickup) go in notes.
- Do NOT hallucinate. Use null for anything you can't extract confidently.

Suggested-reply rules:
- 80-180 words, friendly but professional. Match the channel tone (Yelp = warm, conversational; phone-call = brief).
- Open by acknowledging their request and confirming you have the key details.
- Ask 1-3 of the most important MISSING details (e.g., exact pickup address if only zip given, concert start time, return time, driveway access for mountain destinations).
- Mention you're confirming availability with their preferred vehicle type and will follow up with formal pricing within 1-2 hours.
- Mention a refundable deposit holds the date.
- Sign off as "— Turan Elite Limo".
- Do NOT include a phone number or specific dollar amounts (operator fills that on the formal quote).
- Do NOT use heavy markdown formatting (no headings or bullet lists) — write as plain prose suitable for SMS/Yelp inbox.
- Use 1-2 tasteful emoji max if and only if the source is Yelp or Email; phone-call notes get zero emoji.
"""


@router.post("/admin/quote-requests/import-lead")
async def admin_import_lead(payload: dict, _: dict = Depends(require_admin)):
    """Parse a free-form lead message → extracted fields + risk score.

    Two-step flow: this endpoint ONLY extracts and scores. It does NOT create
    the quote_request yet — the admin reviews/edits the extracted fields in
    the UI and then POSTs to /admin/quote-requests/import-lead/commit.
    """
    raw_text = (payload or {}).get("raw_text", "").strip()
    source = (payload or {}).get("source", "manual").strip().lower() or "manual"
    if not raw_text:
        raise HTTPException(status_code=400, detail="raw_text is required.")
    if len(raw_text) > 8000:
        raise HTTPException(status_code=400, detail="raw_text is too long (max 8000 chars).")

    # Lazy import keeps the module load time fast for non-LLM admin routes
    from emergentintegrations.llm.chat import LlmChat, UserMessage

    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured.")

    chat = LlmChat(
        api_key=emergent_key,
        session_id=f"lead-import-{uuid.uuid4()}",
        system_message=_LEAD_EXTRACTION_SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-2.5-flash")

    # Wrap the raw text with explicit source context so the LLM knows how
    # to tone the suggested_reply (Yelp = warm + emoji OK; phone = brief).
    framed = f"Lead source: {source}\n\n---\nRaw lead text:\n{raw_text}"
    try:
        llm_response = await chat.send_message(UserMessage(text=framed))
    except Exception as e:
        logger.warning(f"Lead extraction LLM call failed: {e}")
        raise HTTPException(status_code=502, detail=f"LLM extraction failed: {e}")

    # Strip markdown fences in case the model ignores instructions
    cleaned = (llm_response or "").strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.strip("`")
        if cleaned.lower().startswith("json"):
            cleaned = cleaned[4:].lstrip()

    try:
        extracted = json.loads(cleaned)
    except Exception as e:
        logger.warning(f"Lead extraction JSON parse failed; raw={cleaned!r}; err={e}")
        raise HTTPException(
            status_code=502,
            detail="LLM returned non-JSON output. Try again or paste the lead manually.",
        )

    if not isinstance(extracted, dict):
        raise HTTPException(status_code=502, detail="LLM did not return an object.")

    # Run the existing risk scorer on the extracted fields so the admin
    # can see green/yellow/red BEFORE committing to a quote_request row.
    try:
        risk = await safety.score_submission(
            db=db,
            full_name=(extracted.get("full_name") or "")[:80],
            email=(extracted.get("email") or "")[:120],
            phone=(extracted.get("phone") or "")[:30],
            ip="",  # off-platform leads have no IP
            user_agent="",
            pickup_location=(extracted.get("pickup_location") or "")[:300],
            dropoff_location=(extracted.get("dropoff_location") or "")[:300],
            amount=0.0,
        )
    except Exception as e:
        logger.warning(f"Lead risk scoring failed: {e}")
        risk = {"score": 0, "band": "green", "flags": [], "blacklisted": False, "blacklist_hits": [], "ip_geo": {}}

    return {
        "source": source,
        "extracted": extracted,
        "risk": risk,
    }


@router.post("/admin/quote-requests/import-lead/commit")
async def admin_import_lead_commit(payload: dict, _: dict = Depends(require_admin)):
    """Commit the (possibly admin-edited) extracted lead as a real quote_request.

    Front-end posts the cleaned-up fields here after the operator reviewed
    the LLM output. This keeps the LLM step idempotent and lets the admin
    fix any wrong extraction before the row is created.
    """
    source = (payload or {}).get("source", "manual").strip().lower() or "manual"
    fields = (payload or {}).get("fields") or {}
    raw_text = (payload or {}).get("raw_text", "").strip()

    # Minimal field guard: name OR phone OR email must be present so we have
    # *something* to reach the customer with. Otherwise the row is useless.
    if not (
        (fields.get("full_name") or "").strip()
        or (fields.get("phone") or "").strip()
        or (fields.get("email") or "").strip()
    ):
        raise HTTPException(status_code=400, detail="At least one of full_name, phone, or email is required.")

    # Pydantic-style coercion on the LLM output before persisting. LLMs
    # occasionally return passengers as a string or invent natural-language
    # dates like "next Tuesday" — these would persist as-is and break
    # downstream date math, so we silently null them out instead.
    pax_raw = fields.get("passengers")
    pax = None
    if pax_raw not in (None, ""):
        try:
            pax = int(str(pax_raw).strip())
            if pax < 1 or pax > 100:
                pax = None
        except (TypeError, ValueError):
            pax = None

    pickup_date_raw = (fields.get("pickup_date") or "").strip()
    # ISO date guard — anything that doesn't parse as YYYY-MM-DD gets dropped.
    if pickup_date_raw and not re.match(r"^\d{4}-\d{2}-\d{2}$", pickup_date_raw):
        pickup_date_raw = ""
    pickup_time_raw = (fields.get("pickup_time") or "").strip()
    if pickup_time_raw and not re.match(r"^\d{2}:\d{2}$", pickup_time_raw):
        pickup_time_raw = ""

    doc = {
        "id": str(uuid.uuid4()),
        "created_at": datetime.now(timezone.utc).isoformat(),
        "status": "new",
        "source": source,
        "full_name": (fields.get("full_name") or "(unknown)")[:80],
        "phone": (fields.get("phone") or "")[:30],
        "email": (fields.get("email") or "")[:120],
        "vehicle_type": (fields.get("vehicle_type") or "Other")[:40],
        "pickup_date": pickup_date_raw[:20],
        "pickup_time": pickup_time_raw[:10],
        "pickup_location": (fields.get("pickup_location") or "")[:300],
        "dropoff_location": (fields.get("dropoff_location") or "")[:300],
        "passengers": pax,
        "occasion": (fields.get("occasion") or "")[:80],
        "notes": (fields.get("notes") or "")[:1000],
        "raw_lead_text": raw_text[:8000],
        "imported_at": datetime.now(timezone.utc).isoformat(),
    }

    # Re-score on the COMMITTED fields (the admin may have edited them).
    try:
        risk = await safety.score_submission(
            db=db,
            full_name=doc["full_name"],
            email=doc["email"],
            phone=doc["phone"],
            ip="",
            user_agent="",
            pickup_location=doc["pickup_location"],
            dropoff_location=doc["dropoff_location"],
            amount=0.0,
        )
        doc["risk_score"] = risk["score"]
        doc["risk_band"] = risk["band"]
        doc["risk_flags"] = risk["flags"]
        doc["blacklisted"] = risk["blacklisted"]
    except Exception as e:
        logger.warning(f"commit risk scoring failed: {e}")

    await db.quote_requests.insert_one(doc.copy())
    doc.pop("_id", None)
    return {"ok": True, "id": doc["id"], "quote_request": doc}


# ----------------------------------------------------------------------
# AI text-draft endpoints
# ----------------------------------------------------------------------
# Saves operator hand-typing on every lead. Two flavors:
#   1) "customer_notes" — warm, customer-facing language that ends up on the
#      Confirm-and-Pay page and inside the auto-generated PDF invoice.
#   2) "dispatch_instructions" — terse, ops-style brief written for the
#      affiliate driver. PII-stripped tone, focuses on logistics + vibe.
#
# Both flavors share one endpoint and one Gemini call to keep latency low.
# The operator picks the flavor with the `mode` field. Output is plain
# text (no markdown / no JSON wrapper) so the UI can paste it directly
# into the corresponding Textarea.

_DRAFT_CUSTOMER_NOTES_SYSTEM = """You are an executive copywriter for Turan Elite Limo, a Bay Area luxury chauffeur company. Draft the "Notes for customer" section that appears on the customer's quote confirmation page and on their PDF invoice.

Rules:
- Write 4–8 short lines of natural, warm prose. No bullet lists, no headings, no markdown.
- ALWAYS open with what's INCLUDED in the trip (vehicle features relevant to the occasion).
- ALWAYS mention the minimum-hour rule and the per-hour overage rate ONLY IF the operator passed `hourly_overage` in the context; otherwise omit pricing specifics.
- Mention the standard payment policy in one tight line: "50% deposit confirms · remaining 50% charged day-before · Free cancel 7+ days out · 50% fee inside 7 days · Non-refundable inside 48 hrs."
- Mention chauffeur gratuity is not included (20% suggested).
- If the occasion involves alcohol (birthday / bachelorette / prom / club), add a single tactful line about 21+ ID required and BYOB allowed.
- Match the tone to the occasion: weddings/corporate = elegant; birthday/bachelorette = warm and excited; airport = brisk and professional.
- Never invent vehicle features that aren't standard for that vehicle class.
- Never write a salutation ("Hi Sarah") — this text is embedded inside an email, not a standalone message.
- Sign-off is NOT needed — the email template handles that."""

_DRAFT_DISPATCH_SYSTEM = """You are dispatch coordinator at Turan Elite Limo writing instructions for an affiliate driver who will execute this trip. Write a tight ops brief.

Rules:
- 3–6 short bullets, each starting with a verb. Plain text bullets ("• ").
- Cover (in order, only if relevant): vibe expectation, pre-trip setup tasks (e.g. stock ice, test club lights), pickup posture (curbside, lobby, driveway access), known group quirks, special stops, post-trip behavior.
- NEVER include the customer's last name, full phone number, full address, or email. Use first name and last-initial only if you reference them at all.
- NO retail price, deposit %, or commercial info — affiliate only sees the agreed NET rate which the operator stamps separately on the PDF.
- Keep it under 90 words total."""


# ----- SMS variants -----
# All SMS drafts share a single style guide: warm, first-person Adam voice,
# short, mobile-friendly. The `sms_intent` field in the context tells the
# model which scenario to write for (initial outreach, follow-up, etc.) so
# we don't have to maintain 4 separate system prompts.
_DRAFT_SMS_SYSTEM = """You write SMS replies for Adam, owner of Turan Elite Limo (Bay Area luxury chauffeur). The recipient is a real customer — be warm, professional, and concise.

Hard rules:
- Output 1–4 short paragraphs. NO headings, NO bullet points, NO emoji-heavy formatting (one tasteful emoji max, only if it fits the occasion).
- Target ≤ 320 characters total when possible. NEVER exceed 480 characters.
- First-person voice as "Adam" — never refer to "we at Turan Elite" in third person.
- Always end with the signature line: "— Adam · (650) 410-0687"
- Plain text only. No markdown.

Tone by `sms_intent` field:
- "initial_outreach": warm opener after the customer first submitted a quote request. Confirm receipt, acknowledge their occasion, ask 1–2 clarifying questions if relevant, mention you'll have a price soon.
- "quote_followup": they got a quote but haven't replied in a few hours. Friendly nudge, re-anchor the price, offer to answer questions or send the deposit link. Use scarcity ONLY if the operator passed `hold_release_time` in context (e.g. "affiliate releases the date at end of day").
- "final_nudge": last polite check before marking lost. One line: are they still in? Offer to send the link or hop on a call. Do not guilt-trip.
- "thank_you_confirm": deposit just landed. Confirm the booking, share what happens next (confirmation email, dispatch sheet day-before), express genuine appreciation.
- "custom": follow the `custom_instruction` field literally.

Inject the customer's first name naturally when given. Never invent details not in the context (e.g. don't make up pickup addresses, prices, or vehicle types). If a critical fact is missing, write around it gracefully."""


@router.post("/admin/ai/draft-sms")
async def admin_ai_draft_sms(payload: dict, _: dict = Depends(require_admin)):
    """Draft an SMS reply for a quote-request lead.

    Body:
        sms_intent: one of "initial_outreach", "quote_followup",
                    "final_nudge", "thank_you_confirm", "custom"
        context: free-form dict with whatever the model should consider.
                 Common fields:
                   - first_name, vehicle_type, occasion, passengers,
                     pickup_date, pickup_time, pickup_location,
                     dropoff_location, quoted_price (str), deposit_pct,
                     hold_release_time (e.g. "end of day today"),
                     custom_instruction (used only when intent=custom)
    Returns:
        { intent, text }   # plain SMS text, ≤ 480 chars, ready to copy

    Stays inside the existing AI-draft endpoint pattern so we don't need a
    new SDK setup. Uses Gemini 2.5 Flash for ~$0.0003/call and ~1-2s latency.
    """
    intent = (payload or {}).get("sms_intent", "").strip().lower()
    valid_intents = ("initial_outreach", "quote_followup", "final_nudge", "thank_you_confirm", "custom")
    if intent not in valid_intents:
        raise HTTPException(status_code=400, detail=f"sms_intent must be one of: {', '.join(valid_intents)}.")
    context = (payload or {}).get("context") or {}
    if not isinstance(context, dict):
        raise HTTPException(status_code=400, detail="context must be an object.")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured.")

    chat = LlmChat(
        api_key=emergent_key,
        session_id=f"sms-{intent}-{uuid.uuid4()}",
        system_message=_DRAFT_SMS_SYSTEM,
    ).with_model("gemini", "gemini-2.5-flash")

    # Compact context so we don't burn tokens on empty fields
    lines = [f"sms_intent: {intent}"]
    for k, v in context.items():
        if v in (None, "", [], {}):
            continue
        if isinstance(v, list):
            v = " → ".join(str(x) for x in v if x)
        lines.append(f"{k}: {v}")
    framed = "\n".join(lines)

    try:
        llm_response = await chat.send_message(UserMessage(text=framed))
    except Exception as e:
        logger.warning(f"AI SMS draft ({intent}) call failed: {e}")
        raise HTTPException(status_code=502, detail=f"SMS drafting failed: {e}")

    text = (llm_response or "").strip()
    # Strip markdown fences if the model added them
    if text.startswith("```"):
        text = text.strip("`").lstrip("\n")
        if text.lower().startswith("text"):
            text = text[4:].lstrip()
    # Trim accidental wrapping quotes
    if (text.startswith('"') and text.endswith('"')) or (text.startswith("'") and text.endswith("'")):
        text = text[1:-1].strip()

    return {"intent": intent, "text": text, "char_count": len(text)}


# -----------------------------------------------------------------
# SMS Presets — operator-saved custom-mode prompts for re-use
# -----------------------------------------------------------------
# Adam wanted "save my own phrasing for wine-tour replies / airport replies /
# etc" so he stops re-typing the same custom instruction. Each preset stores
# a short label + the instruction text. Loaded into the Draft SMS dialog as
# extra chips below the 5 built-in scenarios.
@router.get("/admin/sms-presets")
async def admin_list_sms_presets(_: dict = Depends(require_admin)):
    rows = await db.sms_presets.find({}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return rows


@router.post("/admin/sms-presets")
async def admin_create_sms_preset(payload: dict, _: dict = Depends(require_admin)):
    name = (payload or {}).get("name", "").strip()
    instruction = (payload or {}).get("instruction", "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="name is required.")
    if not instruction:
        raise HTTPException(status_code=400, detail="instruction is required.")
    if len(name) > 60:
        raise HTTPException(status_code=400, detail="name must be ≤ 60 chars.")
    if len(instruction) > 800:
        raise HTTPException(status_code=400, detail="instruction must be ≤ 800 chars.")
    doc = {
        "id": str(uuid.uuid4()),
        "name": name,
        "instruction": instruction,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.sms_presets.insert_one(doc.copy())
    doc.pop("_id", None)
    return doc


@router.delete("/admin/sms-presets/{preset_id}")
async def admin_delete_sms_preset(preset_id: str, _: dict = Depends(require_admin)):
    r = await db.sms_presets.delete_one({"id": preset_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Preset not found.")
    return {"ok": True}


@router.post("/admin/ai/draft-quote-text")
async def admin_ai_draft_quote_text(payload: dict, _: dict = Depends(require_admin)):
    """Draft customer-facing notes OR affiliate dispatch instructions for a quote.

    Body:
        mode: "customer_notes" | "dispatch_instructions"
        context: free-form dict containing whatever the operator wants the
                 model to consider. Typical fields:
                   - vehicle_type, occasion, passengers, pickup_date,
                     pickup_time, pickup_location, dropoff_location,
                     stops (list[str]), service_duration, special_notes,
                     hourly_overage (float, optional)
    Returns:
        { mode, text }   # plain text, ready to paste into Textarea
    """
    mode = (payload or {}).get("mode", "").strip().lower()
    if mode not in ("customer_notes", "dispatch_instructions"):
        raise HTTPException(status_code=400, detail="mode must be 'customer_notes' or 'dispatch_instructions'.")
    context = (payload or {}).get("context") or {}
    if not isinstance(context, dict):
        raise HTTPException(status_code=400, detail="context must be an object.")

    from emergentintegrations.llm.chat import LlmChat, UserMessage

    emergent_key = os.environ.get("EMERGENT_LLM_KEY")
    if not emergent_key:
        raise HTTPException(status_code=500, detail="EMERGENT_LLM_KEY not configured.")

    system_prompt = _DRAFT_CUSTOMER_NOTES_SYSTEM if mode == "customer_notes" else _DRAFT_DISPATCH_SYSTEM
    chat = LlmChat(
        api_key=emergent_key,
        session_id=f"draft-{mode}-{uuid.uuid4()}",
        system_message=system_prompt,
    ).with_model("gemini", "gemini-2.5-flash")

    # Strip empties and stringify so the prompt stays short + token-cheap.
    lines = []
    for k, v in context.items():
        if v in (None, "", [], {}):
            continue
        if isinstance(v, list):
            v = " → ".join(str(x) for x in v if x)
        lines.append(f"{k}: {v}")
    framed = "Trip context:\n" + ("\n".join(lines) if lines else "(no details supplied)")

    try:
        llm_response = await chat.send_message(UserMessage(text=framed))
    except Exception as e:
        logger.warning(f"AI draft ({mode}) call failed: {e}")
        raise HTTPException(status_code=502, detail=f"Drafting failed: {e}")

    text = (llm_response or "").strip()
    # Defensive: strip any markdown fences the model may have added despite
    # the system prompt asking for plain text.
    if text.startswith("```"):
        text = text.strip("`")
        # drop any leading language hint
        text = text.lstrip("\n")
        if text.lower().startswith("text"):
            text = text[4:].lstrip()

    return {"mode": mode, "text": text}


@router.get("/admin/email-list")
async def admin_email_list(_: dict = Depends(require_admin)):
    """
    Returns the master marketing-email recipient list (opted-in only).
    Used by the Promo Emails admin tab and as a sanity-check before send.
    """
    items = []
    async for d in db.email_opt_ins.find(
        {"opted_in": True}, {"_id": 0}
    ).sort("opted_in_at", -1):
        items.append(d)
    return items


@router.post("/admin/broadcast/preview")
async def admin_broadcast_preview(payload: _BroadcastBody, _: dict = Depends(require_admin)):
    """Returns rendered HTML so the admin can preview before sending."""
    html = render_broadcast_email(
        subject_kicker=payload.kicker,
        headline=payload.headline,
        body_html=payload.body_html,
        cta_url=payload.cta_url,
        cta_label=payload.cta_label,
    ).replace("{unsubscribe_url}", _unsubscribe_url("preview@example.com"))
    return {"html": html, "subject": payload.subject}


@router.post("/admin/broadcast/send")
async def admin_broadcast_send(payload: _BroadcastBody, claims: dict = Depends(require_admin)):
    """Send the broadcast. test_only=true → single test recipient."""
    if payload.test_only:
        recipient_email = payload.test_email or claims.get("email")
        if not recipient_email:
            raise HTTPException(status_code=400, detail="No test recipient available")
        html = render_broadcast_email(
            subject_kicker=payload.kicker,
            headline=payload.headline,
            body_html=payload.body_html,
            cta_url=payload.cta_url,
            cta_label=payload.cta_label,
        ).replace("{unsubscribe_url}", _unsubscribe_url(recipient_email))
        msg_id = await send_email(to=recipient_email, subject=payload.subject, html=html)
        return {"mode": "test", "recipient": recipient_email, "message_id": msg_id}

    opt_ins = await db.email_opt_ins.find(
        {"opted_in": True}, {"_id": 0, "email": 1}
    ).to_list(5000)
    sent = failed = skipped = 0
    for o in opt_ins:
        email = (o.get("email") or "").lower()
        if not email or "@" not in email or email.endswith(".invalid"):
            skipped += 1
            continue
        try:
            html = render_broadcast_email(
                subject_kicker=payload.kicker,
                headline=payload.headline,
                body_html=payload.body_html,
                cta_url=payload.cta_url,
                cta_label=payload.cta_label,
            ).replace("{unsubscribe_url}", _unsubscribe_url(email))
            await send_email(to=email, subject=payload.subject, html=html)
            sent += 1
        except Exception as e:
            logger.warning(f"broadcast send to {email} failed: {e}")
            failed += 1
    await db.email_broadcasts.insert_one({
        "id": str(uuid.uuid4()),
        "subject": payload.subject,
        "kicker": payload.kicker,
        "headline": payload.headline,
        "body_html": payload.body_html,
        "cta_url": payload.cta_url,
        "cta_label": payload.cta_label,
        "sent_count": sent,
        "failed_count": failed,
        "skipped_count": skipped,
        "sent_by": claims.get("email"),
        "sent_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"mode": "live", "sent": sent, "failed": failed, "skipped": skipped, "total": len(opt_ins)}


@router.get("/admin/broadcast/history")
async def admin_broadcast_history(_: dict = Depends(require_admin)):
    items = []
    async for d in db.email_broadcasts.find({}, {"_id": 0}).sort("sent_at", -1).limit(50):
        items.append(d)
    return items


@router.get("/admin/push/eligible-count")
async def admin_push_eligible_count(_: dict = Depends(require_admin)):
    count = await db.customers.count_documents({"push_token": {"$exists": True, "$ne": None}})
    return {"count": count}


@router.post("/admin/push/broadcast")
async def admin_push_broadcast(payload: _PushBroadcastBody, claims: dict = Depends(require_admin)):
    """Send a marketing push to all customers with an Expo token, or to the
    admin's own device when test_only=true (matched by admin email)."""
    data = {"deep_link": payload.deep_link} if payload.deep_link else None
    now_iso = datetime.now(timezone.utc).isoformat()

    if payload.test_only:
        admin_email = (claims.get("email") or "").lower()
        admins = await db.customers.find(
            {"email": admin_email, "push_token": {"$exists": True, "$ne": None}},
            {"_id": 0, "push_token": 1},
        ).to_list(5)
        tokens = [a["push_token"] for a in admins if a.get("push_token")]
        if not tokens:
            raise HTTPException(
                status_code=400,
                detail="No push token registered for your account. Sign in to the mobile app first.",
            )
        await _send_expo_push(tokens, payload.title, payload.body, data, channel_id="marketing")
        return {"mode": "test", "recipients": len(tokens)}

    rows = await db.customers.find(
        {"push_token": {"$exists": True, "$ne": None}},
        {"_id": 0, "push_token": 1},
    ).to_list(20000)
    tokens = [r["push_token"] for r in rows if r.get("push_token")]
    sent = failed = 0
    # Expo allows up to 100 tokens per call — chunk it
    CHUNK = 100
    for i in range(0, len(tokens), CHUNK):
        batch = tokens[i:i + CHUNK]
        try:
            await _send_expo_push(batch, payload.title, payload.body, data, channel_id="marketing")
            sent += len(batch)
        except Exception as e:
            logger.warning(f"push broadcast batch failed: {e}")
            failed += len(batch)

    await db.push_broadcasts.insert_one({
        "id": str(uuid.uuid4()),
        "title": payload.title,
        "body": payload.body,
        "deep_link": payload.deep_link,
        "sent": sent,
        "failed": failed,
        "total": len(tokens),
        "sent_by": claims.get("email"),
        "sent_at": now_iso,
    })
    return {"mode": "live", "sent": sent, "failed": failed, "total": len(tokens)}


@router.get("/admin/push/history")
async def admin_push_history(_: dict = Depends(require_admin)):
    items = []
    async for d in db.push_broadcasts.find({}, {"_id": 0}).sort("sent_at", -1).limit(50):
        items.append(d)
    return {"items": items}


@router.patch("/admin/quote-requests/{rid}")
async def admin_update_quote_request(rid: str, payload: dict, request: Request, _: dict = Depends(require_admin)):
    """Update a quote request. Supports plain status flips AND the richer
    "send the customer a quote with a one-tap confirm link" flow.

    Accepted payload fields:
      • status: new | contacted | quoted | won | lost
      • quoted_price: dollars (number)
      • deposit_pct: 0-100 (default 50)
      • quoted_notes: free-text shown to customer on confirm page
      • affiliate_id: optional, linked at booking time
      • affiliate_cost: optional, what we pay the affiliate
      • send_to_customer: bool — when true (and quoted_price/email present),
        emails the customer the confirm link.
    """
    q = await db.quote_requests.find_one({"id": rid}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Not found")

    update: dict = {}
    now_iso = datetime.now(timezone.utc).isoformat()

    valid_statuses = {"new", "contacted", "quoted", "won", "lost"}
    if "status" in payload and payload["status"] in valid_statuses:
        update["status"] = payload["status"]
        update["status_updated_at"] = now_iso

    # Quote price (dollars). Generates a confirm_token the first time we set a price.
    if "quoted_price" in payload and payload["quoted_price"] is not None:
        try:
            price = round(float(payload["quoted_price"]), 2)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="quoted_price must be a number")
        if price < 1 or price > 50000:
            raise HTTPException(status_code=400, detail="quoted_price out of range")
        update["quoted_price"] = price
        update["quoted_at"] = now_iso
        # Auto-flip status to "quoted" if not explicitly overridden
        if "status" not in update:
            update["status"] = "quoted"
            update["status_updated_at"] = now_iso

    if "deposit_pct" in payload and payload["deposit_pct"] is not None:
        try:
            dp = float(payload["deposit_pct"])
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="deposit_pct must be a number")
        if dp < 0 or dp > 100:
            raise HTTPException(status_code=400, detail="deposit_pct must be 0-100")
        update["deposit_pct"] = dp

    if "quoted_notes" in payload:
        update["quoted_notes"] = (payload.get("quoted_notes") or "")[:1000]

    # Optional invoice_notes — trip-specific free text the operator wants
    # rendered on the customer's PDF invoice (e.g. "Pickup at hotel lobby door 5").
    # The standard 10 policies are ALWAYS baked into the invoice; this field is
    # just for one-off details that vary per trip.
    if "invoice_notes" in payload:
        update["invoice_notes"] = (payload.get("invoice_notes") or "")[:2000]

    if "affiliate_id" in payload:
        update["affiliate_id"] = payload.get("affiliate_id") or None
    if "affiliate_cost" in payload and payload["affiliate_cost"] is not None:
        try:
            update["affiliate_cost"] = round(float(payload["affiliate_cost"]), 2)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="affiliate_cost must be a number")

    # ----- Editable trip / client fields (added so admin can correct
    # last-minute changes the customer texts in — e.g. updated pickup time,
    # address, headcount — without forcing them to resubmit the quote form).
    # All optional; only the fields included in payload are touched. -----
    _STR_FIELDS = ("full_name", "phone", "email", "pickup_date", "pickup_time",
                   "pickup_location", "dropoff_location", "trip_type",
                   "service_duration")
    for f in _STR_FIELDS:
        if f in payload:
            v = payload.get(f)
            update[f] = (str(v).strip()[:300] if v else None)
    if "passengers" in payload:
        v = payload.get("passengers")
        try:
            update["passengers"] = int(v) if v not in (None, "") else None
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="passengers must be an integer")
    if "stops" in payload:
        st = payload.get("stops") or []
        if isinstance(st, list):
            update["stops"] = [str(s).strip()[:300] for s in st if str(s).strip()][:5]

    # First time we're quoting → mint a confirm token
    if update.get("quoted_price") and not q.get("confirm_token"):
        import secrets as _secrets
        update["confirm_token"] = _secrets.token_urlsafe(24)

    if not update:
        raise HTTPException(status_code=400, detail="No valid fields to update")

    r = await db.quote_requests.update_one({"id": rid}, {"$set": update})
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Not found")

    # Refresh
    q = await db.quote_requests.find_one({"id": rid}, {"_id": 0})

    # Optionally send the customer the quote email (with one-tap confirm link).
    sent_to = None
    if payload.get("send_to_customer") and q.get("quoted_price") and q.get("confirm_token"):
        origin = _frontend_origin_from_request(request)
        confirm_url = f"{origin}/quote/{q['confirm_token']}"
        try:
            if q.get("email"):
                html = _render_quote_offer_email(q, confirm_url)
                subj = f"Your TuranEliteLimo quote · ${q['quoted_price']:.2f}"
                # ----- Auto-generate the branded invoice PDF and attach it.
                # Bake in operator's trip-specific notes + the standard policies.
                attachments = []
                try:
                    from pdf_service import generate_invoice_pdf
                    pdf_bytes = generate_invoice_pdf(
                        q,
                        custom_notes=q.get("invoice_notes") or "",
                        deposit_pct=float(q.get("deposit_pct") or 25),
                    )
                    inv_id = f"TEL-{(q.get('id') or '')[:8].upper()}"
                    attachments = [{
                        "filename": f"TuranEliteLimo-Invoice-{inv_id}.pdf",
                        "content": pdf_bytes,
                    }]
                except Exception as pdf_err:
                    logger.warning(f"Invoice PDF generation failed: {pdf_err}")
                await send_email(
                    to=q["email"],
                    subject=subj,
                    html=html,
                    attachments=attachments or None,
                )
                sent_to = q["email"]
        except Exception as e:
            logger.warning(f"Quote-offer email send failed: {e}")
        # Always email — the guaranteed channel. SMS is best-effort on top,
        # ONLY if the customer opted in on the quote request (Twilio A2P
        # voluntary-opt-in rule — SMS can't be a condition of getting a quote).
        try:
            phone_raw = (q.get("phone") or "").strip()
            if phone_raw and q.get("sms_consent"):
                deposit_pct = q.get("deposit_pct", 50)
                deposit_amt = round(float(q["quoted_price"]) * float(deposit_pct) / 100.0, 2)
                sms = (
                    f"TuranEliteLimo · Your quote is ready 🚘\n"
                    f"{q['vehicle_type']} · ${q['quoted_price']:.0f} flat\n"
                    f"Tap to confirm & pay ${deposit_amt:.0f} deposit:\n"
                    f"{confirm_url}"
                )
                await sms_service.send_sms(phone_raw, sms)
        except Exception as e:
            logger.warning(f"Quote-offer SMS send failed: {e}")

    return {
        "ok": True,
        "confirm_token": q.get("confirm_token"),
        "confirm_url": f"{_frontend_origin_from_request(request)}/quote/{q['confirm_token']}" if q.get("confirm_token") else None,
        "sent_to": sent_to,
        "quote": q,
    }


def _render_quote_offer_email(q: dict, confirm_url: str) -> str:
    """Branded email sent to the customer with the trip details + a single
    bold "Confirm & Pay Deposit" CTA button that opens the public quote page."""
    price = float(q.get("quoted_price") or 0)
    dp_pct = float(q.get("deposit_pct") or 50)
    deposit = round(price * dp_pct / 100.0, 2)
    notes = (q.get("quoted_notes") or "").replace("<", "&lt;").replace(">", "&gt;").replace("\n", "<br>")

    def row(label, value):
        if not value:
            return ""
        v = str(value).replace("<", "&lt;").replace(">", "&gt;")
        return (
            f'<tr><td style="padding:9px 0;color:#888;font-size:11px;text-transform:uppercase;'
            f'letter-spacing:.18em;width:42%;">{label}</td>'
            f'<td style="padding:9px 0;color:#fff;font-size:14px;font-weight:500;">{v}</td></tr>'
        )

    rows = "".join([
        row("Vehicle", q.get("vehicle_type")),
        row("Date / Time", f"{q.get('pickup_date','')} {q.get('pickup_time','')}".strip()),
        row("Pickup", q.get("pickup_location")),
        row("Drop-off", q.get("dropoff_location")),
        row("Passengers", q.get("passengers")),
        row("Occasion", q.get("occasion")),
    ])

    notes_block = (
        f'<div style="margin:24px 0 0 0;padding:16px 20px;background:rgba(212,175,55,0.06);'
        f'border:1px solid rgba(212,175,55,0.2);border-radius:10px;color:#e8d9a6;'
        f'font-size:13px;line-height:1.7;">{notes}</div>'
    ) if notes else ""

    return f"""<!doctype html>
<html><body style="margin:0;background:#050505;color:#eee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<table cellpadding=0 cellspacing=0 width="100%" style="background:#050505;padding:36px 0;">
  <tr><td align="center">
    <table cellpadding=0 cellspacing=0 width="600" style="background:#0c0c0c;border:1px solid #1c1c1c;border-radius:16px;overflow:hidden;">
      <tr><td style="padding:30px 36px 24px 36px;background:linear-gradient(135deg,#1a1410 0%,#0c0c0c 100%);">
        <div style="color:#D4AF37;font-size:11px;text-transform:uppercase;letter-spacing:.3em;font-weight:600;">TuranEliteLimo</div>
        <div style="color:#fff;font-size:22px;margin-top:14px;font-weight:600;letter-spacing:-0.01em;">Your quote is ready, {(q.get("full_name") or "").split(" ")[0]}</div>
        <div style="color:#aaa;font-size:14px;margin-top:8px;line-height:1.6;">Here are the trip details. Tap the gold button below to confirm and lock in your booking with a {dp_pct:.0f}% deposit.</div>
      </td></tr>

      <tr><td style="padding:24px 36px 8px 36px;">
        <table cellpadding=0 cellspacing=0 width="100%" style="border-collapse:collapse;">{rows}</table>
      </td></tr>

      <tr><td style="padding:8px 36px 0 36px;">
        <table cellpadding=0 cellspacing=0 width="100%" style="border-top:1px solid #1c1c1c;margin-top:10px;">
          <tr><td style="padding:18px 0 6px 0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.18em;">Total · flat rate</td>
              <td style="padding:18px 0 6px 0;text-align:right;color:#D4AF37;font-size:26px;font-weight:600;">${price:,.2f}</td></tr>
          <tr><td style="padding:0 0 4px 0;color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.18em;">Deposit due today</td>
              <td style="padding:0 0 4px 0;text-align:right;color:#fff;font-size:18px;font-weight:600;">${deposit:,.2f}</td></tr>
          <tr><td colspan=2 style="padding:6px 0 0 0;color:#666;font-size:11px;line-height:1.6;">Remaining balance charged the day before service. Gratuity not included.</td></tr>
        </table>
      </td></tr>

      {f'<tr><td style="padding:0 36px;">{notes_block}</td></tr>' if notes else ''}

      <tr><td style="padding:30px 36px 8px 36px;" align="center">
        <a href="{confirm_url}" style="display:inline-block;padding:16px 38px;background:#D4AF37;color:#0a0a0a;text-decoration:none;border-radius:999px;font-weight:700;font-size:14px;letter-spacing:0.02em;">
          ✓ Confirm &amp; Pay ${deposit:,.0f} Deposit →
        </a>
        <div style="color:#666;font-size:11px;margin-top:14px;line-height:1.6;">Secure payment via Stripe · Or call us at (650) 410-0687</div>
      </td></tr>

      <tr><td style="padding:24px 36px 30px 36px;color:#555;font-size:11px;line-height:1.7;text-align:center;border-top:1px solid #1c1c1c;margin-top:18px;">
        Free cancellation up to 7 days before service · 50% fee inside 7 days · Non-refundable inside 48 hrs.<br>
        This quote is valid for 48 hours. After that, prices and availability may change.
      </td></tr>
    </table>
    <div style="color:#444;font-size:10px;margin-top:18px;">TuranEliteLimo · Bay Area · (650) 410-0687 · turanelitelimo.com</div>
  </td></tr>
</table>
</body></html>"""


# ---------- Public quote-offer endpoints (no auth, signed token) ----------

@router.get("/quote-offer/{token}")
async def public_get_quote_offer(token: str):
    """Public endpoint — fetches a quote-offer by signed token. Used by the
    /quote/[token] page to render trip details before payment."""
    if not token or len(token) < 16:
        raise HTTPException(status_code=404, detail="Invalid link")
    q = await db.quote_requests.find_one({"confirm_token": token}, {"_id": 0})
    if not q or not q.get("quoted_price"):
        raise HTTPException(status_code=404, detail="Quote not found or expired")
    if q.get("confirmed_at") and q.get("booking_id"):
        return {
            "already_confirmed": True,
            "booking_id": q["booking_id"],
            "vehicle_type": q["vehicle_type"],
            "full_name": q.get("full_name"),
            "quoted_price": q.get("quoted_price"),
        }
    price = float(q.get("quoted_price") or 0)
    dp_pct = float(q.get("deposit_pct") or 50)
    deposit = round(price * dp_pct / 100.0, 2)
    return {
        "id": q["id"],
        "full_name": q.get("full_name"),
        "vehicle_type": q.get("vehicle_type"),
        "pickup_date": q.get("pickup_date"),
        "pickup_time": q.get("pickup_time"),
        "pickup_location": q.get("pickup_location"),
        "dropoff_location": q.get("dropoff_location"),
        "passengers": q.get("passengers"),
        "occasion": q.get("occasion"),
        "quoted_price": price,
        "deposit_pct": dp_pct,
        "deposit_amount": deposit,
        "quoted_notes": q.get("quoted_notes"),
        "quoted_at": q.get("quoted_at"),
    }


@router.post("/quote-offer/{token}/checkout")
async def public_quote_offer_checkout(token: str, payload: dict, request: Request):
    """Creates a Stripe Checkout session for the deposit. Returns the URL."""
    q = await db.quote_requests.find_one({"confirm_token": token}, {"_id": 0})
    if not q or not q.get("quoted_price"):
        raise HTTPException(status_code=404, detail="Quote not found")
    if q.get("confirmed_at"):
        raise HTTPException(status_code=400, detail="This quote has already been confirmed.")

    price = float(q["quoted_price"])
    dp_pct = float(q.get("deposit_pct") or 50)
    deposit = round(price * dp_pct / 100.0, 2)
    if deposit < 0.5:
        raise HTTPException(status_code=400, detail="Deposit amount too small.")

    # ---- Optional phone-verify gating ----
    s = await _load_settings()
    threshold = float(getattr(s, "safety_phone_verify_threshold", 0) or 0)
    if getattr(s, "safety_phone_verify_required", False) and price >= threshold:
        phone = q.get("phone") or ""
        if not phone:
            raise HTTPException(status_code=400, detail="Phone number required for verification.")
        if not await safety.is_phone_verified(db, phone, purpose="quote_confirm"):
            raise HTTPException(
                status_code=428,
                detail="phone_verify_required",
            )

    origin = (payload or {}).get("origin_url") or _frontend_origin_from_request(request)
    origin = origin.rstrip("/")
    success_url = f"{origin}/quote/{token}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/quote/{token}"

    # ---- Consent capture (REQUIRED for off-session future charges) ----
    consent_accepted = bool((payload or {}).get("consent_accepted"))
    if not consent_accepted:
        raise HTTPException(
            status_code=400,
            detail="Please accept the card-on-file authorization to continue.",
        )

    # We create the Stripe Checkout session via direct REST (the
    # emergentintegrations wrapper doesn't expose
    # `payment_intent_data[setup_future_usage]`). Saving the card here lets
    # the admin charge for the day-before balance, wait time, damages, or
    # extra stops without sending a new invoice — consistent with the main
    # booking flow at routes/payments.py:create_payment_checkout.
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Payment system not configured.")
    deposit_cents = int(round(deposit * 100))
    customer_email = q.get("email") or ""
    product_name = f"TuranEliteLimo — {q.get('vehicle_type', 'Quote')} deposit"
    form_pairs = [
        ("mode", "payment"),
        ("success_url", success_url),
        ("cancel_url", cancel_url),
        ("payment_method_types[]", "card"),
        ("customer_creation", "always"),
        ("line_items[0][quantity]", "1"),
        ("line_items[0][price_data][currency]", "usd"),
        ("line_items[0][price_data][unit_amount]", str(deposit_cents)),
        ("line_items[0][price_data][product_data][name]", product_name),
        ("payment_intent_data[setup_future_usage]", "off_session"),
        ("payment_intent_data[metadata][quote_request_id]", q["id"]),
        ("payment_intent_data[metadata][confirm_token]", token),
        ("payment_intent_data[metadata][kind]", "quote_offer_deposit"),
        ("metadata[quote_request_id]", q["id"]),
        ("metadata[confirm_token]", token),
        ("metadata[kind]", "quote_offer_deposit"),
        ("metadata[customer_name]", q.get("full_name") or ""),
        ("metadata[consent_accepted]", "true"),
    ]
    if customer_email:
        form_pairs.append(("customer_email", customer_email))
        form_pairs.append(("metadata[customer_email]", customer_email))

    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.post(
                "https://api.stripe.com/v1/checkout/sessions",
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/x-www-form-urlencoded",
                },
                content=urlencode(form_pairs).encode("utf-8"),
            )
    except Exception as e:
        logger.error(f"Quote-offer Stripe checkout create network failure: {e}")
        raise HTTPException(status_code=502, detail="Couldn't reach Stripe. Please try again.")
    if r.status_code != 200:
        logger.error(f"Quote-offer Stripe checkout HTTP {r.status_code}: {r.text[:300]}")
        raise HTTPException(status_code=502, detail="Stripe couldn't open checkout. Please contact support.")
    sess_json = r.json()
    session_url = sess_json.get("url")
    session_id_new = sess_json.get("id")
    if not session_url or not session_id_new:
        raise HTTPException(status_code=502, detail="Stripe returned an invalid session.")

    await db.quote_requests.update_one(
        {"id": q["id"]},
        {"$set": {
            "deposit_session_id": session_id_new,
            "deposit_amount_pending": deposit,
            "consent_accepted_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    return {"url": session_url, "session_id": session_id_new, "amount": deposit}


@router.get("/quote-offer/{token}/finalize")
async def public_quote_offer_finalize(token: str, session_id: str, request: Request):
    """Customer returned from Stripe — verify payment, mark quote won,
    auto-create a Booking, and notify admin. Idempotent."""
    q = await db.quote_requests.find_one({"confirm_token": token}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")

    if q.get("confirmed_at") and q.get("booking_id"):
        # Already finalized — return cached state
        return {
            "ok": True,
            "already_confirmed": True,
            "booking_id": q["booking_id"],
        }

    if q.get("deposit_session_id") != session_id:
        raise HTTPException(status_code=400, detail="Session does not match this quote.")

    # Verify with Stripe via direct REST (most reliable; matches the
    # post_trip_confirm_tip pattern already in production).
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        logger.error("Quote-offer finalize: STRIPE_API_KEY missing")
        raise HTTPException(status_code=500, detail="Payment system not configured. Please contact support.")
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(
                f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"expand[]": ["payment_intent.payment_method"]},
            )
    except Exception as e:
        logger.error(f"Quote-offer Stripe lookup failed (network): {e}")
        raise HTTPException(status_code=502, detail="Couldn't reach Stripe. Please refresh in a moment.")
    if r.status_code != 200:
        logger.error(f"Quote-offer Stripe lookup HTTP {r.status_code}: {r.text[:300]}")
        raise HTTPException(status_code=502, detail="Stripe lookup failed. Please contact support.")
    s = r.json()
    paid = s.get("payment_status") == "paid" or s.get("status") == "complete"

    if not paid:
        # Customer hit cancel or payment is still processing — surface a useful state.
        return {"ok": False, "paid": False, "status": s.get("payment_status") or s.get("status")}

    # ---- Extract the saved card (payment_method) + Stripe customer id ----
    # Both are needed to charge the card later for balance, wait time,
    # damages, or extra stops without sending a new invoice.
    stripe_customer_id = s.get("customer") or ""
    stripe_payment_intent_id = ""
    stripe_payment_method_id = ""
    card_brand = ""
    card_last4 = ""
    pi = s.get("payment_intent")
    if isinstance(pi, dict):
        stripe_payment_intent_id = pi.get("id") or ""
        pm = pi.get("payment_method")
        if isinstance(pm, dict):
            stripe_payment_method_id = pm.get("id") or ""
            card = pm.get("card") or {}
            card_brand = card.get("brand") or ""
            card_last4 = card.get("last4") or ""
        elif isinstance(pm, str):
            stripe_payment_method_id = pm
    elif isinstance(pi, str):
        stripe_payment_intent_id = pi

    # Create the booking now. Wrap critical write ops in try/except — if any
    # secondary step fails AFTER the customer already paid, we still want to
    # confirm the payment to them so they don't think it failed.
    now_iso = datetime.now(timezone.utc).isoformat()
    booking_id = str(uuid.uuid4())
    try:
        confirmation_number = await _next_unique_confirmation_number()
    except Exception as e:
        logger.error(f"Quote finalize: confirmation_number generation failed: {e}", exc_info=True)
        confirmation_number = f"Q{booking_id[:8].upper()}"
    manage_token = secrets.token_urlsafe(24)
    deposit_amt = float(q.get("deposit_amount_pending") or 0)
    total_amt = float(q.get("quoted_price") or 0)

    booking_doc = {
        "id": booking_id,
        "confirmation_number": confirmation_number,
        "manage_token": manage_token,
        "name": q.get("full_name") or "",
        "email": q.get("email") or "",
        "phone": q.get("phone") or "",
        "vehicle_type": q.get("vehicle_type"),
        "pickup_location": q.get("pickup_location") or "",
        "dropoff_location": q.get("dropoff_location") or "",
        "pickup_date": q.get("pickup_date") or "",
        "pickup_time": q.get("pickup_time") or "",
        "passengers": q.get("passengers") or 1,
        "occasion": q.get("occasion") or "",
        "notes": q.get("notes") or "",
        "amount": total_amt,
        "deposit_paid": deposit_amt,
        "balance_due": round(total_amt - deposit_amt, 2),
        "currency": "usd",
        "status": "confirmed",
        "payment_status": "deposit_paid",
        "is_read": False,
        "source": "quote_offer",
        "quote_request_id": q["id"],
        "affiliate_id": q.get("affiliate_id"),
        "affiliate_cost": q.get("affiliate_cost"),
        "stripe_session_id": session_id,
        "created_at": now_iso,
        # Safety context — captured at deposit-time (most accurate signal):
        # which IP/UA actually paid, vs. the IP that originally submitted the
        # quote request hours/days earlier.
        "ip_address": safety.get_client_ip(request),
        "user_agent": safety.get_user_agent(request),
        "deposit_ip": safety.get_client_ip(request),
        "risk_score": q.get("risk_score"),
        "risk_band": q.get("risk_band"),
        "risk_flags": q.get("risk_flags") or [],
        "blacklisted": bool(q.get("blacklisted")),
        # ---- Saved-card / off-session charging ----
        # Customer accepted the on-screen authorization in QuoteOfferConfirm
        # before clicking Pay (we re-check on the backend at checkout time).
        # These IDs power admin charge-on-file for balance, wait time,
        # damages, or extra stops — no second invoice needed.
        "stripe_customer_id": stripe_customer_id,
        "stripe_payment_method_id": stripe_payment_method_id,
        "stripe_payment_intent_id": stripe_payment_intent_id,
        "card_brand": card_brand,
        "card_last4": card_last4,
        "wait_time_consent": True,
        "consent_accepted_at": q.get("consent_accepted_at") or now_iso,
        # Preserve first-touch attribution captured on the original quote-form
        # submission (utm_source, utm_campaign, gclid, source_bucket, etc.).
        # Without this, quote-paid bookings never appear in the Google Ads
        # Offline Conversion CSV export because gclid is empty — and that's
        # ~13 of 15 real paid bookings per month for this business.
        "utm": q.get("utm") or {},
    }
    try:
        await db.bookings.insert_one(booking_doc.copy())
    except Exception as e:
        logger.error(f"Quote finalize: bookings.insert_one failed: {e}", exc_info=True)

    # Mark the quote request as won + link the booking (best-effort)
    try:
        await db.quote_requests.update_one(
            {"id": q["id"]},
            {"$set": {
                "status": "won",
                "confirmed_at": now_iso,
                "booking_id": booking_id,
                "confirmation_number": confirmation_number,
                "status_updated_at": now_iso,
            }},
        )
    except Exception as e:
        logger.error(f"Quote finalize: quote_request mark-won failed: {e}", exc_info=True)

    # Notify admin
    try:
        admin_to = sms_service.admin_phone()
        if admin_to:
            sms = (
                f"🎉 QUOTE WON · ${total_amt:.0f}\n"
                f"{q.get('full_name')} · {q.get('vehicle_type')}\n"
                f"Deposit ${deposit_amt:.0f} paid · #{confirmation_number}"
            )
            await sms_service.send_sms(admin_to, sms)
    except Exception as e:
        logger.warning(f"Quote-won admin SMS failed: {e}")

    # Admin email — sent regardless of Twilio A2P status so the operator
    # always knows a customer paid (e.g., Adam discovered post-pay he had
    # no in-app signal beyond a small "Confirmed →" line). We pack the
    # essentials in the subject so the inbox preview is enough to act.
    try:
        from email_service import SUPPORT_EMAIL
        admin_email = SUPPORT_EMAIL or "support@turanelitelimo.com"
        pickup_when = f"{q.get('pickup_date','')} {q.get('pickup_time','')}".strip()
        admin_subject = (
            f"💰 PAID · ${total_amt:.0f} · {q.get('full_name','?')} · "
            f"{q.get('vehicle_type','?')} · #{confirmation_number}"
        )
        admin_html = f"""
        <div style="font-family:-apple-system,Segoe UI,sans-serif;color:#111;line-height:1.55;max-width:560px;">
          <h2 style="color:#0a7a3f;margin:0 0 14px 0;">💰 Customer paid deposit</h2>
          <table cellpadding="6" style="font-size:14px;border-collapse:collapse;width:100%;">
            <tr><td style="color:#666;">Customer</td><td><strong>{q.get('full_name','?')}</strong> · {q.get('phone','')} · {q.get('email','')}</td></tr>
            <tr><td style="color:#666;">Vehicle</td><td>{q.get('vehicle_type','?')}</td></tr>
            <tr><td style="color:#666;">Trip</td><td>{pickup_when} · {q.get('pickup_location','')} → {q.get('dropoff_location','')}</td></tr>
            <tr><td style="color:#666;">Total quoted</td><td>${total_amt:,.2f}</td></tr>
            <tr><td style="color:#666;">Deposit PAID</td><td><strong style="color:#0a7a3f;">${deposit_amt:,.2f}</strong></td></tr>
            <tr><td style="color:#666;">Balance</td><td>${(total_amt - deposit_amt):,.2f} (charged day-before)</td></tr>
            <tr><td style="color:#666;">Confirmation #</td><td><strong>#{confirmation_number}</strong></td></tr>
            <tr><td style="color:#666;">Saved card</td><td>{card_brand or '?'} ····{card_last4 or '????'}</td></tr>
          </table>
          <p style="margin-top:18px;font-size:13px;color:#444;">
            📎 <strong>Attached:</strong> PII-stripped affiliate dispatch PDF, ready to forward to your operator.
            Just hit Forward → type the affiliate's email → send. Or open admin → <strong>Quote Requests</strong> tab
            → "Edit trip details" if you need to change pickup time / stops first, then re-generate from the row.
          </p>
        </div>
        """
        # Auto-attach the PII-stripped affiliate dispatch PDF so the operator
        # can wake up, hit Forward on this email, drop in the affiliate's
        # address, and have the whole handoff done in 15 seconds. If the trip
        # has planned stops we assume the operator wants the full-itinerary
        # variant (address-visible) since paid multi-stop trips are exactly
        # when affiliates need pre-briefed on the route.
        admin_attachments = []
        try:
            from pdf_service import generate_dispatch_pdf as _gen_dispatch_pdf
            has_stops = bool([s for s in (q.get("stops") or []) if s])
            dispatch_bytes = _gen_dispatch_pdf(
                q,
                affiliate_name="",       # operator stamps this before forwarding
                affiliate_rate=None,     # operator stamps rate before forwarding
                extra_notes="",          # operator adds trip-specific notes
                include_full_itinerary=has_stops,
            )
            dispatch_filename = f"TEL-DISPATCH-{(q.get('id') or '')[:8].upper()}.pdf"
            admin_attachments.append({
                "filename": dispatch_filename,
                "content": dispatch_bytes,
            })
        except Exception as pdf_err:
            logger.warning(f"Dispatch PDF auto-attach failed: {pdf_err}")

        await send_email(
            to=admin_email,
            subject=admin_subject,
            html=admin_html,
            reply_to=q.get("email") or None,
            attachments=admin_attachments or None,
        )
    except Exception as e:
        logger.warning(f"Quote-won admin EMAIL failed: {e}")

    # Customer confirmation email — simple inline
    try:
        if q.get("email"):
            balance = round(total_amt - deposit_amt, 2)
            customer_html = f"""<!doctype html>
<html><body style="margin:0;background:#050505;color:#eee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;">
<table width="100%" cellpadding=0 cellspacing=0 style="padding:36px 0;background:#050505;">
  <tr><td align="center"><table width="600" cellpadding=0 cellspacing=0 style="background:#0c0c0c;border:1px solid #1c1c1c;border-radius:16px;overflow:hidden;">
    <tr><td style="padding:34px 36px;background:linear-gradient(135deg,#1a3a1f 0%,#0c0c0c 100%);">
      <div style="color:#a3e6b3;font-size:11px;text-transform:uppercase;letter-spacing:.3em;font-weight:600;">Booking confirmed</div>
      <div style="color:#fff;font-size:24px;margin-top:14px;font-weight:600;">Thank you, {(q.get("full_name") or "").split(" ")[0]} — you're booked.</div>
      <div style="color:#aaa;font-size:14px;margin-top:10px;">Confirmation #{confirmation_number}</div>
    </td></tr>
    <tr><td style="padding:24px 36px;">
      <div style="color:#888;font-size:11px;text-transform:uppercase;letter-spacing:.18em;">Trip</div>
      <div style="color:#fff;font-size:14px;line-height:1.8;margin-top:8px;">
        {q.get("vehicle_type") or ""}<br>
        {q.get("pickup_date") or ""} {q.get("pickup_time") or ""}<br>
        From: {q.get("pickup_location") or "—"}<br>
        To: {q.get("dropoff_location") or "—"}
      </div>
      <div style="margin-top:24px;padding-top:18px;border-top:1px solid #1c1c1c;">
        <table width="100%"><tr><td style="color:#888;font-size:12px;">Total</td><td align="right" style="color:#fff;font-size:14px;">${total_amt:,.2f}</td></tr>
        <tr><td style="color:#888;font-size:12px;padding-top:4px;">Deposit paid</td><td align="right" style="color:#86efac;font-size:14px;padding-top:4px;">${deposit_amt:,.2f}</td></tr>
        <tr><td style="color:#888;font-size:12px;padding-top:4px;">Balance due day-before</td><td align="right" style="color:#fff;font-size:14px;padding-top:4px;">${balance:,.2f}</td></tr></table>
      </div>
    </td></tr>
    <tr><td style="padding:6px 36px 30px 36px;color:#666;font-size:11px;line-height:1.7;border-top:1px solid #1c1c1c;">
      Questions? Call (650) 410-0687 or reply to this email.
    </td></tr>
  </table></td></tr></table></body></html>"""
            await send_email(
                to=q["email"],
                subject=f"Booking confirmed · #{confirmation_number}",
                html=customer_html,
            )
    except Exception as e:
        logger.warning(f"Quote-confirmation customer email failed: {e}")

    return {
        "ok": True,
        "paid": True,
        "booking_id": booking_id,
        "confirmation_number": confirmation_number,
        "manage_token": manage_token,
        "amount_paid": deposit_amt,
        "total": total_amt,
    }


@router.delete("/admin/quote-requests/{rid}")
async def admin_delete_quote_request(rid: str, _: dict = Depends(require_admin)):
    r = await db.quote_requests.delete_one({"id": rid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


# ---------------------------------------------------------------------------
# PDF downloads — branded customer invoice + PII-stripped affiliate dispatch.
# Both use shared generators in /app/backend/pdf_service.py so layout stays
# consistent whether the PDF is auto-attached to an email (invoice) or pulled
# down via this endpoint (dispatch).
# ---------------------------------------------------------------------------
@router.get("/admin/quote-requests/{rid}/invoice-pdf")
async def admin_invoice_pdf(rid: str, _: dict = Depends(require_admin)):
    """Download the customer-facing invoice PDF for preview / manual resend.
    Same content as the auto-attached PDF on send-quote, so the operator can
    sanity-check before pulling the trigger."""
    q = await db.quote_requests.find_one({"id": rid}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Not found")
    from pdf_service import generate_invoice_pdf
    pdf_bytes = generate_invoice_pdf(
        q,
        custom_notes=q.get("invoice_notes") or "",
        deposit_pct=float(q.get("deposit_pct") or 25),
    )
    inv_id = f"TEL-{(q.get('id') or '')[:8].upper()}"
    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="TuranEliteLimo-Invoice-{inv_id}.pdf"',
        },
    )


@router.get("/admin/quote-requests/{rid}/dispatch-pdf")
async def admin_dispatch_pdf(
    rid: str,
    affiliate_name: str = "",
    affiliate_rate: Optional[float] = None,
    extra_notes: str = "",
    include_full_itinerary: bool = False,
    _: dict = Depends(require_admin),
):
    """Download the PII-stripped affiliate dispatch sheet. Optional query
    params let the operator stamp the affiliate name + agreed rate + custom
    instructions onto the PDF without persisting them on the quote record.

    `include_full_itinerary=true` prints the actual pickup/drop-off addresses
    and stop list — use only when the trip has a known multi-stop itinerary
    the affiliate needs ahead of time (e.g. paid wine-country day trips)."""
    q = await db.quote_requests.find_one({"id": rid}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Not found")
    from pdf_service import generate_dispatch_pdf
    pdf_bytes = generate_dispatch_pdf(
        q,
        affiliate_name=affiliate_name or "",
        affiliate_rate=affiliate_rate,
        extra_notes=extra_notes or "",
        include_full_itinerary=bool(include_full_itinerary),
    )
    dispatch_id = f"TEL-DISPATCH-{(q.get('id') or '')[:8].upper()}"
    from fastapi.responses import Response
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{dispatch_id}.pdf"',
        },
    )


@router.post("/admin/quote-requests/{rid}/dispatch-pdf/email")
async def admin_email_dispatch_pdf(
    rid: str,
    payload: dict,
    _: dict = Depends(require_admin),
):
    """Generate the PII-stripped affiliate dispatch PDF and email it.

    Body:
        affiliate_email     str   required - recipient email
        affiliate_name      str   optional - stamped on PDF
        affiliate_rate      float optional - stamped on PDF
        extra_notes         str   optional - stamped on PDF
        cc_admin            bool  optional - BCC support@ for our records (default True)

    Saves the operator from downloading the PDF + manually composing an email
    every time they hand off a trip. Reuses the same PDF generator as the
    download endpoint so the affiliate sees the exact same sheet.
    """
    affiliate_email = (payload or {}).get("affiliate_email", "").strip().lower()
    if not affiliate_email or "@" not in affiliate_email:
        raise HTTPException(status_code=400, detail="affiliate_email is required.")
    affiliate_name = ((payload or {}).get("affiliate_name") or "").strip()
    extra_notes = ((payload or {}).get("extra_notes") or "").strip()
    cc_admin = (payload or {}).get("cc_admin", True)
    try:
        affiliate_rate = float((payload or {}).get("affiliate_rate")) if (payload or {}).get("affiliate_rate") else None
    except (TypeError, ValueError):
        affiliate_rate = None

    q = await db.quote_requests.find_one({"id": rid}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote request not found.")

    from pdf_service import generate_dispatch_pdf
    from email_service import _format_time_12h
    pdf_bytes = generate_dispatch_pdf(
        q,
        affiliate_name=affiliate_name,
        affiliate_rate=affiliate_rate,
        extra_notes=extra_notes,
        include_full_itinerary=bool((payload or {}).get("include_full_itinerary", False)),
    )
    dispatch_id = f"TEL-DISPATCH-{(q.get('id') or '')[:8].upper()}"

    # Plain, ops-friendly HTML — no marketing chrome. The PDF carries the brand.
    customer_first = (q.get("full_name") or "").strip().split(" ")[0] or "Guest"
    pickup_date = q.get("pickup_date") or "TBD"
    pickup_time = q.get("pickup_time") or ""
    vehicle = q.get("vehicle_type") or ""
    greeting = f"Hi{(' ' + affiliate_name) if affiliate_name else ''},"
    rate_line = f"<p style=\"margin:0 0 8px 0;\">Agreed net rate: <strong>${affiliate_rate:,.0f}</strong></p>" if affiliate_rate else ""
    html = f"""
    <div style="font-family: -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif; color:#222; line-height:1.55;">
      <p>{greeting}</p>
      <p style="margin:0 0 12px 0;">Confirming a {vehicle} job for {pickup_date}{(' at ' + _format_time_12h(pickup_time)) if pickup_time else ''}.
      Lead pax: <strong>{customer_first}</strong>. Full dispatch sheet attached (PII-stripped per our policy).</p>
      {rate_line}
      <p style="margin:0 0 12px 0;">Please confirm receipt and that the vehicle is locked. Reply to this email with any
      questions or driver contact, and we'll loop you back.</p>
      <p style="margin-top:18px;">Thanks,<br/>Adam · Turan Elite Limo · (650) 410-0687</p>
    </div>
    """

    bcc = ["support@turanelitelimo.com"] if cc_admin else None
    msg_id = await send_email(
        to=affiliate_email,
        subject=f"Dispatch: {vehicle} · {pickup_date} · {dispatch_id}",
        html=html,
        bcc=bcc,
        reply_to="support@turanelitelimo.com",
        attachments=[{"filename": f"{dispatch_id}.pdf", "content": pdf_bytes}],
    )

    if not msg_id:
        raise HTTPException(status_code=502, detail="Email send failed — check Resend logs.")

    # Audit log on the quote so we have an operational trail of who got dispatched
    await db.quote_requests.update_one(
        {"id": rid},
        {"$push": {"dispatch_emails": {
            "to": affiliate_email,
            "name": affiliate_name,
            "rate": affiliate_rate,
            "message_id": msg_id,
            "sent_at": datetime.now(timezone.utc).isoformat(),
        }}},
    )

    return {"ok": True, "sent_to": affiliate_email, "message_id": msg_id, "dispatch_id": dispatch_id}


@router.get("/admin/promos", response_model=List[Promo])
async def admin_list_promos(_: dict = Depends(require_admin)):
    rows = await db.promos.find({}, {"_id": 0}).sort("created_at", -1).to_list(500)
    out = []
    for r in rows:
        try:
            # Backfill defaults for older docs that may be missing optional/required fields
            r.setdefault("uses", 0)
            r.setdefault("total_discount_given", 0.0)
            r.setdefault("first_ride_only", False)
            r.setdefault("active", True)
            r.setdefault("show_on_banner", False)
            r.setdefault("min_ride_amount", 0.0)
            r.setdefault("allowed_vehicle_types", [])
            if not r.get("id"):
                r["id"] = str(uuid.uuid4())
            if not r.get("created_at"):
                r["created_at"] = datetime.now(timezone.utc).isoformat()
            out.append(Promo(**r))
        except Exception as e:
            logger.warning(f"admin_list_promos: skipping malformed promo code={r.get('code','?')}: {e}")
            continue
    return out


@router.post("/admin/promos", response_model=Promo)
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


@router.patch("/admin/promos/{promo_id}", response_model=Promo)
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


@router.delete("/admin/promos/{promo_id}")
async def admin_delete_promo(promo_id: str, _: dict = Depends(require_admin)):
    r = await db.promos.delete_one({"id": promo_id})
    if r.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Promo not found")
    return {"deleted": True}


@router.post("/admin/login", response_model=LoginChallengeResponse)
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


@router.post("/admin/verify-2fa", response_model=LoginResponse)
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


@router.get("/admin/me")
async def admin_me(payload: dict = Depends(require_admin)):
    return {"email": payload.get('sub'), "role": payload.get('role')}


@router.get("/admin/account", response_model=AccountInfo)
async def get_admin_account(payload: dict = Depends(require_admin)):
    user = await db.admin_users.find_one({"email": payload.get('sub')}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    return AccountInfo(
        email=user["email"],
        recovery_email=user.get("recovery_email") or user["email"],
    )


@router.patch("/admin/account", response_model=AccountInfo)
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


@router.get("/admin/settings", response_model=Settings)
async def get_settings(_: dict = Depends(require_admin)):
    return await _load_settings()


@router.patch("/admin/settings", response_model=Settings)
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


@router.get("/admin/bookings", response_model=List[Booking])
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


@router.patch("/admin/bookings/{booking_id}", response_model=Booking)
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


@router.delete("/admin/bookings/{booking_id}")
async def delete_booking(booking_id: str, _: dict = Depends(require_admin)):
    res = await db.bookings.delete_one({"id": booking_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Booking not found")
    return {"deleted": True}


@router.post("/admin/quick-quote", response_model=QuickQuoteResponse)
async def admin_quick_quote(
    payload: QuickQuoteRequest,
    _: dict = Depends(require_admin),
):
    # Pull pickup_date (YYYY-MM-DD) from the ISO datetime for surge-event matching
    pickup_date_only = (payload.pickup_datetime or "")[:10]

    # Re-use the public pricing engine — guarantees parity with website quotes
    base_quote = await quote_ride(QuoteRequest(
        pickup_location=payload.pickup_location,
        dropoff_location=payload.dropoff_location,
        service_type=payload.service_type or "A to B Transfer",
        hours=payload.hours,
        pickup_date=pickup_date_only or None,
        meet_and_greet=False,
        additional_stops_count=0,
        additional_stops=[],
    ))

    mult, label = await _last_minute_multiplier(payload.pickup_datetime)

    out_quotes: List[QuickQuoteVehicle] = []
    for q in base_quote.quotes:
        if q.price is None:
            out_quotes.append(QuickQuoteVehicle(
                vehicle_type=q.vehicle_type,
                base_price=None,
                suggested_price=None,
                formatted_suggested=None,
                message=q.message or "Call for quote",
            ))
            continue
        suggested = round(float(q.price) * mult, 2)
        out_quotes.append(QuickQuoteVehicle(
            vehicle_type=q.vehicle_type,
            base_price=float(q.price),
            suggested_price=suggested,
            formatted_suggested=f"${suggested:,.0f}",
            message=None,
        ))

    return QuickQuoteResponse(
        lead_time_multiplier=mult,
        lead_time_label=label,
        surge_info=base_quote.surge_applied,
        quotes=out_quotes,
    )


@router.post("/admin/invoices", response_model=CustomInvoice)
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

    # Create the Stripe checkout link.
    # IMPORTANT: use PUBLIC_SITE_URL env var, NOT request.base_url. When the
    # Kubernetes ingress strips X-Forwarded-Host, base_url falls back to the
    # internal cluster hostname (`*.deploy.emergentcf.cloud`) which then 403s
    # when Stripe redirects the customer post-payment.
    base = os.environ.get("PUBLIC_SITE_URL", str(request.base_url)).rstrip("/")
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


@router.get("/admin/invoices", response_model=List[CustomInvoice])
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


@router.get("/admin/invoices/{invoice_id}", response_model=CustomInvoice)
async def admin_get_invoice(invoice_id: str, _: dict = Depends(require_admin)):
    d = await db.custom_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return CustomInvoice(**d)


@router.post("/admin/invoices/{invoice_id}/cancel")
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


@router.post("/admin/invoices/{invoice_id}/resend")
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


@router.post("/admin/bookings/backfill-cancellation-source")
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


@router.get("/admin/pricing", response_model=List[PricingRow])
async def list_pricing(_: dict = Depends(require_admin)):
    cursor = db.pricing_config.find({}, {"_id": 0})
    rows = await cursor.to_list(50)
    by_vt = {r["vehicle_type"]: r for r in rows}
    # Maintain canonical order matching VEHICLE_TYPES
    ordered = [by_vt[v] for v in VEHICLE_TYPES if v in by_vt]
    return [PricingRow(**r) for r in ordered]


@router.patch("/admin/pricing/{vehicle_type}", response_model=PricingRow)
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


@router.get("/admin/zones", response_model=List[ZoneRow])
async def list_zones(_: dict = Depends(require_admin)):
    rows = await _load_zones()
    rows.sort(key=lambda z: z.get("name", "").lower())
    return [ZoneRow(**r) for r in rows]


@router.post("/admin/zones", response_model=ZoneRow)
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


@router.patch("/admin/zones/{zone_id}", response_model=ZoneRow)
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


@router.delete("/admin/zones/{zone_id}")
async def delete_zone(zone_id: str, _: dict = Depends(require_admin)):
    res = await db.zone_surcharges.delete_one({"id": zone_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Zone not found")
    return {"ok": True}


@router.get("/admin/surge-events", response_model=List[SurgeEventRow])
async def list_surge_events(_: dict = Depends(require_admin)):
    rows = await _load_surge_events()
    rows.sort(key=lambda e: (e.get("start_date") or "", e.get("name", "").lower()))
    return [SurgeEventRow(**r) for r in rows]


@router.post("/admin/surge-events", response_model=SurgeEventRow)
async def create_surge_event(payload: SurgeEventCreate, _: dict = Depends(require_admin)):
    _validate_date_range(payload.start_date, payload.end_date)
    doc = payload.model_dump()
    doc["name"] = payload.name.strip()
    doc["id"] = str(uuid.uuid4())
    doc["created_at"] = datetime.now(timezone.utc).isoformat()
    doc["updated_at"] = doc["created_at"]
    await db.surge_events.insert_one(doc.copy())
    return SurgeEventRow(**doc)


@router.patch("/admin/surge-events/{event_id}", response_model=SurgeEventRow)
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


@router.delete("/admin/surge-events/{event_id}")
async def delete_surge_event(event_id: str, _: dict = Depends(require_admin)):
    res = await db.surge_events.delete_one({"id": event_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Surge event not found")
    return {"ok": True}


@router.get("/admin/contacts", response_model=List[ContactInquiry])
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


@router.patch("/admin/contacts/{contact_id}")
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


@router.delete("/admin/contacts/{contact_id}")
async def delete_contact(contact_id: str, _: dict = Depends(require_admin)):
    res = await db.contacts.delete_one({"id": contact_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Inquiry not found")
    return {"deleted": True}


@router.get("/admin/stats")
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


@router.get("/admin/riders")
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


@router.post("/admin/riders/{rider_id}/send-password-reset")
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


@router.post("/admin/drivers/{driver_id}/clear-password")
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


@router.post("/admin/drivers/{driver_id}/invite")
async def admin_invite_driver(driver_id: str, _: dict = Depends(require_admin)):
    """Email a driver an onboarding invite with:

      • App download links (iOS + Android)
      • A one-time 'Set your password' link (7-day expiry) so they don't have
        to reset on first launch
      • Phone-number reminder + support contact

    Tracks `last_invited_at` and `invite_count` on the driver document so the
    Admin UI can show "Invited 2 days ago · 3 times" next to each row.

    Reuses the existing `password_reset_tokens` collection — same shape as
    forgot-password, but the email copy is welcome-flavored instead of reset.
    """
    d = await db.drivers.find_one({"id": driver_id}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")

    email = (d.get("email") or "").strip().lower()
    if not email or "@" not in email:
        raise HTTPException(
            status_code=400,
            detail="Driver has no email on file. Edit the driver and add an email first.",
        )

    # Issue a 7-day setup token. Identical shape to the forgot-password
    # token so /driver-auth/reset-password handles it transparently.
    import secrets
    token = secrets.token_urlsafe(32)
    expires = (datetime.now(timezone.utc) + timedelta(days=7)).isoformat()
    await db.password_reset_tokens.insert_one({
        "token": token,
        "driver_id": d["id"],
        "role": "driver",
        "email": email,
        "expires_at": expires,
        "used": False,
        "kind": "invite",  # distinguishes invite from forgot-password in logs
        "created_at": datetime.now(timezone.utc).isoformat(),
    })

    setup_url = f"{SITE_BASE_URL}/driver-reset-password?token={token}"
    ios_url = "https://apps.apple.com/us/app/turanelitelimo/id6749083122"
    android_url = (
        "https://play.google.com/store/apps/details?id=com.turanelitelimo.app"
    )

    sent = False
    try:
        from email_service import send_email
        first_name = (d.get("name") or "there").split(" ")[0]
        html = f"""
        <div style="background:#050505;padding:40px 20px;font-family:Helvetica,Arial,sans-serif;color:#fff;">
          <div style="max-width:560px;margin:0 auto;background:#0e0e0e;border:1px solid rgba(212,175,55,0.2);border-radius:16px;padding:32px;">
            <div style="text-align:center;margin-bottom:24px;">
              <img src="{SITE_BASE_URL}/logo-mark.png" alt="TuranEliteLimo" style="height:60px;">
            </div>
            <p style="color:#D4AF37;font-size:11px;letter-spacing:0.3em;text-transform:uppercase;margin:0 0 12px;">Welcome aboard</p>
            <h1 style="color:#fff;font-size:24px;font-weight:300;margin:0 0 14px;line-height:1.25;">Hi {first_name} — you're on the team.</h1>
            <p style="color:rgba(255,255,255,0.7);font-size:14px;line-height:1.65;margin:0 0 22px;">
              We added you as a chauffeur on TuranEliteLimo. Two quick steps to get started:
            </p>

            <div style="background:rgba(212,175,55,0.06);border:1px solid rgba(212,175,55,0.25);border-radius:12px;padding:18px;margin-bottom:18px;">
              <p style="color:#D4AF37;font-size:12px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 8px;">Step 1 · Set your password</p>
              <p style="color:rgba(255,255,255,0.75);font-size:13px;line-height:1.55;margin:0 0 14px;">
                Pick a password you'll remember. This link expires in 7 days.
              </p>
              <a href="{setup_url}" style="display:inline-block;background:#D4AF37;color:#000;text-decoration:none;padding:12px 24px;border-radius:999px;font-weight:600;font-size:13px;">
                Set my password →
              </a>
            </div>

            <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:12px;padding:18px;margin-bottom:22px;">
              <p style="color:rgba(255,255,255,0.85);font-size:12px;letter-spacing:0.15em;text-transform:uppercase;margin:0 0 8px;">Step 2 · Download the driver app</p>
              <p style="color:rgba(255,255,255,0.6);font-size:13px;line-height:1.55;margin:0 0 14px;">
                Sign in with the email <span style="color:#D4AF37;">{email}</span> and the password you just set.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
                <tr>
                  <td style="padding-right:10px;">
                    <a href="{ios_url}" style="display:inline-block;background:#fff;color:#000;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:12px;font-weight:600;">iOS App Store</a>
                  </td>
                  <td>
                    <a href="{android_url}" style="display:inline-block;background:#fff;color:#000;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:12px;font-weight:600;">Google Play</a>
                  </td>
                </tr>
              </table>
            </div>

            <p style="color:rgba(255,255,255,0.55);font-size:12px;line-height:1.6;margin:0 0 6px;">
              Once signed in you'll see assigned trips with pickup/drop-off, live navigation, and one-tap status updates (En Route → Arrived → Trip Started → Completed).
            </p>
            <p style="color:rgba(255,255,255,0.45);font-size:12px;line-height:1.6;margin:0 0 22px;">
              Questions? Reply to this email or text dispatch at <span style="color:#D4AF37;">(650) 410-0687</span>.
            </p>

            <p style="color:rgba(255,255,255,0.3);font-size:11px;line-height:1.5;margin-top:24px;border-top:1px solid rgba(255,255,255,0.08);padding-top:16px;">
              TuranEliteLimo · Bay Area &amp; Northern California
            </p>
          </div>
        </div>
        """
        # send_email returns the Resend message id on success, None on failure
        # (it swallows Resend exceptions). Check the return value instead of
        # relying on raise-on-failure semantics so we don't break other callers.
        result = await send_email(
            to=email,
            subject="Welcome to TuranEliteLimo — set your driver password",
            html=html,
        )
        sent = bool(result)
    except Exception as e:
        logger.error(f"Driver invite email send failed for {email}: {e}")
        # Don't 500 — let the admin see the token URL so they can hand-deliver

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.drivers.update_one(
        {"id": driver_id},
        {
            "$set": {"last_invited_at": now_iso},
            "$inc": {"invite_count": 1},
        },
    )

    return {
        "ok": True,
        "sent": sent,
        "email": email,
        "expires_at": expires,
        # Manual fallback so admin can copy/paste if email bounced
        "setup_url_if_email_failed": setup_url if not sent else None,
        "message": (
            f"Invite emailed to {email}. Link expires in 7 days."
            if sent
            else f"Could not email {email}. Copy the setup URL and send it manually."
        ),
    }


@router.post("/admin/bookings/sync-completed")
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


@router.get("/admin/drivers/live")
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


@router.post("/admin/bookings/assign-driver")
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


# =====================================================================
# Safety / Anti-Fraud admin endpoints (Phase 1-3)
# =====================================================================


@router.get("/admin/safety/blacklist")
async def admin_list_blacklist(_: dict = Depends(require_admin)):
    """Internal scam blacklist — emails, phones, IPs, names."""
    items = []
    async for e in db.scam_blacklist.find({}, {"_id": 0}).sort("created_at", -1).limit(1000):
        items.append(e)
    return items


@router.post("/admin/safety/blacklist")
async def admin_add_blacklist(payload: dict, claims: dict = Depends(require_admin)):
    kind = (payload.get("kind") or "").lower().strip()
    value = (payload.get("value") or "").strip()
    reason = (payload.get("reason") or "").strip()[:300]
    if kind not in ("email", "phone", "ip", "name"):
        raise HTTPException(status_code=400, detail="kind must be email|phone|ip|name")
    if not value:
        raise HTTPException(status_code=400, detail="value is required")
    entry = {
        "id": str(uuid.uuid4()),
        "kind": kind,
        "value": value,
        "reason": reason,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "added_by": claims.get("email") or claims.get("sub") or "admin",
    }
    await db.scam_blacklist.insert_one(entry.copy())
    entry.pop("_id", None)
    return entry


@router.delete("/admin/safety/blacklist/{entry_id}")
async def admin_delete_blacklist(entry_id: str, _: dict = Depends(require_admin)):
    r = await db.scam_blacklist.delete_one({"id": entry_id})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Not found")
    return {"deleted": True}


@router.get("/admin/safety/review-queue")
async def admin_review_queue(_: dict = Depends(require_admin)):
    """Quotes + bookings that need a human eyeball.
    Includes anything flagged yellow/red OR exceeding the $ review threshold."""
    s = await _load_settings()
    threshold = float(getattr(s, "safety_review_threshold", 0) or 0)

    quotes = []
    qq_query = {"$or": [
        {"risk_band": {"$in": ["yellow", "red"]}},
        {"blacklisted": True},
    ]}
    if threshold > 0:
        qq_query["$or"].append({"quoted_price": {"$gte": threshold}})
    async for q in db.quote_requests.find(qq_query, {"_id": 0}).sort("created_at", -1).limit(200):
        # Skip quotes already cleared
        if q.get("risk_cleared_at"):
            continue
        quotes.append(q)

    bookings = []
    bk_query = {"$or": [
        {"risk_band": {"$in": ["yellow", "red"]}},
        {"blacklisted": True},
    ]}
    if threshold > 0:
        bk_query["$or"].append({"amount": {"$gte": threshold}})
    async for b in db.bookings.find(bk_query, {"_id": 0}).sort("created_at", -1).limit(200):
        if b.get("risk_cleared_at"):
            continue
        bookings.append(b)

    return {"quotes": quotes, "bookings": bookings, "threshold": threshold}


@router.post("/admin/safety/quote-requests/{rid}/clear-risk")
async def admin_clear_quote_risk(rid: str, claims: dict = Depends(require_admin)):
    """Admin reviewed this quote and decided it's safe — remove from queue."""
    r = await db.quote_requests.update_one(
        {"id": rid},
        {"$set": {
            "risk_cleared_at": datetime.now(timezone.utc).isoformat(),
            "risk_cleared_by": claims.get("email") or "admin",
        }},
    )
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Not found")
    return {"cleared": True}


@router.post("/admin/safety/bookings/{booking_id}/clear-risk")
async def admin_clear_booking_risk(booking_id: str, claims: dict = Depends(require_admin)):
    r = await db.bookings.update_one(
        {"id": booking_id},
        {"$set": {
            "risk_cleared_at": datetime.now(timezone.utc).isoformat(),
            "risk_cleared_by": claims.get("email") or "admin",
        }},
    )
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Not found")
    return {"cleared": True}


@router.get("/admin/safety/ip-lookup")
async def admin_ip_lookup(ip: str, _: dict = Depends(require_admin)):
    """Geo-lookup proxy for the admin UI."""
    geo = await safety.lookup_ip_geo(ip, db=db)
    return {"ip": ip, "geo": geo}


@router.post("/admin/safety/risk-check")
async def admin_ad_hoc_risk_check(payload: dict, _: dict = Depends(require_admin)):
    """Score an arbitrary phone/email/name pair against the safety system.

    Used for off-platform leads (Yelp, Google Business Profile, walk-in calls)
    that bypass the public booking form. Reuses the same `score_submission`
    that runs on real quote requests so the results are 1:1 comparable to the
    risk badges shown on `/admin/quote-requests`.

    Payload (all optional, but at least one of phone/email/name is required):
      { phone, email, name, amount, ip, pickup_location, dropoff_location }
    """
    phone = (payload or {}).get("phone", "").strip()
    email = (payload or {}).get("email", "").strip()
    name = (payload or {}).get("name", "").strip()
    if not (phone or email or name):
        raise HTTPException(status_code=400, detail="Provide at least one of phone, email, or name.")
    try:
        amount_raw = (payload or {}).get("amount") or 0
        amount = float(amount_raw) if amount_raw not in ("", None) else 0.0
    except (TypeError, ValueError):
        amount = 0.0
    result = await safety.score_submission(
        db=db,
        full_name=name,
        email=email,
        phone=phone,
        ip=(payload or {}).get("ip", "").strip(),
        user_agent="",
        pickup_location=(payload or {}).get("pickup_location", "").strip(),
        dropoff_location=(payload or {}).get("dropoff_location", "").strip(),
        amount=amount,
    )
    return result


@router.get("/admin/safety/pending-otps")
async def admin_list_pending_otps(_: dict = Depends(require_admin)):
    """MOCK-mode helper: when Twilio Verify isn't configured, admin can see
    the active OTP codes here to read them out to a customer over the phone.
    Once Twilio Verify is wired up, this list will return empty mock entries."""
    cutoff = datetime.now(timezone.utc).isoformat()
    items = []
    async for o in db.phone_verifications.find(
        {"mocked": True, "verified": False, "expires_at": {"$gt": cutoff}},
        {"_id": 0},
    ).sort("created_at", -1).limit(50):
        items.append({
            "phone": o.get("phone"),
            "code": o.get("code"),
            "purpose": o.get("purpose"),
            "expires_at": o.get("expires_at"),
            "attempts": o.get("attempts", 0),
        })
    return items


# ---- Customer-facing OTP endpoints (used by Quote Confirm page) ----


@router.post("/quote-offer/{token}/send-otp")
async def public_quote_offer_send_otp(token: str, request: Request):
    """Public endpoint — sends an OTP code to the phone on file for this quote."""
    q = await db.quote_requests.find_one({"confirm_token": token}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    phone = q.get("phone") or ""
    if not phone:
        raise HTTPException(status_code=400, detail="No phone on file for this quote.")
    res = await safety.send_phone_otp(db, phone, purpose="quote_confirm")
    if not res.get("ok"):
        raise HTTPException(status_code=502, detail="Couldn't send verification code. Please call us.")
    return {
        "ok": True,
        "mocked": res.get("mocked", False),
        "phone_last4": re.sub(r"\D", "", phone)[-4:] if phone else "",
    }


@router.post("/quote-offer/{token}/verify-otp")
async def public_quote_offer_verify_otp(token: str, payload: dict):
    q = await db.quote_requests.find_one({"confirm_token": token}, {"_id": 0})
    if not q:
        raise HTTPException(status_code=404, detail="Quote not found")
    code = (payload or {}).get("code") or ""
    ok = await safety.verify_phone_otp(db, q.get("phone") or "", code, purpose="quote_confirm")
    if not ok:
        raise HTTPException(status_code=400, detail="Invalid or expired code.")
    return {"ok": True}


# ---------- Weekly Performance Digest ----------

@router.get("/admin/weekly-digest/preview")
async def admin_weekly_digest_preview(_: dict = Depends(require_admin)):
    """Return the JSON for the latest 7-day digest WITHOUT sending the email.
    Used by the admin dashboard to render an in-page summary."""
    from weekly_digest import build_weekly_digest_data
    data = await build_weekly_digest_data(db)
    return {"ok": True, "data": data}


@router.post("/admin/weekly-digest/send")
async def admin_weekly_digest_send(_: dict = Depends(require_admin)):
    """Manually trigger the weekly digest email (build + send to SUPPORT_EMAIL).
    Same flow the Monday-morning scheduler uses, exposed so Adel can preview
    on-demand without waiting until Monday."""
    from weekly_digest import send_weekly_digest_now
    result = await send_weekly_digest_now(db)
    return {"ok": True, **result}


# ---------- Attribution / Bookings by Ad Source ----------

@router.get("/admin/attribution/sources")
async def admin_attribution_sources(days: int = 30, _: dict = Depends(require_admin)):
    """Return bookings + revenue grouped by first-touch UTM source bucket over
    the last `days` days. Powers the Admin → Attribution tab.

    For each source we expose: bookings_created, bookings_paid, revenue,
    avg_booking_value, top_campaigns (top 3 utm_campaign values for that
    source). Lets Adel see CPA per ad channel without leaving the dashboard.
    """
    days = max(1, min(int(days or 30), 365))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    bookings = await db.bookings.find(
        {"created_at": {"$gte": cutoff}},
        {"_id": 0},
    ).to_list(length=10000)

    PAID = {"paid", "confirmed", "in_progress", "completed"}

    def _rev(b: dict) -> float:
        # Bookings created via quote-finalize store the total as `amount`
        # (see admin.py:~1461). Legacy checkout paths may use one of the
        # older fields. Check `amount` FIRST — matches the quote-conversions
        # endpoint so both revenue rollups agree.
        for k in ("amount", "total_amount", "amount_paid", "total_price", "price", "quoted_price"):
            v = b.get(k)
            if isinstance(v, (int, float)) and v > 0:
                return float(v)
        return 0.0

    # Aggregate by source_bucket
    by_source: dict[str, dict] = {}
    for b in bookings:
        utm = b.get("utm") or {}
        bucket = (utm.get("source_bucket") or "untracked").lower()
        slot = by_source.setdefault(bucket, {
            "source": bucket,
            "bookings_created": 0,
            "bookings_paid": 0,
            "revenue": 0.0,
            "campaigns": {},
            "sample_landing_paths": set(),
        })
        slot["bookings_created"] += 1
        if (b.get("status") or "").lower() in PAID:
            slot["bookings_paid"] += 1
            slot["revenue"] += _rev(b)
        campaign = (utm.get("utm_campaign") or "(none)").lower()
        slot["campaigns"][campaign] = slot["campaigns"].get(campaign, 0) + 1
        if utm.get("landing_path"):
            slot["sample_landing_paths"].add(utm["landing_path"][:80])

    # Shape for JSON output
    out_sources = []
    for src, agg in by_source.items():
        top_campaigns = sorted(agg["campaigns"].items(), key=lambda x: x[1], reverse=True)[:3]
        avg = (agg["revenue"] / agg["bookings_paid"]) if agg["bookings_paid"] else 0.0
        out_sources.append({
            "source": src,
            "bookings_created": agg["bookings_created"],
            "bookings_paid": agg["bookings_paid"],
            "revenue": round(agg["revenue"], 2),
            "avg_booking_value": round(avg, 2),
            "top_campaigns": [{"campaign": c, "count": n} for c, n in top_campaigns],
            "sample_landing_paths": sorted(list(agg["sample_landing_paths"]))[:5],
        })
    out_sources.sort(key=lambda s: (-s["revenue"], -s["bookings_paid"]))

    total_revenue = sum(s["revenue"] for s in out_sources)
    total_paid = sum(s["bookings_paid"] for s in out_sources)
    total_created = sum(s["bookings_created"] for s in out_sources)
    tracked_paid = sum(s["bookings_paid"] for s in out_sources if s["source"] != "untracked")
    attribution_rate = round(100.0 * tracked_paid / total_paid, 1) if total_paid else 0.0

    return {
        "ok": True,
        "period_days": days,
        "totals": {
            "bookings_created": total_created,
            "bookings_paid": total_paid,
            "revenue": round(total_revenue, 2),
            "attribution_rate": attribution_rate,
        },
        "sources": out_sources,
    }


@router.get("/admin/attribution/blocked-sources")
async def admin_attribution_get_blocked_sources(_: dict = Depends(require_admin)):
    """Return the current list of blocked UTM source buckets. Stored in the
    settings collection under key `blocked_utm_sources`."""
    doc = await db.settings.find_one({"key": "blocked_utm_sources"}) or {}
    return {"ok": True, "blocked": doc.get("value", [])}


@router.post("/admin/attribution/block-source")
async def admin_attribution_block_source(payload: dict, _: dict = Depends(require_admin)):
    """Add or remove a UTM source bucket from the blocklist. Body:
       {"source": "yelp", "blocked": true}  → add to blocklist
       {"source": "yelp", "blocked": false} → remove
    Blocked sources cause the public booking + quote-request endpoints to
    reject the submission with a polite error, so you can pause traffic from
    a specific ad channel without touching the upstream platform."""
    src = (payload or {}).get("source")
    blocked = bool((payload or {}).get("blocked"))
    if not src or not isinstance(src, str):
        raise HTTPException(status_code=400, detail="`source` is required")
    src = src.strip().lower()
    if src in {"untracked", "direct"}:
        # Refuse to block these — they'd block all legitimate non-ad traffic.
        raise HTTPException(status_code=400, detail="Cannot block 'untracked' or 'direct' — that would kill all organic and direct bookings.")

    existing = await db.settings.find_one({"key": "blocked_utm_sources"}) or {}
    current = set(existing.get("value", []))
    if blocked:
        current.add(src)
    else:
        current.discard(src)
    await db.settings.update_one(
        {"key": "blocked_utm_sources"},
        {"$set": {"key": "blocked_utm_sources", "value": sorted(list(current)), "updated_at": datetime.now(timezone.utc).isoformat()}},
        upsert=True,
    )
    return {"ok": True, "blocked": sorted(list(current))}


# ---------- Google Ads Offline Conversion Import (CSV) ----------

@router.get("/admin/ads/offline-conversions.csv")
async def admin_offline_conversions_csv(
    days: int = 30,
    conversion_name: str = "Purchase",
    _: dict = Depends(require_admin),
):
    """Export an Offline Conversion Import CSV for Google Ads.

    Google Ads expects an exact column layout (see
    https://support.google.com/google-ads/answer/2998031). This endpoint
    returns one row per PAID booking in the last `days` days whose
    first-touch attribution captured a `gclid` (i.e. came from a Google Ads
    click).

    Workflow for the admin:
      1. Click "Export Google Ads CSV" in Admin → Attribution every Monday.
      2. Sign in to Google Ads → Tools → Conversions → Uploads → Upload CSV.
      3. Pick "Conversions from clicks", upload the file, confirm preview.

    This is the stopgap until the Google Ads API integration ships and we
    can submit `UploadClickConversionsRequest` directly from the Stripe
    webhook handler.
    """
    days = max(1, min(int(days or 30), 365))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # The first 4 lines of a Google Ads offline-conversion CSV are a fixed
    # header block. After that comes the actual data table.
    tz_id = "America/Los_Angeles"
    import csv
    import io
    from fastapi.responses import StreamingResponse

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(["Parameters:TimeZone=" + tz_id])
    writer.writerow([])
    writer.writerow([
        "Google Click ID",
        "Conversion Name",
        "Conversion Time",
        "Conversion Value",
        "Conversion Currency",
    ])

    PAID = {"paid", "confirmed", "in_progress", "completed"}
    rows_written = 0
    skipped_no_gclid = 0
    skipped_unpaid = 0
    skipped_zero_profit = 0
    rows_value_mode_profit = 0
    rows_value_mode_gross = 0

    async for b in db.bookings.find(
        {"created_at": {"$gte": cutoff}},
        {"_id": 0, "utm": 1, "payment_status": 1, "status": 1, "quote_amount": 1,
         "total_amount": 1, "amount_paid": 1, "stripe_paid_at": 1, "paid_at": 1,
         "created_at": 1, "confirmation_number": 1, "id": 1},
    ):
        status = (b.get("payment_status") or b.get("status") or "").lower()
        if status not in PAID:
            skipped_unpaid += 1
            continue
        utm = b.get("utm") or {}
        gclid = (utm.get("gclid") or "").strip()
        if not gclid:
            skipped_no_gclid += 1
            continue

        # Pick the conversion value. Prefer PROFIT (amount - affiliate_cost)
        # when both are present — that's what Google's ROAS bidding should
        # optimize on for a broker business where a $1500 booking with $1400
        # affiliate cost is worth 10x less than a $1500 booking with $500 cost.
        # Fall back to gross when affiliate_cost is missing (still directionally
        # useful, but flag it in the response headers so CAI can track coverage).
        gross = 0.0
        for k in ("amount", "amount_paid", "total_amount", "quote_amount"):
            v = b.get(k)
            if isinstance(v, (int, float)) and v > 0:
                gross = float(v)
                break
        aff = b.get("affiliate_cost")
        if isinstance(aff, (int, float)) and aff > 0 and gross > 0:
            value = round(gross - float(aff), 2)
            rows_value_mode_profit += 1
            if value <= 0:
                # Zero/negative profit means the trip lost money — don't feed
                # a negative signal to Google, skip the row and count it.
                skipped_zero_profit += 1
                continue
        else:
            value = gross
            rows_value_mode_gross += 1

        # Conversion time: prefer Stripe's paid_at timestamp, else booking
        # created_at. Google requires the format: yyyy-MM-dd HH:mm:ss+/-HH:MM
        ts_raw = b.get("stripe_paid_at") or b.get("paid_at") or b.get("created_at")
        try:
            from dateutil import parser as _dtp  # type: ignore
            dt = _dtp.isoparse(ts_raw) if isinstance(ts_raw, str) else ts_raw
        except Exception:
            try:
                dt = datetime.fromisoformat(str(ts_raw).replace("Z", "+00:00"))
            except Exception:
                dt = datetime.now(timezone.utc)
        # Convert to Pacific to match TimeZone header. Use a naive offset of
        # -08:00 (PST) — Google accepts either fixed offset format.
        try:
            from zoneinfo import ZoneInfo
            dt_local = dt.astimezone(ZoneInfo(tz_id))
        except Exception:
            dt_local = dt
        conv_time = dt_local.strftime("%Y-%m-%d %H:%M:%S%z")
        # Insert ':' into the +HHMM offset: +0800 -> +08:00
        if len(conv_time) >= 5 and (conv_time[-5] in ("+", "-")):
            conv_time = conv_time[:-2] + ":" + conv_time[-2:]

        writer.writerow([
            gclid,
            conversion_name,
            conv_time,
            f"{value:.2f}",
            "USD",
        ])
        rows_written += 1

    buf.seek(0)
    filename = f"google-ads-offline-conversions-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Rows-Written": str(rows_written),
            "X-Skipped-No-Gclid": str(skipped_no_gclid),
            "X-Skipped-Unpaid": str(skipped_unpaid),
            "X-Skipped-Zero-Profit": str(skipped_zero_profit),
            "X-Rows-Value-Profit": str(rows_value_mode_profit),
            "X-Rows-Value-Gross": str(rows_value_mode_gross),
        },
    )


@router.get("/admin/ads/offline-conversions/preview")
async def admin_offline_conversions_preview(
    days: int = 30,
    _: dict = Depends(require_admin),
):
    """Lightweight preview — counts how many rows the CSV would contain so the
    admin sees a "X paid bookings · Y rows · $Z value" line in the UI before
    downloading."""
    days = max(1, min(int(days or 30), 365))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    PAID = {"paid", "confirmed", "in_progress", "completed"}
    rows = 0
    paid_total = 0
    no_gclid = 0
    total_value = 0.0
    total_profit = 0.0
    rows_with_profit = 0

    async for b in db.bookings.find(
        {"created_at": {"$gte": cutoff}},
        {"_id": 0, "utm": 1, "payment_status": 1, "status": 1, "quote_amount": 1,
         "total_amount": 1, "amount_paid": 1, "amount": 1, "affiliate_cost": 1},
    ):
        status = (b.get("payment_status") or b.get("status") or "").lower()
        if status not in PAID:
            continue
        paid_total += 1
        utm = b.get("utm") or {}
        if not (utm.get("gclid") or "").strip():
            no_gclid += 1
            continue
        rows += 1
        gross = 0.0
        for k in ("amount", "amount_paid", "total_amount", "quote_amount"):
            v = b.get(k)
            if isinstance(v, (int, float)) and v > 0:
                gross = float(v)
                break
        total_value += gross
        aff = b.get("affiliate_cost")
        if isinstance(aff, (int, float)) and aff > 0 and gross > 0:
            profit = round(gross - float(aff), 2)
            if profit > 0:
                total_profit += profit
                rows_with_profit += 1

    return {
        "days": days,
        "paid_bookings": paid_total,
        "rows_with_gclid": rows,
        "skipped_no_gclid": no_gclid,
        "total_value": round(total_value, 2),
        "rows_with_profit": rows_with_profit,
        "total_profit": round(total_profit, 2),
    }



@router.post("/admin/ads/offline-conversions/backfill-utm")
async def admin_offline_conversions_backfill_utm(_: dict = Depends(require_admin)):
    """One-shot backfill: for any booking whose utm.gclid is empty, copy the
    utm from its linked quote_request. Handles BOTH linkage directions —
    booking.quote_request_id → quote (forward), AND
    quote.booking_id → booking (reverse) — so bookings created before
    quote_request_id was persisted also get their attribution restored.

    Safe to run multiple times: only touches bookings whose utm.gclid is
    currently empty. Idempotent.
    """
    scanned = 0
    updated = 0
    quote_link_missing = 0
    parent_no_utm = 0

    # --- Pass 1: forward direction — booking.quote_request_id → quote ---
    seen_ids: set[str] = set()
    async for b in db.bookings.find(
        {"quote_request_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "quote_request_id": 1, "utm": 1},
    ):
        scanned += 1
        seen_ids.add(b["id"])
        current_utm = b.get("utm") or {}
        if (current_utm.get("gclid") or "").strip():
            continue

        qr = await db.quote_requests.find_one(
            {"id": b["quote_request_id"]},
            {"_id": 0, "utm": 1},
        )
        if not qr:
            quote_link_missing += 1
            continue
        parent_utm = qr.get("utm") or {}
        if not parent_utm:
            parent_no_utm += 1
            continue

        await db.bookings.update_one(
            {"id": b["id"]},
            {"$set": {"utm": parent_utm}},
        )
        updated += 1

    # --- Pass 2: reverse direction — quote.booking_id → booking (for bookings
    # that never had quote_request_id set). Also opportunistically stamps
    # quote_request_id onto the booking so future iterations use the fast path. ---
    async for q in db.quote_requests.find(
        {"booking_id": {"$exists": True, "$ne": None}, "utm.gclid": {"$exists": True, "$ne": ""}},
        {"_id": 0, "id": 1, "booking_id": 1, "utm": 1},
    ):
        bid = q.get("booking_id")
        if not bid or bid in seen_ids:
            continue  # already handled by Pass 1
        b = await db.bookings.find_one({"id": bid}, {"_id": 0, "id": 1, "utm": 1})
        if not b:
            quote_link_missing += 1
            continue
        scanned += 1
        current_utm = b.get("utm") or {}
        if (current_utm.get("gclid") or "").strip():
            continue
        parent_utm = q.get("utm") or {}
        if not parent_utm:
            parent_no_utm += 1
            continue
        await db.bookings.update_one(
            {"id": bid},
            {"$set": {"utm": parent_utm, "quote_request_id": q["id"]}},
        )
        updated += 1

    return {
        "scanned": scanned,
        "updated": updated,
        "skipped_quote_missing": quote_link_missing,
        "skipped_parent_no_utm": parent_no_utm,
    }


@router.get("/admin/ads/quote-conversions.csv")
async def admin_export_quote_conversions_csv(
    days: int = 90,
    _: dict = Depends(require_admin),
):
    """Per-quote conversion feedback CSV for Google Ads (Enhanced Conversions).

    Unlike /admin/ads/offline-conversions.csv (bookings-first, minimal columns
    matching Google's Offline Conversion Import spec), this endpoint exports
    QUOTE_REQUESTS as the unit of analysis — one row per lead — so an ad
    manager can see the full funnel outcome per gclid:

      • WON  → positive conversion with actual paid amount
      • LOST → negative signal (Enhanced Conversions for Leads uses this to
               suppress bidding on similar audience segments)
      • QUOTED / CONTACTED / NEW → still open, don't fire yet

    This is the missing piece for closing the Google Ads feedback loop:
    Google fires "Request Quote" ($20 placeholder) at form submission, then
    this data lets us send back the real outcome + real value later.

    Once the Google Ads API Developer Token is approved, the server-side
    conversion job will read from the same underlying data — so the shape
    of this CSV mirrors what the API integration will submit.
    """
    days = max(1, min(int(days or 90), 365))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    import csv
    import io
    from fastapi.responses import StreamingResponse

    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow([
        "quote_request_id",
        "gclid",
        "utm_source",
        "utm_medium",
        "utm_campaign",
        "landing_path",
        "status",                # new | contacted | quoted | won | lost
        "quote_submitted_at",    # ISO timestamp of original form submission
        "quoted_price",          # what we quoted (0 if never quoted)
        "booking_id",            # linked booking (empty if not won)
        "gross_amount",          # customer-facing paid amount (empty if not won)
        "affiliate_cost",        # what we pay the fulfilling operator
        "profit",                # gross_amount - affiliate_cost (Google Ads should optimize on this for a broker business)
        "paid_at",               # ISO timestamp of payment (empty if not won)
        "name",
        "email",
        "phone",
        "pickup_date",
        "vehicle_type",
    ])

    rows_written = 0
    with_gclid = 0
    won_count = 0
    lost_count = 0
    open_count = 0
    total_won_value = 0.0

    async for q in db.quote_requests.find(
        {"created_at": {"$gte": cutoff}},
        {
            "_id": 0, "id": 1, "utm": 1, "status": 1, "created_at": 1,
            "quoted_price": 1, "booking_id": 1, "full_name": 1, "email": 1,
            "phone": 1, "pickup_date": 1, "vehicle_type": 1,
        },
    ):
        utm = q.get("utm") or {}
        gclid = (utm.get("gclid") or "").strip()
        status = (q.get("status") or "new").lower()

        # Look up linked booking for gross_amount + affiliate_cost + paid_at if won.
        gross_amount = ""
        affiliate_cost_str = ""
        profit_str = ""
        paid_at = ""
        booking_id = q.get("booking_id") or ""
        gross_val = 0.0
        if status == "won" and booking_id:
            b = await db.bookings.find_one(
                {"id": booking_id},
                {"_id": 0, "amount": 1, "amount_paid": 1, "total_amount": 1,
                 "quote_amount": 1, "affiliate_cost": 1,
                 "stripe_paid_at": 1, "paid_at": 1},
            ) or {}
            # Booking amount field is "amount" (see quote-finalize endpoint);
            # historical bookings may use one of the legacy fields.
            for k in ("amount", "amount_paid", "total_amount", "quote_amount"):
                v = b.get(k)
                if isinstance(v, (int, float)) and v > 0:
                    gross_val = float(v)
                    gross_amount = f"{gross_val:.2f}"
                    total_won_value += gross_val
                    break
            aff = b.get("affiliate_cost")
            if isinstance(aff, (int, float)) and aff > 0:
                affiliate_cost_str = f"{float(aff):.2f}"
                if gross_val > 0:
                    profit_val = round(gross_val - float(aff), 2)
                    if profit_val > 0:
                        profit_str = f"{profit_val:.2f}"
            paid_at = b.get("stripe_paid_at") or b.get("paid_at") or ""

        writer.writerow([
            q.get("id") or "",
            gclid,
            utm.get("utm_source") or "",
            utm.get("utm_medium") or "",
            utm.get("utm_campaign") or "",
            utm.get("landing_path") or "",
            status,
            q.get("created_at") or "",
            f"{float(q.get('quoted_price') or 0):.2f}" if q.get("quoted_price") else "",
            booking_id,
            gross_amount,
            affiliate_cost_str,
            profit_str,
            paid_at,
            q.get("full_name") or "",
            q.get("email") or "",
            q.get("phone") or "",
            q.get("pickup_date") or "",
            q.get("vehicle_type") or "",
        ])
        rows_written += 1
        if gclid:
            with_gclid += 1
        if status == "won":
            won_count += 1
        elif status == "lost":
            lost_count += 1
        elif status in ("new", "contacted", "quoted"):
            open_count += 1

    buf.seek(0)
    filename = f"quote-conversions-{datetime.now(timezone.utc).strftime('%Y-%m-%d')}.csv"
    return StreamingResponse(
        iter([buf.getvalue()]),
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "X-Rows-Total": str(rows_written),
            "X-Rows-With-Gclid": str(with_gclid),
            "X-Rows-Won": str(won_count),
            "X-Rows-Lost": str(lost_count),
            "X-Rows-Open": str(open_count),
            "X-Total-Won-Value": f"{total_won_value:.2f}",
        },
    )


@router.get("/admin/ads/quote-conversions/summary")
async def admin_quote_conversions_summary(
    days: int = 90,
    _: dict = Depends(require_admin),
):
    """Aggregate funnel summary for the quote-conversions CSV endpoint.

    Cheaper than downloading the full CSV — returns just counts + $ totals.
    Useful for the admin UI to show "past 90 days: 42 quotes, 15 won, $12,500
    total revenue, 28 with gclid" before offering the CSV download button.
    """
    days = max(1, min(int(days or 90), 365))
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    total = 0
    with_gclid = 0
    won = 0
    won_with_gclid = 0
    lost = 0
    lost_with_gclid = 0
    open_ = 0
    total_won_value = 0.0
    total_won_profit = 0.0
    won_with_profit = 0

    async for q in db.quote_requests.find(
        {"created_at": {"$gte": cutoff}},
        {"_id": 0, "id": 1, "utm": 1, "status": 1, "booking_id": 1},
    ):
        total += 1
        utm = q.get("utm") or {}
        has_gclid = bool((utm.get("gclid") or "").strip())
        if has_gclid:
            with_gclid += 1
        status = (q.get("status") or "new").lower()
        if status == "won":
            won += 1
            if has_gclid:
                won_with_gclid += 1
            booking_id = q.get("booking_id")
            if booking_id:
                b = await db.bookings.find_one(
                    {"id": booking_id},
                    {"_id": 0, "amount": 1, "amount_paid": 1, "total_amount": 1,
                     "quote_amount": 1, "affiliate_cost": 1},
                ) or {}
                gross_v = 0.0
                for k in ("amount", "amount_paid", "total_amount", "quote_amount"):
                    v = b.get(k)
                    if isinstance(v, (int, float)) and v > 0:
                        gross_v = float(v)
                        total_won_value += gross_v
                        break
                aff = b.get("affiliate_cost")
                if isinstance(aff, (int, float)) and aff > 0 and gross_v > 0:
                    profit_v = round(gross_v - float(aff), 2)
                    if profit_v > 0:
                        total_won_profit += profit_v
                        won_with_profit += 1
        elif status == "lost":
            lost += 1
            if has_gclid:
                lost_with_gclid += 1
        elif status in ("new", "contacted", "quoted"):
            open_ += 1

    return {
        "days": days,
        "total_quotes": total,
        "with_gclid": with_gclid,
        "won": won,
        "won_with_gclid": won_with_gclid,
        "lost": lost,
        "lost_with_gclid": lost_with_gclid,
        "open": open_,
        "total_won_value": round(total_won_value, 2),
        "total_won_profit": round(total_won_profit, 2),
        "won_with_profit": won_with_profit,
        "close_rate_percent": round(100.0 * won / total, 1) if total else 0.0,
        "trackable_close_rate_percent": round(100.0 * won_with_gclid / with_gclid, 1) if with_gclid else 0.0,
    }
