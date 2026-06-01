"""
Social OAuth identity verification for TuranEliteLimo.

Verifies Apple and Google ID tokens server-side. Mobile clients obtain a
short-lived ID token from the native SDK (`expo-apple-authentication` or
`@react-native-google-signin/google-signin`) and POST it to our backend.
We never trust the client — we verify the token's signature, issuer, audience,
and expiration against the provider's published JWKS before we'll consider
the user authenticated.

Configure via env vars:
  APPLE_BUNDLE_ID         = com.turanelitelimo.app          (iOS audience)
  APPLE_SERVICES_ID       = com.turanelitelimo.app.web      (optional - web/Android)
  GOOGLE_IOS_CLIENT_ID    = NNN-xxx.apps.googleusercontent.com
  GOOGLE_ANDROID_CLIENT_ID= NNN-xxx.apps.googleusercontent.com
  GOOGLE_WEB_CLIENT_ID    = NNN-xxx.apps.googleusercontent.com
"""

from __future__ import annotations

import os
from typing import Any, Dict, List

import requests
from fastapi import HTTPException, status
from jose import jwt as jose_jwt
from google.oauth2 import id_token as google_id_token
from google.auth.transport import requests as google_requests


# ---------- Apple ----------

APPLE_KEYS_URL = "https://appleid.apple.com/auth/keys"
APPLE_ISSUER = "https://appleid.apple.com"

_apple_keys_cache: Dict[str, Any] = {}


def _apple_audiences() -> List[str]:
    return [a for a in [
        os.environ.get("APPLE_BUNDLE_ID"),
        os.environ.get("APPLE_SERVICES_ID"),
    ] if a]


def _fetch_apple_keys(force_refresh: bool = False) -> Dict[str, Dict[str, Any]]:
    global _apple_keys_cache
    if force_refresh or not _apple_keys_cache:
        resp = requests.get(APPLE_KEYS_URL, timeout=5)
        resp.raise_for_status()
        _apple_keys_cache = {k["kid"]: k for k in resp.json().get("keys", [])}
    return _apple_keys_cache


def verify_apple_id_token(id_token_str: str) -> Dict[str, Any]:
    """Verify an Apple identity token and return its claims.

    Raises HTTPException(401) on any failure.
    """
    audiences = _apple_audiences()
    if not audiences:
        raise HTTPException(status_code=500, detail="Apple sign-in is not configured on the server.")

    try:
        unverified_header = jose_jwt.get_unverified_header(id_token_str)
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Apple token header: {e}")

    kid = unverified_header.get("kid")
    alg = unverified_header.get("alg") or "RS256"
    if not kid:
        raise HTTPException(status_code=401, detail="Missing key id in Apple token")

    keys = _fetch_apple_keys()
    key_data = keys.get(kid)
    if key_data is None:
        # Key rotation — refresh once
        keys = _fetch_apple_keys(force_refresh=True)
        key_data = keys.get(kid)
        if key_data is None:
            raise HTTPException(status_code=401, detail="No matching Apple public key")

    try:
        # python-jose accepts JWK dicts directly
        claims = jose_jwt.decode(
            id_token_str,
            key_data,
            algorithms=[alg],
            audience=audiences,
            issuer=APPLE_ISSUER,
            options={"verify_at_hash": False},
        )
    except jose_jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Apple token expired")
    except Exception as e:
        raise HTTPException(status_code=401, detail=f"Invalid Apple token: {e}")

    return claims


# ---------- Google ----------

GOOGLE_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


def _google_audiences() -> List[str]:
    return [a for a in [
        os.environ.get("GOOGLE_IOS_CLIENT_ID"),
        os.environ.get("GOOGLE_ANDROID_CLIENT_ID"),
        os.environ.get("GOOGLE_WEB_CLIENT_ID"),
    ] if a]


def verify_google_id_token(id_token_str: str) -> Dict[str, Any]:
    """Verify a Google identity token and return its claims.

    Accepts tokens whose `aud` matches any of our iOS/Android/Web client IDs.
    """
    audiences = _google_audiences()
    if not audiences:
        raise HTTPException(status_code=500, detail="Google sign-in is not configured on the server.")

    try:
        # google-auth requires a single audience or list — pass a list explicitly
        claims = google_id_token.verify_oauth2_token(
            id_token_str,
            google_requests.Request(),
            audience=audiences,
        )
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid Google token: {e}")

    if claims.get("iss") not in GOOGLE_ISSUERS:
        raise HTTPException(status_code=401, detail="Invalid Google issuer")
    if not claims.get("email"):
        raise HTTPException(status_code=400, detail="Google account missing email")
    if not claims.get("email_verified"):
        raise HTTPException(status_code=400, detail="Google account email not verified")

    return claims
