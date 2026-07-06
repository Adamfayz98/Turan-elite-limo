"""
Google Ads server-side offline conversion uploads.

Replaces the manual CSV upload flow — Stripe webhook fires a background
task that POSTs the paid booking to Google Ads directly, using the stored
`utm.gclid` on the booking. Idempotent: every uploaded booking stamps
`google_ads_conversion_uploaded=true` so retries and double-webhooks
never double-count.

The `GOOGLE_ADS_ACTIVE_CONVERSION_ACTION_ID` env var controls which
conversion action new uploads target — starts pointed at the Test action
(`TEL Booking – Test`) for smoke testing, flip to Profit once verified.
"""
# ruff: noqa: F821
# pyright: reportUndefinedVariable=false
from __future__ import annotations

import logging
import os
import json
from datetime import datetime, timezone, timedelta
from typing import Optional, Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)

# Pull db / require_admin / helpers from server module — same pattern as
# routes/admin.py. This avoids circular imports at module load time.
import server as _server  # noqa: E402
db = _server.db
require_admin = _server.require_admin


def _proto_to_dict(msg: Any) -> Any:
    """Convert a proto-plus message (or nested repeated field) to a JSON-safe
    dict — used to persist and inspect raw Google Ads API responses. Falls
    back to str() for anything the SDK can't natively serialize so we never
    lose diagnostic data to a serialization error.
    """
    if msg is None:
        return None
    # proto-plus messages expose `.__class__.to_json()` (uses google.protobuf.json_format)
    try:
        from google.protobuf.json_format import MessageToDict
        # For proto-plus classes, the underlying protobuf is at msg._pb
        pb = getattr(msg, "_pb", msg)
        # protobuf 5.x renamed `including_default_value_fields` to
        # `always_print_fields_with_no_presence`. Default is False for both
        # versions, so we just drop the kwarg — MessageToDict returns the
        # populated fields either way, which is what we want for diag data.
        return MessageToDict(pb, preserving_proto_field_name=True)
    except Exception as e:
        # Log this once — silent fallback is exactly the state that made the
        # iter-52 silent-drop invisible for a while.
        logger.warning(f"[google_ads] _proto_to_dict fell back to str() for {type(msg).__name__}: {e}")
    # Fallback — try each common shape
    if isinstance(msg, (str, int, float, bool)):
        return msg
    if isinstance(msg, list):
        return [_proto_to_dict(x) for x in msg]
    if isinstance(msg, dict):
        return {k: _proto_to_dict(v) for k, v in msg.items()}
    try:
        return str(msg)
    except Exception:
        return None


# --------- Bidirectional booking ↔ quote linkage resolver ---------

async def _resolve_booking_quote_utm(booking: dict) -> tuple[dict, Optional[str]]:
    """Given a booking, return the effective utm dict AND the parent quote_request_id
    (if any). Tries multiple sources so bookings win/lost during earlier code paths
    still line up with quote-request data:

      1. `booking.utm` if it already has a gclid — quickest path, no DB hit
      2. `quote_requests.find_one({"id": booking.quote_request_id})` — the "forward"
         join our own quote-finalize code sets
      3. `quote_requests.find_one({"booking_id": booking.id})` — the "reverse"
         join set by `mark_quote_won` (line 1515 of admin.py); this is what the
         Quote Conversions CSV uses so both views agree

    Returns (utm_dict, parent_quote_id_or_None). utm_dict may be empty {} if
    nothing was found on either side.
    """
    booking_utm = booking.get("utm") or {}
    # Fast-path: gclid already on the booking, no join needed
    if (booking_utm.get("gclid") or "").strip():
        return booking_utm, booking.get("quote_request_id")

    # Forward join: booking → quote via booking.quote_request_id
    qid = booking.get("quote_request_id")
    parent = None
    if qid:
        parent = await db.quote_requests.find_one(
            {"id": qid}, {"_id": 0, "id": 1, "utm": 1},
        )
    # Reverse join: quote → booking via quote.booking_id
    if parent is None:
        parent = await db.quote_requests.find_one(
            {"booking_id": booking.get("id")}, {"_id": 0, "id": 1, "utm": 1},
        )

    if parent:
        parent_utm = parent.get("utm") or {}
        if (parent_utm.get("gclid") or "").strip():
            return parent_utm, parent.get("id")
        # Parent found but no gclid there either — still return the parent's utm
        # so we don't lose non-gclid attribution (utm_campaign, etc.)
        return (parent_utm or booking_utm), parent.get("id")

    return booking_utm, None


# --------- Google Ads client factory ---------

def _get_google_ads_client():
    """Lazy-init the Google Ads client from env vars. Raises HTTPException
    with a clear message if any required var is missing so the admin UI can
    surface config gaps immediately.
    """
    try:
        from google.ads.googleads.client import GoogleAdsClient  # type: ignore
    except ImportError as e:
        raise HTTPException(
            status_code=500,
            detail=f"google-ads library not installed: {e}. Run `pip install google-ads`.",
        )

    required = [
        "GOOGLE_ADS_DEVELOPER_TOKEN",
        "GOOGLE_ADS_CLIENT_ID",
        "GOOGLE_ADS_CLIENT_SECRET",
        "GOOGLE_ADS_REFRESH_TOKEN",
        "GOOGLE_ADS_CUSTOMER_ID",
    ]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise HTTPException(
            status_code=500,
            detail=f"Google Ads env vars missing: {', '.join(missing)}",
        )

    config = {
        "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "refresh_token": os.environ["GOOGLE_ADS_REFRESH_TOKEN"],
        "use_proto_plus": True,
    }
    login_cid = os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID")
    if login_cid:
        config["login_customer_id"] = login_cid.replace("-", "").strip()

    return GoogleAdsClient.load_from_dict(config)


def _active_conversion_action_resource() -> str:
    """Build the full resource name for the currently active conversion action.
    Reads the numeric ID from env — flip GOOGLE_ADS_ACTIVE_CONVERSION_ACTION_ID
    between Test and Profit without a code change.
    """
    customer_id = os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "").strip()
    action_id = os.environ.get("GOOGLE_ADS_ACTIVE_CONVERSION_ACTION_ID") or \
        os.environ.get("GOOGLE_ADS_TEST_CONVERSION_ACTION_ID", "")
    if not action_id:
        raise HTTPException(status_code=500, detail="No conversion action ID configured")
    return f"customers/{customer_id}/conversionActions/{action_id}"


# --------- Booking → ClickConversion mapping ---------

def _booking_gross_and_profit(b: dict) -> tuple[float, float]:
    """Same math as /admin/ads/quote-conversions.csv — profit = amount − affiliate_cost.
    Returns (gross, profit). Falls back gross→profit if no affiliate cost stored
    so we never upload $0 (which would destroy Smart Bidding signal).

    Value hierarchy — we upload the amount that will ACTUALLY be charged to
    the customer (post-promo), NOT the pre-promo quote. Uploading the
    inflated pre-promo amount trains Smart Bidding on the wrong revenue and
    causes Google to over-bid on discount-hunters. The order below prefers
    the most-realized figure first.
    """
    gross = 0.0
    for k in (
        "paid_amount",         # actually captured (pay-now flow after webhook)
        "pay_later_amount",    # discounted amount to charge post-ride (setup flow)
        "amount",              # legacy
        "amount_paid",         # legacy
        "total_amount",        # legacy
        "quote_amount",        # last-resort pre-promo total
    ):
        v = b.get(k)
        if isinstance(v, (int, float)) and v > 0:
            gross = float(v)
            break
    aff = b.get("affiliate_cost")
    if isinstance(aff, (int, float)) and aff > 0 and gross > 0:
        profit = round(gross - float(aff), 2)
        if profit > 0:
            return gross, profit
    # Fallback: no affiliate cost recorded — send gross so Ads still gets a
    # positive value. Test conversion action defaults to $1 if we send 0.
    return gross, gross


def _iso_to_google_ads_datetime(iso: str) -> str:
    """Convert an ISO-8601 timestamp (as we store on bookings) to the format
    Google Ads expects: `yyyy-mm-dd hh:mm:ss+|-hh:mm`.
    """
    dt = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    # Google Ads accepts "+00:00" but historically prefers "+0000" — the SDK
    # tolerates either. Use strftime %z which emits ±HHMM.
    return dt.strftime("%Y-%m-%d %H:%M:%S%z")


def _build_click_conversion(client, booking: dict, conversion_action_resource: str):
    """Map a booking doc → ClickConversion proto ready for upload."""
    utm = booking.get("utm") or {}
    gclid = (utm.get("gclid") or "").strip()
    if not gclid:
        raise ValueError(f"booking {booking.get('id')} has no gclid")

    gross, profit = _booking_gross_and_profit(booking)
    if profit <= 0:
        raise ValueError(f"booking {booking.get('id')} has no positive value")

    # Conversion date = when payment was captured (best signal for Smart
    # Bidding) — fall back to booking creation time if we lack a paid_at.
    when = booking.get("paid_at") or booking.get("created_at") or \
        datetime.now(timezone.utc).isoformat()

    cc = client.get_type("ClickConversion")
    cc.gclid = gclid
    cc.conversion_action = conversion_action_resource
    cc.conversion_date_time = _iso_to_google_ads_datetime(when)
    cc.conversion_value = float(profit)
    cc.currency_code = "USD"
    # order_id enables future ConversionAdjustments (refunds/cancellations)
    # and provides a secondary dedup key on Google's side.
    cc.order_id = str(booking.get("id"))
    return cc


# --------- Upload core (idempotent) ---------

async def upload_booking_to_google_ads(booking_id: str, *, force: bool = False) -> dict:
    """Upload a single booking as an offline conversion. Idempotent:
    if the booking already has google_ads_conversion_uploaded=True and force
    is False, returns a no-op. Marks the booking with upload metadata on
    success or failure so operators can audit history in the DB.
    """
    b = await db.bookings.find_one({"id": booking_id}, {"_id": 0})
    if not b:
        return {"ok": False, "booking_id": booking_id, "error": "booking not found"}

    if b.get("google_ads_conversion_uploaded") and not force:
        return {"ok": True, "booking_id": booking_id, "skipped": "already_uploaded"}

    # Internal-test exclusion — bookings whose customer email matches an
    # entry in GOOGLE_ADS_EXCLUDED_EMAILS (comma-separated env var) are NEVER
    # uploaded as conversions. This keeps Adam's own test bookings + admin
    # QA runs + affiliate-partner test purchases out of Smart Bidding's
    # training data, where they'd inflate value and skew optimization.
    excluded_raw = os.environ.get("GOOGLE_ADS_EXCLUDED_EMAILS", "").strip()
    if excluded_raw:
        excluded = {e.strip().lower() for e in excluded_raw.split(",") if e.strip()}
        email = (b.get("email") or "").strip().lower()
        if email and email in excluded:
            logger.info(f"[google_ads] skipping booking {booking_id}: email {email} is in excluded list")
            return {"ok": True, "booking_id": booking_id, "skipped": "excluded_email"}

    # Resolve gclid from ALL possible sources — booking.utm, forward join
    # (booking.quote_request_id → quote), or reverse join (quote.booking_id ==
    # this booking.id). Historic bookings often have gclid only on the parent
    # quote_request, so the reverse join is critical for recovery.
    effective_utm, _parent_qid = await _resolve_booking_quote_utm(b)
    resolved_gclid = (effective_utm.get("gclid") or "").strip()
    if not resolved_gclid:
        # No gclid anywhere — nothing to send to Google Ads. Not an error.
        return {"ok": True, "booking_id": booking_id, "skipped": "no_gclid"}
    # Stamp the resolved utm on the booking (best-effort) so subsequent
    # aggregations don't need to re-do the reverse lookup.
    try:
        if not (b.get("utm") or {}).get("gclid"):
            await db.bookings.update_one({"id": booking_id}, {"$set": {"utm": effective_utm}})
            b["utm"] = effective_utm
    except Exception:
        pass

    try:
        client = _get_google_ads_client()
    except HTTPException as e:
        # config error — persist so admin UI can flag it
        await _mark_upload_result(booking_id, ok=False, error=str(e.detail))
        return {"ok": False, "booking_id": booking_id, "error": str(e.detail)}

    conversion_action_resource = _active_conversion_action_resource()
    try:
        cc = _build_click_conversion(client, b, conversion_action_resource)
    except Exception as e:
        await _mark_upload_result(booking_id, ok=False, error=f"build failed: {e}")
        return {"ok": False, "booking_id": booking_id, "error": str(e)}

    upload_service = client.get_service("ConversionUploadService")
    customer_id = os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "").strip()
    try:
        # Sync SDK — offload to a thread so we don't block the event loop.
        import asyncio
        response = await asyncio.to_thread(
            upload_service.upload_click_conversions,
            customer_id=customer_id,
            conversions=[cc],
            partial_failure=True,
        )
    except Exception as e:
        err = f"upload_click_conversions failed: {e}"
        logger.exception(err)
        await _mark_upload_result(booking_id, ok=False, error=err[:500])
        return {"ok": False, "booking_id": booking_id, "error": err}

    # Serialize the full response ONCE so we can persist it on both success
    # and failure branches — this is the only paper trail we get for
    # diagnosing "silent success" cases downstream in Google's reporting.
    raw_response = _proto_to_dict(response)
    logger.info(f"[google_ads] booking {booking_id} raw response: {json.dumps(raw_response)[:2000]}")

    # Google returns partial_failure_error on batch-level failures even
    # when the batch had only one item.
    pf = getattr(response, "partial_failure_error", None)
    if pf and getattr(pf, "message", None):
        err = f"partial_failure: {pf.message}"
        logger.warning(f"[google_ads] booking {booking_id}: {err}")
        await _mark_upload_result(booking_id, ok=False, error=err[:500], raw_response=raw_response)
        return {"ok": False, "booking_id": booking_id, "error": err, "raw_response": raw_response}

    # Success — result may be empty struct if the row failed silently.
    results = list(getattr(response, "results", []) or [])
    if not results or not getattr(results[0], "gclid", None):
        err = "no result returned (row likely rejected — check conversion action & gclid)"
        logger.warning(f"[google_ads] booking {booking_id}: {err}")
        await _mark_upload_result(booking_id, ok=False, error=err, raw_response=raw_response)
        return {"ok": False, "booking_id": booking_id, "error": err, "raw_response": raw_response}

    gross, profit = _booking_gross_and_profit(b)
    await _mark_upload_result(
        booking_id,
        ok=True,
        conversion_action=conversion_action_resource,
        gross=gross,
        profit=profit,
        raw_response=raw_response,
    )
    return {
        "ok": True,
        "booking_id": booking_id,
        "conversion_action": conversion_action_resource,
        "value_uploaded": profit,
        "raw_response": raw_response,
    }


async def _mark_upload_result(
    booking_id: str,
    *,
    ok: bool,
    conversion_action: Optional[str] = None,
    gross: Optional[float] = None,
    profit: Optional[float] = None,
    error: Optional[str] = None,
    raw_response: Optional[dict] = None,
) -> None:
    """Persist upload outcome onto the booking so admin UI can show history
    and operators can audit failures.

    `raw_response` — the full Google Ads UploadClickConversionsResponse
    serialized to a dict via _proto_to_dict. Preserved on BOTH success and
    failure so operators can diagnose "silent success" cases where the API
    echoed back the row but the downstream reporting pipeline dropped it
    (common when the conversion action isn't set up as Import→Clicks type).
    """
    now = datetime.now(timezone.utc).isoformat()
    upd: dict = {"google_ads_last_upload_at": now}
    if ok:
        upd.update({
            "google_ads_conversion_uploaded": True,
            "google_ads_upload_status": "success",
            "google_ads_conversion_action": conversion_action,
            "google_ads_conversion_value": profit,
            "google_ads_conversion_gross": gross,
            "google_ads_upload_error": None,
        })
    else:
        upd.update({
            "google_ads_upload_status": "failed",
            "google_ads_upload_error": (error or "")[:500],
        })
    if raw_response is not None:
        # Keep only the last-attempt's raw response to bound doc size — this
        # is diagnostic data, not an audit log. Also stash a short pointer to
        # the response's job_id so operators can correlate with Google's
        # conversion-import history page.
        upd["google_ads_last_raw_response"] = raw_response
        job_id = raw_response.get("jobId") if isinstance(raw_response, dict) else None
        if job_id:
            upd["google_ads_last_job_id"] = str(job_id)
    try:
        await db.bookings.update_one({"id": booking_id}, {"$set": upd})
    except Exception as e:
        logger.warning(f"[google_ads] failed to persist upload result for {booking_id}: {e}")


# --------- Admin API endpoints ---------

@router.get("/admin/google-ads/status")
async def google_ads_status(_: dict = Depends(require_admin)):
    """Config health check — reports which env vars are set (masked) and
    which conversion action is currently active. Does NOT hit Google's API
    (kept cheap so the admin UI can call it on every tab open).
    """
    def _present(k: str) -> bool:
        return bool(os.environ.get(k, "").strip())
    def _mask(v: str) -> str:
        if not v:
            return ""
        return f"{v[:6]}…{v[-4:]}" if len(v) > 12 else "***"

    active_id = os.environ.get("GOOGLE_ADS_ACTIVE_CONVERSION_ACTION_ID", "")
    test_id = os.environ.get("GOOGLE_ADS_TEST_CONVERSION_ACTION_ID", "")
    profit_id = os.environ.get("GOOGLE_ADS_PROFIT_CONVERSION_ACTION_ID", "")

    return {
        "configured": all(_present(k) for k in [
            "GOOGLE_ADS_DEVELOPER_TOKEN",
            "GOOGLE_ADS_CLIENT_ID",
            "GOOGLE_ADS_CLIENT_SECRET",
            "GOOGLE_ADS_REFRESH_TOKEN",
            "GOOGLE_ADS_CUSTOMER_ID",
        ]),
        "developer_token": _mask(os.environ.get("GOOGLE_ADS_DEVELOPER_TOKEN", "")),
        "client_id_present": _present("GOOGLE_ADS_CLIENT_ID"),
        "client_secret_present": _present("GOOGLE_ADS_CLIENT_SECRET"),
        "refresh_token_present": _present("GOOGLE_ADS_REFRESH_TOKEN"),
        "customer_id": os.environ.get("GOOGLE_ADS_CUSTOMER_ID", ""),
        "login_customer_id": os.environ.get("GOOGLE_ADS_LOGIN_CUSTOMER_ID", ""),
        "active_conversion_action_id": active_id,
        "active_is_test": active_id == test_id,
        "active_is_profit": active_id == profit_id,
        "test_conversion_action_id": test_id,
        "profit_conversion_action_id": profit_id,
    }


@router.post("/admin/google-ads/ping")
async def google_ads_ping(_: dict = Depends(require_admin)):
    """Actually calls Google — lists accessible customers as a cheap creds
    check. Confirms developer token + refresh token + client id/secret are
    all valid without touching conversion data.
    """
    try:
        client = _get_google_ads_client()
        service = client.get_service("CustomerService")
        import asyncio
        resource_names = await asyncio.to_thread(
            lambda: list(service.list_accessible_customers().resource_names or [])
        )
        return {"ok": True, "accessible_customers": resource_names}
    except HTTPException:
        raise
    except Exception as e:
        logger.exception("google_ads_ping failed")
        return {"ok": False, "error": str(e)[:500]}


class ManualUploadRequest(BaseModel):
    booking_id: str
    force: bool = False


@router.post("/admin/google-ads/upload-booking")
async def admin_upload_booking(payload: ManualUploadRequest, _: dict = Depends(require_admin)):
    """Manually upload a single booking as an offline conversion. Useful for
    admin-triggered smoke tests before flipping over to production.
    """
    return await upload_booking_to_google_ads(payload.booking_id, force=payload.force)


@router.post("/admin/google-ads/backfill")
async def admin_backfill_google_ads(
    background_tasks: BackgroundTasks,
    days: int = Query(30, ge=1, le=365),
    force: bool = Query(False),
    _: dict = Depends(require_admin),
):
    """Kick off a background job that uploads every paid booking in the last
    `days` days that has a recoverable gclid — checking both the booking's
    utm.gclid AND the linked quote_request's utm.gclid. Runs off-request so
    hundreds of rows can be processed without blocking the admin UI.

    Matches the /backfill-preview join direction so counts always agree.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # Collect booking IDs from BOTH sides:
    # 1. Bookings with utm.gclid stored directly
    # 2. Won quote_requests with utm.gclid → their linked booking
    booking_ids: set[str] = set()

    async for b in db.bookings.find(
        {
            "created_at": {"$gte": cutoff},
            "payment_status": {"$in": ["paid", "deposit_paid"]},
            "utm.gclid": {"$exists": True, "$ne": ""},
        },
        {"_id": 0, "id": 1, "google_ads_conversion_uploaded": 1},
    ):
        if force or not b.get("google_ads_conversion_uploaded"):
            booking_ids.add(b["id"])

    async for q in db.quote_requests.find(
        {
            "status": "won",
            "created_at": {"$gte": cutoff},
            "booking_id": {"$exists": True, "$ne": None},
            "utm.gclid": {"$exists": True, "$ne": ""},
        },
        {"_id": 0, "booking_id": 1},
    ):
        bid = q.get("booking_id")
        if not bid or bid in booking_ids:
            continue
        # Confirm the linked booking is actually paid and (unless force) not yet uploaded
        linked = await db.bookings.find_one(
            {"id": bid, "payment_status": {"$in": ["paid", "deposit_paid"]}},
            {"_id": 0, "id": 1, "google_ads_conversion_uploaded": 1},
        )
        if not linked:
            continue
        if force or not linked.get("google_ads_conversion_uploaded"):
            booking_ids.add(bid)

    ids_list = list(booking_ids)

    async def _run():
        for bid in ids_list:
            try:
                await upload_booking_to_google_ads(bid, force=force)
            except Exception as e:
                logger.warning(f"[google_ads backfill] {bid} failed: {e}")

    background_tasks.add_task(_run)
    return {
        "queued": len(ids_list),
        "days": days,
        "force": force,
        "note": "Uploads run in the background — refresh Attribution tab in ~1 min to see updated counts.",
    }


@router.get("/admin/google-ads/recent-uploads")
async def admin_recent_uploads(
    days: int = Query(30, ge=1, le=365),
    _: dict = Depends(require_admin),
):
    """Return the last N days of upload attempts (success + failure) so the
    admin UI can render a status table.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    rows = await db.bookings.find(
        {"google_ads_last_upload_at": {"$gte": cutoff}},
        {
            "_id": 0, "id": 1, "confirmation_number": 1, "email": 1,
            "amount": 1, "affiliate_cost": 1,
            "google_ads_upload_status": 1,
            "google_ads_conversion_value": 1,
            "google_ads_conversion_action": 1,
            "google_ads_last_upload_at": 1,
            "google_ads_upload_error": 1,
        },
    ).sort("google_ads_last_upload_at", -1).limit(200).to_list(length=200)
    ok = sum(1 for r in rows if r.get("google_ads_upload_status") == "success")
    failed = sum(1 for r in rows if r.get("google_ads_upload_status") == "failed")
    return {"total": len(rows), "success": ok, "failed": failed, "rows": rows}


@router.get("/admin/google-ads/backfill-preview")
async def admin_backfill_preview(
    days: int = Query(90, ge=1, le=365),
    _: dict = Depends(require_admin),
):
    """Dry-run inspector — counts recoverable bookings without uploading anything.

    Iterates from `quote_requests` (the source of truth for gclid) and joins to
    bookings via `quote.booking_id` — SAME direction as the Quote Conversions CSV
    endpoint, so this preview and the CSV are guaranteed to agree.

    Also counts paid bookings that have NO linked quote (direct booking form
    submissions) so operators see the full picture — those may still have utm
    stored directly on the booking (recoverable) or nothing at all (unrecoverable).
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()

    # --- Pass 1: iterate quote_requests → join bookings by quote.booking_id ---
    total_paid_bookings = 0
    total_revenue = 0.0
    total_profit_recoverable = 0.0
    already_uploaded = 0
    gclid_on_booking = 0
    gclid_via_parent_quote = 0
    unrecoverable = 0
    unrecoverable_samples: list[dict] = []
    booked_ids_seen: set[str] = set()

    won_quotes = await db.quote_requests.find(
        {"status": "won", "created_at": {"$gte": cutoff}, "booking_id": {"$exists": True, "$ne": None}},
        {"_id": 0, "id": 1, "utm": 1, "booking_id": 1, "full_name": 1, "email": 1, "created_at": 1},
    ).to_list(length=5000)

    for q in won_quotes:
        bid = q.get("booking_id")
        if not bid:
            continue
        b = await db.bookings.find_one(
            {"id": bid},
            {"_id": 0, "id": 1, "utm": 1, "amount": 1, "amount_paid": 1,
             "total_amount": 1, "quote_amount": 1, "affiliate_cost": 1,
             "payment_status": 1, "google_ads_conversion_uploaded": 1,
             "confirmation_number": 1, "email": 1, "created_at": 1},
        )
        if not b:
            continue
        # Only count real paid bookings (matches Attribution source table
        # semantics — includes deposit_paid, confirmed, paid states).
        pay = (b.get("payment_status") or "").lower()
        if pay not in ("paid", "deposit_paid"):
            continue

        booked_ids_seen.add(bid)
        total_paid_bookings += 1

        # Revenue
        gross = 0.0
        for k in ("amount", "amount_paid", "total_amount", "quote_amount"):
            v = b.get(k)
            if isinstance(v, (int, float)) and v > 0:
                gross = float(v)
                break
        total_revenue += gross
        aff = b.get("affiliate_cost")
        profit_val = gross
        if isinstance(aff, (int, float)) and aff > 0 and gross > 0:
            profit_val = max(0.0, gross - float(aff))

        if b.get("google_ads_conversion_uploaded"):
            already_uploaded += 1

        # gclid recovery — check both sides
        booking_utm = b.get("utm") or {}
        quote_utm = q.get("utm") or {}
        if (booking_utm.get("gclid") or "").strip():
            gclid_on_booking += 1
            total_profit_recoverable += profit_val
        elif (quote_utm.get("gclid") or "").strip():
            gclid_via_parent_quote += 1
            total_profit_recoverable += profit_val
        else:
            unrecoverable += 1
            if len(unrecoverable_samples) < 10:
                unrecoverable_samples.append({
                    "id": b.get("id"),
                    "confirmation_number": b.get("confirmation_number"),
                    "email": b.get("email") or q.get("email"),
                    "created_at": b.get("created_at") or q.get("created_at"),
                    "utm_source_stored": (booking_utm.get("utm_source") or quote_utm.get("utm_source") or None),
                    "has_quote_link": True,
                    "quote_id": q.get("id"),
                })

    # --- Pass 2: paid bookings with NO linked won-quote (direct booking form) ---
    # These wouldn't show up in Pass 1 because they were never quoted. We check
    # if they have utm.gclid directly on the booking (only recoverable path).
    direct_bookings = await db.bookings.find(
        {
            "created_at": {"$gte": cutoff},
            "payment_status": {"$in": ["paid", "deposit_paid"]},
            "id": {"$nin": list(booked_ids_seen)} if booked_ids_seen else {"$exists": True},
        },
        {"_id": 0, "id": 1, "utm": 1, "amount": 1, "amount_paid": 1,
         "total_amount": 1, "quote_amount": 1, "affiliate_cost": 1,
         "google_ads_conversion_uploaded": 1, "confirmation_number": 1,
         "email": 1, "created_at": 1, "quote_request_id": 1},
    ).to_list(length=5000)

    for b in direct_bookings:
        total_paid_bookings += 1
        gross = 0.0
        for k in ("amount", "amount_paid", "total_amount", "quote_amount"):
            v = b.get(k)
            if isinstance(v, (int, float)) and v > 0:
                gross = float(v)
                break
        total_revenue += gross
        aff = b.get("affiliate_cost")
        profit_val = gross
        if isinstance(aff, (int, float)) and aff > 0 and gross > 0:
            profit_val = max(0.0, gross - float(aff))

        if b.get("google_ads_conversion_uploaded"):
            already_uploaded += 1

        booking_utm = b.get("utm") or {}
        if (booking_utm.get("gclid") or "").strip():
            gclid_on_booking += 1
            total_profit_recoverable += profit_val
        else:
            unrecoverable += 1
            if len(unrecoverable_samples) < 10:
                unrecoverable_samples.append({
                    "id": b.get("id"),
                    "confirmation_number": b.get("confirmation_number"),
                    "email": b.get("email"),
                    "created_at": b.get("created_at"),
                    "utm_source_stored": booking_utm.get("utm_source"),
                    "has_quote_link": False,
                    "quote_id": None,
                })

    recoverable_total = gclid_on_booking + gclid_via_parent_quote
    return {
        "days": days,
        "total_paid_bookings": total_paid_bookings,
        "total_revenue": round(total_revenue, 2),
        "total_profit_recoverable": round(total_profit_recoverable, 2),
        "already_uploaded_to_google": already_uploaded,
        "gclid_directly_on_booking": gclid_on_booking,
        "gclid_via_parent_quote": gclid_via_parent_quote,
        "recoverable_total": recoverable_total,
        "permanently_unrecoverable": unrecoverable,
        "recoverable_pct": round(100.0 * recoverable_total / total_paid_bookings, 1) if total_paid_bookings else 0.0,
        "sample_unrecoverable_bookings": unrecoverable_samples,
        "note": (
            "Recoverable = stored gclid on the booking OR on its linked quote_request. "
            "This preview iterates quote_requests (matching the Quote Conversions CSV's "
            "join direction) — the same booking will always be counted the same way in both views."
        ),
    }


class SwitchConversionActionRequest(BaseModel):
    target: str  # "test" | "profit"


@router.post("/admin/google-ads/switch-active-action")
async def admin_switch_active_action(
    payload: SwitchConversionActionRequest,
    _: dict = Depends(require_admin),
):
    """Flip GOOGLE_ADS_ACTIVE_CONVERSION_ACTION_ID between Test and Profit
    IDs in-process (env-var override). Persists in memory only — for the
    permanent flip, edit backend/.env and restart. This endpoint is for
    a quick toggle during smoke testing.
    """
    if payload.target not in ("test", "profit"):
        raise HTTPException(status_code=400, detail="target must be 'test' or 'profit'")
    src_key = "GOOGLE_ADS_TEST_CONVERSION_ACTION_ID" if payload.target == "test" \
        else "GOOGLE_ADS_PROFIT_CONVERSION_ACTION_ID"
    new_id = os.environ.get(src_key, "")
    if not new_id:
        raise HTTPException(status_code=500, detail=f"{src_key} not set in env")
    os.environ["GOOGLE_ADS_ACTIVE_CONVERSION_ACTION_ID"] = new_id
    return {"ok": True, "target": payload.target, "active_conversion_action_id": new_id}



# --------- Diagnostic endpoints (Iteration 52 — silent-drop root cause) ---------

@router.get("/admin/google-ads/inspect-action")
async def inspect_conversion_action(
    action_id: str = Query(..., description="Numeric conversion action ID, e.g. 7671967367"),
    _: dict = Depends(require_admin),
):
    """Query Google Ads' ConversionActionService for the actual metadata of a
    conversion action so operators can verify it is SET UP to receive
    click-conversion uploads.

    An action can exist at the API level (return a valid resource name) AND
    accept API upload requests (return a "success" response with the row
    echoed back) but STILL silently drop every uploaded conversion because
    its `type` isn't `UPLOAD_CLICKS`, its `status` isn't `ENABLED`, or its
    Import wizard was never completed in the Ads UI. This endpoint reads
    the truth directly from Google so we stop guessing.

    Returns type / status / category / origin / primary_for_goal / include_in_conversions_metric
    plus a `verdict` field summarizing whether the action can currently
    receive offline click uploads.
    """
    try:
        client = _get_google_ads_client()
    except HTTPException as e:
        raise e
    customer_id = os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "").strip()
    ga_service = client.get_service("GoogleAdsService")
    query = (
        "SELECT conversion_action.id, conversion_action.name, "
        "conversion_action.type, conversion_action.status, conversion_action.origin, "
        "conversion_action.category, conversion_action.primary_for_goal, "
        "conversion_action.include_in_conversions_metric, "
        "conversion_action.click_through_lookback_window_days, "
        "conversion_action.view_through_lookback_window_days, "
        "conversion_action.attribution_model_settings.attribution_model, "
        "conversion_action.value_settings.default_value, "
        "conversion_action.value_settings.default_currency_code, "
        "conversion_action.counting_type "
        "FROM conversion_action "
        f"WHERE conversion_action.id = {action_id}"
    )
    import asyncio
    try:
        stream = await asyncio.to_thread(
            ga_service.search,
            customer_id=customer_id,
            query=query,
        )
        rows = list(stream)
    except Exception as e:
        logger.exception(f"inspect_conversion_action failed for {action_id}: {e}")
        raise HTTPException(status_code=502, detail=f"Google Ads API error: {e}")

    if not rows:
        return {
            "action_id": action_id,
            "found": False,
            "verdict": "action_not_found",
            "explanation": (
                "Google returned zero rows for this conversion_action.id. Either the ID is wrong, "
                "the action was deleted, or the linked customer_id (GOOGLE_ADS_CUSTOMER_ID) doesn't own it."
            ),
        }

    ca = rows[0].conversion_action
    action_dict = _proto_to_dict(ca) or {}

    # Enum names — proto-plus returns them as int values by default; use
    # .name for readability. Wrap in try because some SDK versions serialize
    # enums as strings already.
    def _enum_name(pb_val):
        try:
            return pb_val.name
        except AttributeError:
            return str(pb_val)

    type_name = _enum_name(ca.type_)
    status_name = _enum_name(ca.status)
    origin_name = _enum_name(ca.origin)
    category_name = _enum_name(ca.category)

    # Verdict — can this action receive server-side click conversion uploads?
    #   type_ MUST be UPLOAD_CLICKS (not WEBPAGE, APP_INSTALL, APP_IN_APP_ACTION, PHONE_CALL_FROM_ADS, etc.)
    #   status MUST be ENABLED (not REMOVED, HIDDEN)
    #   include_in_conversions_metric SHOULD be True so it counts in reports
    can_receive = type_name == "UPLOAD_CLICKS" and status_name == "ENABLED"
    verdict_bits = []
    if type_name != "UPLOAD_CLICKS":
        verdict_bits.append(
            f"type is '{type_name}', must be 'UPLOAD_CLICKS' (i.e. Import → Other data sources → Track clicks). "
            "Recreate the conversion action with source=Import, type=Clicks."
        )
    if status_name != "ENABLED":
        verdict_bits.append(
            f"status is '{status_name}', must be 'ENABLED'. If it shows 'Inactive / Set up import' in the "
            "Ads UI, the Import wizard was never completed — click into the action and finish the setup."
        )
    if ca.include_in_conversions_metric is False:
        verdict_bits.append(
            "include_in_conversions_metric is False — action exists but won't count in Ads reports. "
            "Toggle it back on in the action settings."
        )

    return {
        "action_id": action_id,
        "found": True,
        "name": ca.name,
        "type": type_name,
        "status": status_name,
        "origin": origin_name,
        "category": category_name,
        "primary_for_goal": ca.primary_for_goal,
        "include_in_conversions_metric": ca.include_in_conversions_metric,
        "click_through_lookback_window_days": ca.click_through_lookback_window_days,
        "view_through_lookback_window_days": ca.view_through_lookback_window_days,
        "counting_type": _enum_name(ca.counting_type),
        "default_value": ca.value_settings.default_value,
        "default_currency": ca.value_settings.default_currency_code,
        "attribution_model": _enum_name(ca.attribution_model_settings.attribution_model),
        "verdict": "ready_to_receive" if can_receive else "not_ready",
        "verdict_reasons": verdict_bits,
        "raw": action_dict,
    }


@router.post("/admin/google-ads/reupload-with-diag/{booking_id}")
async def reupload_with_diagnostics(booking_id: str, _: dict = Depends(require_admin)):
    """Force-re-upload a booking to Google Ads AND return the FULL raw API
    response in the HTTP body — untruncated. Use this when a booking that
    already shows google_ads_conversion_uploaded=True in Mongo is missing
    from the Ads UI (silent-drop root-cause investigation).

    Sets force=True so it bypasses the idempotency guard and always attempts
    a fresh upload.
    """
    result = await upload_booking_to_google_ads(booking_id, force=True)
    return result


@router.get("/admin/google-ads/silent-drop-audit")
async def silent_drop_audit(_: dict = Depends(require_admin)):
    """List every booking marked as google_ads_conversion_uploaded=True and
    surface their raw stored responses — the single-view diagnostic for the
    "we uploaded 2, Ads shows 0" investigation.
    """
    rows = []
    async for b in db.bookings.find(
        {"google_ads_conversion_uploaded": True},
        {"_id": 0, "id": 1, "email": 1, "created_at": 1, "utm": 1,
         "google_ads_conversion_action": 1, "google_ads_conversion_value": 1,
         "google_ads_last_upload_at": 1, "google_ads_last_raw_response": 1,
         "google_ads_last_job_id": 1, "google_ads_upload_error": 1},
    ):
        gclid = (b.get("utm") or {}).get("gclid") or ""
        rows.append({
            "booking_id": b["id"],
            "email": b.get("email"),
            "created_at": b.get("created_at"),
            "gclid": gclid,
            "gclid_looks_real": bool(gclid) and len(gclid) >= 30 and gclid[:2] in ("EA", "Cj", "CJ", "CN", "EN", "CI", "CL"),
            "conversion_action_sent": b.get("google_ads_conversion_action"),
            "value_sent": b.get("google_ads_conversion_value"),
            "job_id": b.get("google_ads_last_job_id"),
            "last_upload_at": b.get("google_ads_last_upload_at"),
            "raw_response": b.get("google_ads_last_raw_response"),
        })
    return {"count": len(rows), "rows": rows}
