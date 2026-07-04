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
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel

router = APIRouter()
logger = logging.getLogger(__name__)

# Pull db / require_admin / helpers from server module — same pattern as
# routes/admin.py. This avoids circular imports at module load time.
import server as _server  # noqa: E402
db = _server.db
require_admin = _server.require_admin


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
    """
    gross = 0.0
    for k in ("amount", "amount_paid", "total_amount", "quote_amount"):
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

    utm = b.get("utm") or {}
    if not (utm.get("gclid") or "").strip():
        # No gclid → nothing to send to Google Ads. Not an error — just a no-op.
        return {"ok": True, "booking_id": booking_id, "skipped": "no_gclid"}

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

    # Google returns partial_failure_error on batch-level failures even
    # when the batch had only one item.
    pf = getattr(response, "partial_failure_error", None)
    if pf and getattr(pf, "message", None):
        err = f"partial_failure: {pf.message}"
        logger.warning(f"[google_ads] booking {booking_id}: {err}")
        await _mark_upload_result(booking_id, ok=False, error=err[:500])
        return {"ok": False, "booking_id": booking_id, "error": err}

    # Success — result may be empty struct if the row failed silently.
    results = list(getattr(response, "results", []) or [])
    if not results or not getattr(results[0], "gclid", None):
        err = "no result returned (row likely rejected — check conversion action & gclid)"
        logger.warning(f"[google_ads] booking {booking_id}: {err}")
        await _mark_upload_result(booking_id, ok=False, error=err)
        return {"ok": False, "booking_id": booking_id, "error": err}

    gross, profit = _booking_gross_and_profit(b)
    await _mark_upload_result(
        booking_id,
        ok=True,
        conversion_action=conversion_action_resource,
        gross=gross,
        profit=profit,
    )
    return {
        "ok": True,
        "booking_id": booking_id,
        "conversion_action": conversion_action_resource,
        "value_uploaded": profit,
    }


async def _mark_upload_result(
    booking_id: str,
    *,
    ok: bool,
    conversion_action: Optional[str] = None,
    gross: Optional[float] = None,
    profit: Optional[float] = None,
    error: Optional[str] = None,
) -> None:
    """Persist upload outcome onto the booking so admin UI can show history
    and operators can audit failures.
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
    `days` days that (a) has a gclid, (b) hasn't been uploaded yet (unless
    force=true). Runs off-request so it can process hundreds of rows without
    blocking the admin UI.
    """
    cutoff = (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()
    query: dict = {
        "created_at": {"$gte": cutoff},
        "payment_status": "paid",
        "utm.gclid": {"$exists": True, "$ne": ""},
    }
    if not force:
        query["google_ads_conversion_uploaded"] = {"$ne": True}

    candidates = await db.bookings.find(query, {"_id": 0, "id": 1}).to_list(length=1000)
    booking_ids = [c["id"] for c in candidates]

    async def _run():
        for bid in booking_ids:
            try:
                await upload_booking_to_google_ads(bid, force=force)
            except Exception as e:
                logger.warning(f"[google_ads backfill] {bid} failed: {e}")

    background_tasks.add_task(_run)
    return {
        "queued": len(booking_ids),
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
