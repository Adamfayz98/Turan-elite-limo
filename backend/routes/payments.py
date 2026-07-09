"""
Stripe payments + webhook routes — extracted from server.py during 2026-02 refactor.

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

from fastapi import APIRouter, BackgroundTasks

# Single shared router for this group. Mounted under /api in server.py.
router = APIRouter()

# Bulk-copy every public AND private name from server into our globals so that
# function bodies (which were originally written against server.py's module
# namespace) resolve correctly. This is safe because server.py imports this
# module at the BOTTOM, after every helper/model/dep is already defined.
import server as _server  # noqa: E402
globals().update({k: v for k, v in vars(_server).items() if not k.startswith("__")})


async def _resolve_charge_amount(
    booking: dict,
    quote_amount: float,
    deposit_percent: float,
) -> tuple[float, float, float, "str | None"]:
    """Compute the amount to actually charge for a booking, respecting any
    locked-in promo discount WITHOUT double-applying it.

    Returns: (original_amount, amount_to_charge, discount_amount, applied_promo_code).

    Historical context — the double-discount bug (Feb 2026):
      - `server.create_booking` stores `quote_amount = ride_amount − discount`
        (POST-discount) whenever a promo locks in successfully.
      - The old inline code here treated `quote_amount` as PRE-discount and
        applied the discount ratio a second time → customers who saw
        $660.88 on the booking form got a Stripe deposit of $462.44 (30%
        off applied twice).
      - This helper detects locked-in bookings (where
        `quote_amount + discount_amount ≈ original_quote_amount`) and
        uses `quote_amount` as-is. Legacy bookings — created before the
        lock-in fix, where `quote_amount == original_quote_amount` — still
        get the proportional discount so we don't accidentally overcharge
        them mid-migration.
    """
    stored_discount = float(booking.get("discount_amount") or 0)
    orig_ride = float(booking.get("original_quote_amount") or 0)

    # Locked-in booking: quote_amount is already POST-discount. Just apply
    # deposit_percent — nothing else.
    # Tolerance uses max(0.5, discount_amount * 0.05) so a tiny referral
    # credit (e.g. $0.50) can still be detected as locked-in without a
    # $1 slop mistaking it for a legacy booking.
    tol = max(0.5, stored_discount * 0.05)
    is_locked_in = (
        stored_discount > 0
        and orig_ride > 0
        and abs(float(quote_amount) + stored_discount - orig_ride) < tol
    )
    if is_locked_in:
        # Amount to charge = post-discount quote × deposit_percent.
        amount = round(float(quote_amount) * deposit_percent / 100.0, 2)
        # For display we recompute the pre-discount deposit + the applied
        # discount, so downstream (Stripe metadata, admin UI) still shows
        # "original − savings" correctly.
        original_amount = round(float(orig_ride) * deposit_percent / 100.0, 2)
        discount_amount = round(original_amount - amount, 2)
        if discount_amount < 0:
            discount_amount = 0.0
        applied_promo = booking.get("promo_code")
        return original_amount, amount, discount_amount, applied_promo

    # Legacy path #1: booking stored `discount_amount` but `quote_amount` is
    # PRE-discount (older bookings from before the lock-in fix). Apply the
    # proportional discount so `deposit_percent < 100` still works.
    original_amount = round(float(quote_amount) * deposit_percent / 100.0, 2)
    if stored_discount > 0 and orig_ride > 0:
        discount_ratio = stored_discount / orig_ride
        discount_amount = round(original_amount * discount_ratio, 2)
        amount = round(original_amount - discount_amount, 2)
        applied_promo = booking.get("promo_code")
        if amount < 0.5:
            amount = 0.5
            discount_amount = round(original_amount - amount, 2)
        return original_amount, amount, discount_amount, applied_promo

    # Legacy path #2: no stored discount at all. Re-validate promo_code if
    # any — matches the pre-refactor behaviour for in-flight bookings.
    amount = original_amount
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
            logger.warning(
                f"Promo '{code_raw}' rejected at checkout for {booking.get('id')}: "
                f"{promo.get('reason')}"
            )
    return original_amount, amount, discount_amount, applied_promo


@router.post("/admin/bookings/{booking_id}/charge-mid-trip-stop")
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


@router.post("/payments/checkout", response_model=CheckoutCreateResponse)
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

    # ----- Promo / discount resolution -----
    # See _resolve_charge_amount for the double-discount bug it prevents.
    original_amount, amount, discount_amount, applied_promo = (
        await _resolve_charge_amount(booking, quote_amount, settings.deposit_percent)
    )
    if amount < 0.5:
        raise HTTPException(status_code=400, detail="Amount too small to charge")

    # Generate confirmation # on first checkout (so it's locked in even before payment)
    booking_updates = {"quote_amount": quote_amount}
    if applied_promo and not booking.get("discount_amount"):
        # Only backfill promo fields for legacy bookings — new bookings already
        # have these persisted at creation time by server.create_booking.
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
    # Product description shown right under the product name on Stripe's
    # hosted checkout — repeats the pickup/dropoff so customers see WHAT
    # they're paying for at the last mile of the funnel. Truncated to
    # Stripe's ~500-char product-description limit.
    product_desc_parts = []
    if booking.get("pickup_location"):
        product_desc_parts.append(f"{booking['pickup_location']} → {booking.get('dropoff_location', '')}".strip(" →"))
    if booking.get("pickup_date"):
        product_desc_parts.append(f"{booking['pickup_date']} · {booking.get('pickup_time','')}".strip(" ·"))
    product_desc = " · ".join(product_desc_parts)[:480]
    form = [
        ("mode", "payment"),
        ("success_url", success_url),
        ("cancel_url", cancel_url),
        # Explicitly enable card only; wallet buttons (Apple Pay / Google Pay
        # / Link) auto-appear on Stripe's hosted page whenever "card" is
        # enabled + the customer's browser supports them. Listing them here
        # is redundant and Stripe rejects some (e.g. "google_pay") as invalid
        # payment_method_types values. Keep it clean.
        ("payment_method_types[]", "card"),
        # Show "Reserve" instead of "Pay" on the Stripe submit button when
        # customer picked pay-now — reinforces this is a booking, not a
        # generic e-commerce purchase.
        ("submit_type", "book"),
        # Trust nudge shown on Stripe's own checkout page — same "Book now,
        # pay after ride" language would confuse pay-now customers, so here
        # we lean on the flat-rate + confirmation guarantee instead.
        ("custom_text[submit][message]",
            "Reservation confirmed instantly · Flat rate — no surge, no hidden fees · "
            "Free cancellation up to 24 hours · Apple Pay & Google Pay accepted."),
        ("customer_creation", "always"),
        ("line_items[0][quantity]", "1"),
        ("line_items[0][price_data][currency]", settings.currency),
        ("line_items[0][price_data][unit_amount]", str(amount_cents)),
        ("line_items[0][price_data][product_data][name]", product_name),
    ]
    if product_desc:
        form.append(("line_items[0][price_data][product_data][description]", product_desc))
    form.extend([
        ("payment_intent_data[setup_future_usage]", "off_session"),
        ("payment_intent_data[metadata][booking_id]", payload.booking_id),
        ("payment_intent_data[metadata][confirmation_number]", cn_for_desc),
        ("metadata[booking_id]", payload.booking_id),
        ("metadata[confirmation_number]", cn_for_desc),
        ("metadata[customer_email]", customer_email),
    ])
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
        # Don't downgrade a card-on-file booking that's using this endpoint as the
        # post-decline fallback payment link — keep its status until Stripe pays.
        **({} if booking.get("payment_status") == "card_on_file" else {"payment_status": "pending"}),
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


@router.post("/payments/checkout-telemetry")
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


@router.get("/payments/status/{session_id}", response_model=PaymentStatus)
async def get_payment_status(session_id: str, request: Request):
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn:
        raise HTTPException(status_code=404, detail="Payment not found")

    # Setup-mode (pay-after-ride) sessions are finalized via their own path —
    # they never have payment_status "paid" on Stripe's side.
    if txn.get("kind") == "setup":
        result = await _finalize_setup_session(session_id, _frontend_origin_from_request(request))
        b2 = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
        return PaymentStatus(
            payment_status=result if result != "unknown" else "pending",
            booking_status=(b2.get("status") if b2 else "unknown"),
            amount=float(txn.get("amount", 0)),
            currency=txn.get("currency", "usd"),
            confirmation_number=(b2.get("confirmation_number") if b2 else None),
        )

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


@router.post("/admin/bookings/{booking_id}/backfill-saved-card")
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


@router.post("/admin/payments/backfill-saved-cards")
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


@router.post("/webhook/stripe")
async def stripe_webhook(request: Request, background_tasks: BackgroundTasks):
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
            elif isinstance(md, dict) and md.get("kind") == "custom_invoice_setup":
                # Pay-later invoice: setup mode complete, save card refs so
                # admin can charge off-session after the ride.
                await _finalize_invoice_setup_session(sid, md)
        except Exception as e:
            logging.getLogger(__name__).warning(f"Custom invoice webhook check failed: {e}")
        txn = await db.payment_transactions.find_one({"session_id": sid}, {"_id": 0})
        # Pay-after-ride setup sessions: finalize card-on-file instead of "paid".
        if txn and txn.get("kind") == "setup":
            try:
                await _finalize_setup_session(sid, _frontend_origin_from_request(request))
            except Exception as e:
                logging.getLogger(__name__).warning(f"Setup session webhook finalize failed: {e}")
            return {"received": True}
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
                # ---- Fire Google Ads offline conversion upload (non-blocking) ----
                # Backgrounded so we never delay the Stripe webhook response.
                # Idempotent — upload_booking_to_google_ads() no-ops if the
                # booking has google_ads_conversion_uploaded=True already.
                try:
                    from routes.google_ads import upload_booking_to_google_ads
                    background_tasks.add_task(upload_booking_to_google_ads, txn["booking_id"])
                except Exception as e:
                    logging.getLogger(__name__).warning(f"Google Ads background schedule failed: {e}")
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


@router.get("/admin/bookings/{booking_id}/refund-preview")
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


@router.post("/admin/payments/{booking_id}/refund")
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


@router.post("/admin/bookings/{booking_id}/charge-wait-time")
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


@router.post("/admin/bookings/{booking_id}/charge-damages")
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


@router.post("/admin/bookings/{booking_id}/force-sync-payment")
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



# =====================================================================
# Generic "Charge card on file" — for arbitrary fees not covered by the
# specific wait-time / damages / mid-trip-stop endpoints. Examples:
#   - extra hour added on the night-of
#   - tolls reimbursement
#   - special-request stop after the trip already ended
#   - day-before balance auto-charge when the customer was unreachable
# =====================================================================


@router.post("/admin/bookings/{booking_id}/charge-card")
async def admin_charge_card_on_file(
    booking_id: str,
    payload: dict,
    _: dict = Depends(require_admin),
):
    """Generic off-session charge against the saved card. Requires:
      - amount (USD, > $0.50)
      - reason (short label: 'extra_hour' | 'extra_stop' | 'tolls' | 'balance' | 'other')
      - description (free-text shown on the customer's receipt + Stripe dashboard)
    """
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
        raise HTTPException(
            status_code=400,
            detail="No saved card on this booking. Use Backfill saved card first, or send a new invoice.",
        )

    try:
        amount = float(payload.get("amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount must be a number")
    if amount < 0.50:
        raise HTTPException(status_code=400, detail="Charge too small (under $0.50 minimum).")
    if amount > 10000:
        raise HTTPException(
            status_code=400,
            detail="Charge exceeds $10,000 — please split into smaller charges or contact Stripe support.",
        )
    reason = (payload.get("reason") or "other").strip().lower()[:40]
    description = (payload.get("description") or "").strip()[:400]
    if not description:
        description = f"Additional charge ({reason}) — #{b.get('confirmation_number','')}"

    pi = await _stripe_off_session_charge(
        customer_id=customer_id,
        payment_method_id=pm_id,
        amount_cents=int(round(amount * 100)),
        description=description,
        metadata={
            "booking_id": b["id"],
            "kind": "charge_card_on_file",
            "reason": reason,
        },
    )

    now_iso = datetime.now(timezone.utc).isoformat()
    charge_record = {
        "id": str(uuid.uuid4()),
        "amount": amount,
        "reason": reason,
        "description": description,
        "stripe_payment_intent_id": pi.get("id") or "",
        "charged_at": now_iso,
    }
    await db.bookings.update_one(
        {"id": b["id"]},
        {"$push": {"extra_charges": charge_record}},
    )

    # Email the customer a simple receipt — no fancy template; this is rare.
    try:
        if b.get("email"):
            cn = b.get("confirmation_number") or b["id"][:8]
            html = f"""<!doctype html><html><body style="background:#050505;color:#eee;font-family:-apple-system,Segoe UI,Roboto,sans-serif;padding:32px;">
<div style="max-width:560px;margin:0 auto;background:#0c0c0c;border:1px solid #1c1c1c;border-radius:14px;padding:28px;">
  <div style="color:#D4AF37;font-size:11px;letter-spacing:.22em;text-transform:uppercase;font-weight:600;">Charge receipt</div>
  <h2 style="color:#fff;font-size:20px;margin:10px 0 4px;">${amount:,.2f} charged · #{cn}</h2>
  <div style="color:#888;font-size:13px;line-height:1.7;margin-top:10px;">
    {description.replace('<','&lt;').replace('>','&gt;')}
  </div>
  <div style="margin-top:20px;padding-top:16px;border-top:1px solid #1c1c1c;color:#666;font-size:11px;line-height:1.7;">
    Card on file: {b.get('card_brand','card')} ending {b.get('card_last4','••••')}.<br>
    Questions? Reply to this email or call (650) 410-0687.
  </div>
</div></body></html>"""
            await send_email(
                to=b["email"],
                subject=f"Charge receipt · ${amount:,.2f} · #{cn}",
                html=html,
                bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
            )
    except Exception as e:
        logger.warning(f"charge-card-on-file customer receipt email failed: {e}")

    return {
        "charged": True,
        "amount": amount,
        "reason": reason,
        "description": description,
        "stripe_payment_intent_id": pi.get("id"),
    }


# ---------------------------------------------------------------------------
# "Book now, pay after ride" — Stripe Checkout in SETUP mode.
# Card is collected + validated at booking time ($0 charged), saved to a
# Stripe Customer, then charged off-session by admin after ride completion.
# ---------------------------------------------------------------------------

@router.post("/payments/checkout-setup", response_model=CheckoutCreateResponse)
async def create_payment_checkout_setup(payload: CheckoutCreateRequest, request: Request):
    """Pay-after-ride flow: create a setup-mode Stripe Checkout session that
    saves + validates the customer's card without charging anything today."""
    booking = await db.bookings.find_one({"id": payload.booking_id}, {"_id": 0})
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    if booking.get("payment_status") in ("paid", "card_on_file"):
        raise HTTPException(status_code=400, detail="Booking is already secured")
    if booking.get("status") not in ("confirmed", "pending"):
        raise HTTPException(status_code=400, detail="Booking is not active")

    quote_amount = booking.get("quote_amount") or await _compute_quote_amount(booking)
    if quote_amount is None:
        raise HTTPException(
            status_code=400,
            detail="This vehicle requires a phone quote — call us to arrange payment.",
        )

    settings = await _load_settings()
    original_amount, amount, discount_amount, applied_promo = (
        await _resolve_charge_amount(booking, quote_amount, settings.deposit_percent)
    )
    if amount < 0.5:
        raise HTTPException(status_code=400, detail="Amount too small to charge")

    booking_updates = {
        "quote_amount": quote_amount,
        "payment_mode": "pay_after_ride",
        "pay_later_amount": amount,
    }
    if applied_promo and not booking.get("discount_amount"):
        booking_updates["promo_code"] = applied_promo
        booking_updates["discount_amount"] = discount_amount
        booking_updates["original_quote_amount"] = original_amount
    if not booking.get("confirmation_number"):
        booking_updates["confirmation_number"] = await _next_unique_confirmation_number()
        booking["confirmation_number"] = booking_updates["confirmation_number"]

    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        raise HTTPException(status_code=500, detail="Stripe is not configured")

    origin = payload.origin_url.rstrip("/")
    success_url = f"{origin}/thank-you?bid={payload.booking_id}&session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = f"{origin}/pay/{payload.booking_id}"
    cn_for_desc = booking.get("confirmation_number") or ""

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/x-www-form-urlencoded",
    }
    async with httpx.AsyncClient(timeout=15.0) as cli:
        try:
            # 1) Create (or reuse) a Stripe Customer so the saved card is chargeable later.
            customer_id = booking.get("stripe_customer_id")
            if not customer_id:
                cust_form = [
                    ("email", booking.get("email") or ""),
                    ("name", booking.get("full_name") or ""),
                    ("metadata[booking_id]", payload.booking_id),
                ]
                rc = await cli.post(
                    "https://api.stripe.com/v1/customers",
                    headers=headers,
                    content=urlencode(cust_form).encode("utf-8"),
                )
                if rc.status_code != 200:
                    logger.error(f"Stripe customer create failed: {rc.status_code} {rc.text[:300]}")
                    await _record_checkout_failure(payload.booking_id, f"stripe_customer_{rc.status_code}", rc.text[:300], booking)
                    raise HTTPException(status_code=502, detail="Could not start Stripe checkout. We've been notified and will call you to complete the booking.")
                customer_id = rc.json().get("id")

            # 2) Setup-mode Checkout session — validates the card, charges $0.
            form = [
                ("mode", "setup"),
                ("customer", customer_id),
                ("payment_method_types[]", "card"),
                ("success_url", success_url),
                ("cancel_url", cancel_url),
                # Reinforce "$0 today · pay after ride" ON the Stripe page itself
                # so customers don't get cold feet when they see a card form.
                # This shows as gold text right above the "Set up" button.
                ("custom_text[submit][message]",
                    "You will NOT be charged today. Your card is securely saved by Stripe "
                    "and only charged AFTER your ride is completed. "
                    "Apple Pay & Google Pay supported for one-tap card setup."),
                ("setup_intent_data[metadata][booking_id]", payload.booking_id),
                ("setup_intent_data[metadata][kind]", "pay_after_ride"),
                ("metadata[booking_id]", payload.booking_id),
                ("metadata[kind]", "pay_after_ride"),
                ("metadata[confirmation_number]", cn_for_desc),
            ]
            r = await cli.post(
                "https://api.stripe.com/v1/checkout/sessions",
                headers=headers,
                content=urlencode(form).encode("utf-8"),
            )
        except (httpx.TimeoutException, httpx.RequestError, httpx.HTTPError) as e:
            err_msg = f"{type(e).__name__}: {str(e)[:200]}"
            logger.error(f"Stripe setup-checkout network failure for booking {payload.booking_id}: {err_msg}")
            await _record_checkout_failure(payload.booking_id, "network_error", err_msg, booking)
            raise HTTPException(
                status_code=502,
                detail="Our payment processor didn't respond in time. Please try again.",
            )
    if r.status_code != 200:
        err_body = r.text[:500]
        logger.error(f"Stripe setup-checkout create failed: {r.status_code} {err_body}")
        await _record_checkout_failure(payload.booking_id, f"stripe_{r.status_code}", err_body, booking)
        raise HTTPException(
            status_code=502,
            detail="Could not start Stripe checkout. We've been notified and will call you to complete the booking.",
        )
    sess_json = r.json()
    session_url = sess_json.get("url")
    session_id = sess_json.get("id")
    if not session_url or not session_id:
        await _record_checkout_failure(payload.booking_id, "stripe_invalid_session", str(sess_json)[:300], booking)
        raise HTTPException(status_code=502, detail="Stripe returned an invalid session")

    await db.payment_transactions.insert_one(
        {
            "id": str(uuid.uuid4()),
            "booking_id": payload.booking_id,
            "session_id": session_id,
            "kind": "setup",
            "amount": float(amount),
            "currency": settings.currency,
            "status": "initiated",
            "metadata": {
                "confirmation_number": booking.get("confirmation_number"),
                "customer_email": booking.get("email"),
                "kind": "pay_after_ride",
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
                "payment_session_id": session_id,
                "stripe_customer_id": customer_id,
                "last_checkout_attempt_at": datetime.now(timezone.utc).isoformat(),
            },
            "$inc": {"checkout_attempts": 1},
        },
    )
    return CheckoutCreateResponse(url=session_url, session_id=session_id, amount=float(amount))


async def _finalize_setup_session(session_id: str, client_origin: str | None = None) -> str:
    """Idempotent: verify a setup-mode Checkout session completed, save the card
    IDs on the booking, flip payment_status → card_on_file, notify customer/admin.
    Returns the resulting payment_status ('card_on_file' | 'pending' | 'unknown')."""
    txn = await db.payment_transactions.find_one({"session_id": session_id}, {"_id": 0})
    if not txn or txn.get("kind") != "setup":
        return "unknown"
    booking = await db.bookings.find_one({"id": txn["booking_id"]}, {"_id": 0})
    if not booking:
        return "unknown"
    if booking.get("payment_status") in ("card_on_file", "paid"):
        return booking["payment_status"]

    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        return "pending"
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(
                f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
                params={"expand[]": "setup_intent"},
                headers={"Authorization": f"Bearer {api_key}"},
            )
    except Exception as e:
        logger.warning(f"Setup session lookup failed for {session_id}: {e}")
        return "pending"
    if r.status_code != 200:
        logger.warning(f"Setup session lookup HTTP {r.status_code} for {session_id}: {r.text[:200]}")
        return "pending"
    sj = r.json()
    if sj.get("status") != "complete":
        return "pending"
    si = sj.get("setup_intent") or {}
    pm_id = si.get("payment_method") if isinstance(si, dict) else None
    customer_id = sj.get("customer")
    if not pm_id:
        logger.warning(f"Setup session {session_id} complete but no payment_method returned")
        return "pending"

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.payment_transactions.update_one(
        {"session_id": session_id},
        {"$set": {"status": "card_saved", "card_saved_at": now_iso}},
    )
    cn = booking.get("confirmation_number") or await _next_unique_confirmation_number()
    token = booking.get("manage_token") or _generate_manage_token()
    update_set = {
        "payment_status": "card_on_file",
        "card_on_file_at": now_iso,
        "manage_token": token,
        "confirmation_number": cn,
        "stripe_payment_method_id": pm_id,
        "quote_amount": booking.get("quote_amount"),
    }
    if customer_id:
        update_set["stripe_customer_id"] = customer_id
    await db.bookings.update_one({"id": booking["id"]}, {"$set": update_set})
    updated = await db.bookings.find_one({"id": booking["id"]}, {"_id": 0})

    # Google Ads offline conversion — a card-verified booking IS the conversion.
    try:
        import asyncio
        from routes.google_ads import upload_booking_to_google_ads
        asyncio.create_task(upload_booking_to_google_ads(booking["id"]))
    except Exception as e:
        logger.warning(f"Google Ads schedule failed for card-on-file booking: {e}")

    if updated and not updated.get("card_on_file_email_sent"):
        try:
            manage_url = f"{client_origin}/manage/{token}" if client_origin else None
            from email_service import render_card_on_file_email
            await send_email(
                to=updated["email"],
                subject=f"Reservation secured — pay after your ride · {cn}",
                html=render_card_on_file_email(updated, float(updated.get("pay_later_amount") or 0), manage_url=manage_url),
                bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
            )
            await db.bookings.update_one({"id": booking["id"]}, {"$set": {"card_on_file_email_sent": True}})
        except Exception as e:
            logger.warning(f"Card-on-file email failed (non-fatal): {e}")
        try:
            admin_to = sms_service.admin_phone()
            if admin_to:
                amt = float(updated.get("pay_later_amount") or 0)
                await sms_service.send_sms(
                    admin_to,
                    f"New PAY-AFTER-RIDE booking {cn} · {updated.get('vehicle_type','')} · "
                    f"{updated.get('pickup_date','')} {updated.get('pickup_time','')} · "
                    f"${amt:,.2f} due after ride. Card verified & on file.",
                )
        except Exception as e:
            logger.warning(f"Card-on-file admin SMS failed (non-fatal): {e}")
        promo_used = updated.get("promo_code")
        if promo_used:
            try:
                await db.promos.update_one(
                    {"code": promo_used.upper()},
                    {"$inc": {"uses": 1, "total_discount_given": float(updated.get("discount_amount") or 0)}},
                )
            except Exception as e:
                logger.warning(f"Promo usage bump failed for {promo_used}: {e}")
    return "card_on_file"


async def _finalize_invoice_setup_session(session_id: str, md: dict) -> None:
    """Pay-later custom invoice: expand the SetupIntent, capture the saved
    card + customer references onto the invoice document, mark status=card_on_file.
    Idempotent — safe if the webhook fires more than once."""
    invoice_id = (md or {}).get("invoice_id")
    if not invoice_id:
        return
    inv = await db.custom_invoices.find_one({"id": invoice_id}, {"_id": 0})
    if not inv:
        return
    if inv.get("status") in ("paid", "card_on_file"):
        return
    api_key = os.environ.get("STRIPE_API_KEY", "")
    if not api_key:
        return
    try:
        async with httpx.AsyncClient(timeout=15.0) as cli:
            r = await cli.get(
                f"https://api.stripe.com/v1/checkout/sessions/{session_id}",
                params={"expand[]": "setup_intent"},
                headers={"Authorization": f"Bearer {api_key}"},
            )
    except Exception as e:
        logger.warning(f"Invoice setup session lookup failed for {session_id}: {e}")
        return
    if r.status_code != 200:
        logger.warning(f"Invoice setup session HTTP {r.status_code} for {session_id}")
        return
    sj = r.json()
    if sj.get("status") != "complete":
        return
    si = sj.get("setup_intent") or {}
    if isinstance(si, str):
        return
    pm_id = si.get("payment_method")
    customer_id = si.get("customer") or sj.get("customer")
    if not pm_id or not customer_id:
        return
    await db.custom_invoices.update_one(
        {"id": invoice_id},
        {"$set": {
            "status": "card_on_file",
            "stripe_customer_id": customer_id,
            "stripe_payment_method_id": pm_id,
            "card_secured_at": datetime.now(timezone.utc).isoformat(),
        }},
    )
    logger.info(f"Custom invoice {invoice_id}: card_on_file (pm={pm_id})")



@router.post("/admin/bookings/{booking_id}/charge-pay-later")
async def admin_charge_pay_later(
    booking_id: str,
    payload: dict,
    _: dict = Depends(require_admin),
):
    """Charge the saved card for a pay-after-ride booking (after ride completion).
    Accepts optional `amount` override; defaults to the booking's pay_later_amount."""
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        raise HTTPException(status_code=404, detail="Booking not found")
    if b.get("payment_mode") != "pay_after_ride":
        raise HTTPException(status_code=400, detail="This booking is not a pay-after-ride booking.")
    if b.get("payment_status") == "paid":
        return {"already_paid": True, "amount": b.get("paid_amount")}
    pm_id = b.get("stripe_payment_method_id")
    customer_id = b.get("stripe_customer_id")
    if not pm_id or not customer_id:
        raise HTTPException(status_code=400, detail="No saved card on this booking.")

    try:
        amount = float(payload.get("amount") or b.get("pay_later_amount") or 0)
    except (TypeError, ValueError):
        raise HTTPException(status_code=400, detail="amount must be a number")
    if amount < 0.50:
        raise HTTPException(status_code=400, detail="Charge too small (under $0.50 minimum).")
    if amount > 10000:
        raise HTTPException(status_code=400, detail="Charge exceeds $10,000 — split into smaller charges.")

    cn = b.get("confirmation_number") or b["id"][:8]
    try:
        pi = await _stripe_off_session_charge(
            customer_id=customer_id,
            payment_method_id=pm_id,
            amount_cents=int(round(amount * 100)),
            description=f"Chauffeur service — {b.get('vehicle_type','')} · #{cn}",
            metadata={"booking_id": b["id"], "kind": "pay_after_ride_final"},
        )
    except HTTPException as e:
        # Record the decline so admin UI can show it + offer the payment-link fallback.
        await db.bookings.update_one(
            {"id": b["id"]},
            {"$set": {
                "pay_later_charge_error": str(e.detail)[:300],
                "pay_later_charge_error_at": datetime.now(timezone.utc).isoformat(),
            }},
        )
        raise

    now_iso = datetime.now(timezone.utc).isoformat()
    await db.bookings.update_one(
        {"id": b["id"]},
        {
            "$set": {
                "payment_status": "paid",
                "paid_amount": amount,
                "paid_currency": "usd",
                "paid_at": now_iso,
                "pay_later_charged_at": now_iso,
                "payment_intent_id": pi.get("id"),
            },
            "$unset": {"pay_later_charge_error": "", "pay_later_charge_error_at": ""},
        },
    )
    try:
        await send_email(
            to=b["email"],
            subject=f"Payment receipt · ${amount:,.2f} · #{cn}",
            html=render_payment_receipt_email({**b, "confirmation_number": cn}, amount),
            bcc=[SUPPORT_EMAIL] if SUPPORT_EMAIL else None,
        )
    except Exception as e:
        logger.warning(f"Pay-later receipt email failed (non-fatal): {e}")
    return {"charged": True, "amount": amount, "payment_intent_id": pi.get("id")}
