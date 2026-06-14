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

    if "affiliate_id" in payload:
        update["affiliate_id"] = payload.get("affiliate_id") or None
    if "affiliate_cost" in payload and payload["affiliate_cost"] is not None:
        try:
            update["affiliate_cost"] = round(float(payload["affiliate_cost"]), 2)
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="affiliate_cost must be a number")

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
                await send_email(to=q["email"], subject=subj, html=html)
                sent_to = q["email"]
        except Exception as e:
            logger.warning(f"Quote-offer email send failed: {e}")
        # Always SMS too — most limo customers reply faster on text
        try:
            phone_raw = (q.get("phone") or "").strip()
            if phone_raw:
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

    origin = (payload or {}).get("origin_url") or _frontend_origin_from_request(request)
    origin = origin.rstrip("/")
    success_url = f"{origin}/quote/{token}?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/quote/{token}"

    checkout = _get_stripe_checkout(request)
    session = await checkout.create_checkout_session(
        CheckoutSessionRequest(
            amount=deposit,
            currency="usd",
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={
                "quote_request_id": q["id"],
                "confirm_token": token,
                "kind": "quote_offer_deposit",
                "customer_email": q.get("email") or "",
                "customer_name": q.get("full_name") or "",
            },
        )
    )

    await db.quote_requests.update_one(
        {"id": q["id"]},
        {"$set": {
            "deposit_session_id": session.session_id,
            "deposit_amount_pending": deposit,
        }},
    )
    return {"url": session.url, "session_id": session.session_id, "amount": deposit}


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
