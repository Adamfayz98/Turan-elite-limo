"""
Driver (dispatch + auth)  routes — extracted from server.py during 2026-02 refactor.

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


@router.get("/driver/{driver_token}")
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


@router.post("/driver/{driver_token}/status")
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

    # ----- Referral reward: when a referred customer completes their first
    # paid ride, issue a $25-off promo to the referrer and email it to them.
    # Fully idempotent — calling twice for the same friend is a no-op.
    if new_status == "completed" and b.get("payment_status") == "paid" and b.get("customer_id"):
        try:
            payout = await referral.maybe_reward_referrer_on_first_completed_ride(db, b["customer_id"])
            if payout:
                asyncio.create_task(_send_referral_reward_email_safe(payout))
        except Exception as e:
            logger.warning(f"referral reward hook failed for booking {b.get('id')}: {e}")

    # Build post-trip page URL (tipping + rating) — included in the customer SMS
    post_trip_url = None
    if new_status == "completed" and b.get("manage_token"):
        origin = _frontend_origin_from_request(request)
        post_trip_url = f"{origin}/post-trip/{b['manage_token']}"

    # SMS the customer (env-gated; also gated on sms_consent per Twilio A2P
    # voluntary-opt-in rules — no SMS if the customer didn't opt in).
    merged = {**b, **set_doc}
    customer_sms = sms_service.render_customer_status_sms(merged, new_status, post_trip_url=post_trip_url)
    if customer_sms:
        try:
            await sms_service.send_customer_sms(merged, customer_sms)
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


@router.post("/driver/{driver_token}/flight-landed")
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


@router.post("/driver/{driver_token}/record-wait-time")
async def driver_record_wait_time(driver_token: str, payload: WaitTimeRecordPayload):
    """Driver records the total minutes waited. NO charge happens here — the admin
    reviews and charges from the admin dashboard. Idempotent (overwrites the
    pending record while the booking has not yet been charged)."""
    b = await db.bookings.find_one({"driver_token": driver_token}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Trip not found")
    return await _record_wait_time_for_booking(b, payload)


@router.post("/driver/{driver_token}/record-mid-trip-stop")
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


@router.post("/driver/{driver_token}/no-show")
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


@router.post("/driver-auth/set-password")
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


@router.post("/driver-auth/login", response_model=DriverAuthResponse)
async def driver_login(payload: DriverLoginRequest):
    email = payload.email.lower()
    d = await db.drivers.find_one({"email": {"$regex": f"^{email}$", "$options": "i"}}, {"_id": 0})
    if not d or not d.get("password_hash") or not verify_password(payload.password, d.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    return DriverAuthResponse(token=create_driver_token(d["id"], email), driver=_driver_to_profile(d))


@router.post("/driver-auth/forgot-password")
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


@router.post("/driver-auth/reset-password")
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


@router.post("/driver/push-token")
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


@router.get("/driver-auth/me", response_model=DriverProfileOut)
async def driver_me(claims: dict = Depends(require_driver)):
    d = await db.drivers.find_one({"id": claims.get("driver_id")}, {"_id": 0})
    if not d:
        raise HTTPException(status_code=404, detail="Driver not found")
    return _driver_to_profile(d)


@router.get("/driver-auth/trips")
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


@router.get("/driver-auth/stats")
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


@router.post("/driver-auth/bookings/{booking_id}/status")
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
    if customer_sms:
        try:
            await sms_service.send_customer_sms(merged, customer_sms)
        except Exception as e:
            logger.warning(f"Customer status SMS failed (jwt-driver): {e}")
    admin_to = sms_service.admin_phone()
    if admin_to:
        try:
            await sms_service.send_sms(admin_to, sms_service.render_admin_status_sms(merged, new_status))
        except Exception as e:
            logger.warning(f"Admin status SMS failed (jwt-driver): {e}")

    return {"ok": True, "trip_status": new_status, "trip_status_updated_at": now_iso}


@router.post("/driver-auth/bookings/{booking_id}/record-wait-time")
async def driver_jwt_record_wait_time(
    booking_id: str,
    payload: WaitTimeRecordPayload,
    claims: dict = Depends(require_driver),
):
    """JWT-driver records minutes waited; admin reviews & charges from the dashboard.
    Uses the same shared logic as the token-based endpoint so admin charge flow works identically."""
    b = await _booking_for_jwt_driver(booking_id, claims.get("driver_id"))
    return await _record_wait_time_for_booking(b, payload)


@router.post("/driver-auth/bookings/{booking_id}/record-mid-trip-stop")
async def driver_jwt_record_mid_trip_stop(
    booking_id: str,
    payload: MidTripStopPayload,
    claims: dict = Depends(require_driver),
):
    """JWT-driver logs an unplanned stop. Uses the shared helper so the schema
    is identical to the token-based endpoint and admin charge flow Just Works."""
    b = await _booking_for_jwt_driver(booking_id, claims.get("driver_id"))
    return await _record_mid_trip_stop_for_booking(b, payload)


@router.get("/driver-auth/bookings/{booking_id}")
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


@router.post("/driver-auth/location")
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
