"""
Customer (rider) authenticated routes — extracted from server.py during 2026-02 refactor.

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


@router.get("/customer/referrals")
async def customer_get_referrals(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    summary = await referral.referral_summary(db, cid)
    summary["share_url"] = f"{_frontend_origin_from_env()}/r/{summary['referral_code']}"
    return summary


@router.post("/customer/signup", response_model=CustomerAuthResponse)
async def customer_signup(payload: CustomerSignupRequest):
    email = payload.email.lower()
    existing = await db.customers.find_one({"email": email}, {"_id": 0, "id": 1})
    if existing:
        raise HTTPException(status_code=409, detail="An account already exists with this email.")
    cid = str(uuid.uuid4())
    referrer_id = await referral.resolve_referrer(db, payload.referred_by_code)
    doc = {
        "id": cid,
        "name": payload.name.strip(),
        "email": email,
        "phone": (payload.phone or "").strip() or None,
        "password_hash": hash_password(payload.password),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    if referrer_id:
        doc["referred_by"] = referrer_id
    await db.customers.insert_one(doc)
    # Generate a referral code for this new customer (fire-and-forget — non-blocking)
    try:
        await referral.ensure_referral_code(db, cid)
    except Exception as e:
        logger.warning(f"ensure_referral_code on signup failed for {cid}: {e}")
    # Fire welcome email — fire-and-forget, never blocks signup.
    asyncio.create_task(_send_welcome_email_safe(doc))
    token = create_customer_token(cid, email)
    return CustomerAuthResponse(token=token, user=_customer_to_profile(doc))


@router.post("/customer/login", response_model=CustomerAuthResponse)
async def customer_login(payload: CustomerLoginRequest):
    email = payload.email.lower()
    user = await db.customers.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(payload.password, user.get("password_hash", "")):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_customer_token(user["id"], email)
    return CustomerAuthResponse(token=token, user=_customer_to_profile(user))


@router.post("/customer/oauth/apple", response_model=CustomerAuthResponse)
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
        referred_by_code=payload.referred_by_code,
    )
    token = create_customer_token(customer["id"], customer["email"])
    return CustomerAuthResponse(token=token, user=_customer_to_profile(customer))


@router.post("/customer/oauth/google", response_model=CustomerAuthResponse)
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
        referred_by_code=payload.referred_by_code,
    )
    token = create_customer_token(customer["id"], customer["email"])
    return CustomerAuthResponse(token=token, user=_customer_to_profile(customer))


@router.post("/customer/forgot-password")
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


@router.post("/customer/reset-password")
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


@router.get("/customer/me", response_model=CustomerProfile)
async def customer_me(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    user = await db.customers.find_one({"id": cid}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Account not found")
    return _customer_to_profile(user)


@router.patch("/customer/me", response_model=CustomerProfile)
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


@router.get("/customer/me/addresses", response_model=List[SavedAddress])
async def customer_list_addresses(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    cursor = db.customer_addresses.find({"customer_id": cid}, {"_id": 0}).sort("created_at", -1)
    return [SavedAddress(**doc) async for doc in cursor]


@router.post("/customer/me/addresses", response_model=SavedAddress)
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


@router.delete("/customer/me/addresses/{address_id}")
async def customer_delete_address(address_id: str, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    r = await db.customer_addresses.delete_one({"id": address_id, "customer_id": cid})
    if not r.deleted_count:
        raise HTTPException(status_code=404, detail="Address not found")
    return {"deleted": True}


@router.get("/customer/me/promos")
async def customer_promo_history(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    # Get all the customer's bookings that have promo_code set
    cursor = db.bookings.find(
        {"customer_id": cid, "promo_code": {"$exists": True, "$nin": [None, ""]}},
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


@router.get("/customer/me/notifications", response_model=NotificationPrefs)
async def customer_get_notification_prefs(claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    user = await db.customers.find_one({"id": cid}, {"_id": 0, "notification_prefs": 1})
    if user is None:
        raise HTTPException(status_code=404, detail="Account not found")
    return NotificationPrefs(**(user.get("notification_prefs") or {}))


@router.patch("/customer/me/notifications", response_model=NotificationPrefs)
async def customer_update_notification_prefs(payload: NotificationPrefs, claims: dict = Depends(require_customer)):
    cid = claims.get("customer_id")
    r = await db.customers.update_one(
        {"id": cid},
        {"$set": {"notification_prefs": payload.model_dump(), "updated_at": datetime.now(timezone.utc).isoformat()}},
    )
    if not r.matched_count:
        raise HTTPException(status_code=404, detail="Account not found")
    return payload


@router.post("/customer/me/change-password")
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


@router.delete("/customer/me")
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
    # Detach any OAuth identities so a future Apple/Google sign-in creates a
    # fresh account instead of resurrecting the deleted one.
    await db.oauth_identities.delete_many({"customer_id": cid})
    return {"ok": True}


@router.post("/customer/push-token")
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


@router.post("/customer/me/help")
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


@router.post("/customer/book-and-pay", response_model=CustomerCheckoutResponse)
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
    # Block bookings until the rider has a real name + phone on file.
    # Social sign-in (Apple "Hide My Email", or Google with no granted name)
    # can leave these blank; the chauffeur needs to know who to pick up and
    # how to reach them.
    rider_name = (user.get("name") or "").strip()
    rider_phone = (user.get("phone") or "").strip()
    if len(rider_name) < 2:
        raise HTTPException(
            status_code=400,
            detail="PROFILE_NAME_REQUIRED: Please add your full name in Profile › Personal Information before booking.",
        )
    if len(rider_phone) < 5:
        raise HTTPException(
            status_code=400,
            detail="PROFILE_PHONE_REQUIRED: Please add your phone number in Profile › Personal Information so your chauffeur can reach you.",
        )
    if payload.vehicle_type not in VEHICLE_TYPES:
        raise HTTPException(status_code=400, detail="Invalid vehicle_type")

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
        "full_name": rider_name,
        "email": user["email"],
        "phone": rider_phone,
        "service_type": svc_type,
        "pickup_date": pickup_date,
        "pickup_time": pickup_time,
        "pickup_location": payload.pickup_location,
        "dropoff_location": payload.dropoff_location,
        "passengers": payload.passenger_count,
        "luggage_count": 0,
        "child_seat": False,
        "child_seat_count": 0,
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


@router.get("/customer/trips", response_model=List[CustomerTripSummary])
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


@router.get("/customer/bookings/{booking_id}")
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


@router.post("/customer/bookings/{booking_id}/cancel")
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


@router.post("/customer/bookings/{booking_id}/modify")
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


@router.get("/customer/bookings/{booking_id}/driver-location")
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


@router.post("/customer/bookings/{booking_id}/rate")
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
