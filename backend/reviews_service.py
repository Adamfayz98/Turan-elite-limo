"""Public reviews aggregator — pulls Google + Yelp reviews if their keys/IDs are set,
otherwise falls back to a small set of hand-picked testimonials."""
from __future__ import annotations

import os
import logging
import time
from typing import List, Optional

import httpx

logger = logging.getLogger(__name__)

# In-memory cache so we don't hit Google/Yelp on every page load
_CACHE: dict = {"reviews": None, "fetched_at": 0.0}
_CACHE_TTL_SECONDS = 60 * 60 * 6  # 6 hours

HANDPICKED_FALLBACK = [
    {
        "source": "handpicked",
        "rating": 5,
        "author": "Aisha & Jordan",
        "text": "Booked TuranEliteLimo for our wedding party in Napa. The chauffeur was on time to the second, the limo was immaculate, and the bride cried (happy tears). Worth every penny.",
        "context": "Wedding · Calistoga",
    },
    {
        "source": "handpicked",
        "rating": 5,
        "author": "Marcus L.",
        "text": "I run a roadshow across SF, Palo Alto and SJ every quarter. TuranEliteLimo is the only service I trust to keep our team on schedule. Their dispatchers are unreal.",
        "context": "Managing Director · Goldman",
    },
    {
        "source": "handpicked",
        "rating": 5,
        "author": "Priya R.",
        "text": "Flight delayed three hours from Heathrow. Driver was still there waiting with a sign and a cold water. Five stars don't cut it.",
        "context": "Frequent Traveler · SFO",
    },
]


async def _fetch_google_reviews() -> List[dict]:
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY", "").strip()
    place_id = os.environ.get("GOOGLE_PLACE_ID", "").strip()
    if not api_key or not place_id:
        return []
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get(
                "https://maps.googleapis.com/maps/api/place/details/json",
                params={
                    "place_id": place_id,
                    "fields": "name,rating,reviews,user_ratings_total,url",
                    "key": api_key,
                    "reviews_no_translations": "true",
                    "reviews_sort": "newest",
                },
            )
            data = r.json()
    except Exception as e:
        logger.warning(f"Google reviews fetch failed: {e}")
        return []

    reviews = (data.get("result") or {}).get("reviews") or []
    out: List[dict] = []
    for r in reviews:
        rating = int(r.get("rating", 0))
        if rating < 4:
            continue  # only show happy customers on the public site
        out.append({
            "source": "google",
            "rating": rating,
            "author": r.get("author_name") or "Google User",
            "text": (r.get("text") or "")[:600],
            "context": r.get("relative_time_description") or "",
            "profile_photo_url": r.get("profile_photo_url") or "",
        })
    return out


async def _fetch_yelp_reviews() -> List[dict]:
    api_key = os.environ.get("YELP_API_KEY", "").strip()
    business_id = os.environ.get("YELP_BUSINESS_ID", "").strip()
    if not api_key or not business_id:
        return []
    try:
        async with httpx.AsyncClient(timeout=8.0) as cli:
            r = await cli.get(
                f"https://api.yelp.com/v3/businesses/{business_id}/reviews",
                headers={"Authorization": f"Bearer {api_key}"},
                params={"limit": 3, "sort_by": "newest"},
            )
            data = r.json()
    except Exception as e:
        logger.warning(f"Yelp reviews fetch failed: {e}")
        return []

    out: List[dict] = []
    for r in data.get("reviews", []):
        rating = int(r.get("rating", 0))
        if rating < 4:
            continue
        out.append({
            "source": "yelp",
            "rating": rating,
            "author": (r.get("user") or {}).get("name") or "Yelp User",
            "text": (r.get("text") or "")[:600],
            "context": (r.get("time_created") or "")[:10],
            "profile_photo_url": (r.get("user") or {}).get("image_url") or "",
        })
    return out


async def get_reviews(force_refresh: bool = False) -> dict:
    """Return merged + ranked reviews (Google + Yelp + handpicked fallback)."""
    now = time.time()
    if not force_refresh and _CACHE["reviews"] is not None and now - _CACHE["fetched_at"] < _CACHE_TTL_SECONDS:
        return _CACHE["reviews"]

    google = await _fetch_google_reviews()
    yelp = await _fetch_yelp_reviews()
    merged = google + yelp
    if not merged:
        merged = HANDPICKED_FALLBACK

    payload = {
        "reviews": merged[:9],
        "sources": {
            "google_configured": bool(os.environ.get("GOOGLE_PLACE_ID", "").strip()),
            "yelp_configured": bool(os.environ.get("YELP_BUSINESS_ID", "").strip()),
            "google_count": len(google),
            "yelp_count": len(yelp),
        },
    }
    _CACHE["reviews"] = payload
    _CACHE["fetched_at"] = now
    return payload


def review_links() -> dict:
    """Public-facing links customers click in the post-ride review-request email."""
    place_id = os.environ.get("GOOGLE_PLACE_ID", "").strip()
    yelp_url = os.environ.get("YELP_BUSINESS_URL", "").strip()
    google_url = (
        f"https://search.google.com/local/writereview?placeid={place_id}"
        if place_id else "https://www.google.com/search?q=TuranEliteLimo+Millbrae"
    )
    if not yelp_url:
        yelp_url = "https://www.yelp.com/search?find_desc=TuranEliteLimo&find_loc=Millbrae,+CA"
    return {"google": google_url, "yelp": yelp_url}
