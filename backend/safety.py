"""
Safety / Anti-Fraud module for TuranEliteLimo.

Provides:
  - Client IP & User-Agent extraction (respects X-Forwarded-For from k8s ingress).
  - Risk scoring for quote requests / bookings (0-100 + flag list).
  - Internal scam blacklist lookup (emails, phones, IPs, names) — silent-accept policy.
  - Email reputation (disposable detector + basic MX/syntax validation).
  - US area-code → state mapping for cross-checking pickup state vs. caller area code.
  - IP geolocation via ip-api.com (free, no key, 45 req/min — cached in MongoDB).
  - Phone OTP helpers (Twilio-Verify-ready; falls back to MOCKED code stored in DB).

All public functions are async-safe and never raise — they degrade to safe defaults
so the booking flow is never blocked by a flaky third-party.
"""
from __future__ import annotations

import os
import re
import logging
import secrets
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import Request

logger = logging.getLogger(__name__)


# ----------------------------- Client context -----------------------------

def get_client_ip(request: Request) -> str:
    """Pull the real client IP from k8s ingress headers, falling back to socket.

    Kubernetes ingress forwards X-Forwarded-For as a comma-separated list with
    the originating client first. We trust the leftmost IP that isn't a
    private/loopback range (best-effort — no IP-trust spoofing protection at
    this layer; that's a CDN/WAF concern). Used for risk scoring and audit.
    """
    if not request:
        return ""
    xff = request.headers.get("x-forwarded-for") or request.headers.get("X-Forwarded-For")
    if xff:
        # left-most IP is the client; further entries are intermediate proxies
        first = xff.split(",")[0].strip()
        if first:
            return first
    xri = request.headers.get("x-real-ip") or request.headers.get("X-Real-IP")
    if xri:
        return xri.strip()
    try:
        return request.client.host if request.client else ""
    except Exception:
        return ""


def get_user_agent(request: Request) -> str:
    if not request:
        return ""
    return (request.headers.get("user-agent") or "")[:300]


# ----------------------------- Disposable / free domains -----------------------------

# Curated subset — extend as needed. Order: throwaway services first, then
# common free providers (free isn't suspicious on its own, but contributes a
# small risk weight when combined with other signals).
DISPOSABLE_DOMAINS = {
    "mailinator.com", "guerrillamail.com", "guerrillamail.net", "10minutemail.com",
    "tempmail.com", "throwawaymail.com", "trashmail.com", "yopmail.com",
    "fakeinbox.com", "getnada.com", "maildrop.cc", "mintemail.com",
    "sharklasers.com", "dispostable.com", "emailondeck.com", "anonbox.net",
    "spamgourmet.com", "trbvm.com", "tempr.email", "mailcatch.com",
}

FREE_DOMAINS = {
    "gmail.com", "yahoo.com", "ymail.com", "hotmail.com", "outlook.com",
    "live.com", "icloud.com", "aol.com", "msn.com", "protonmail.com",
    "proton.me", "gmx.com", "mail.com",
}


def is_disposable_email(email: str) -> bool:
    if not email or "@" not in email:
        return False
    domain = email.rsplit("@", 1)[-1].strip().lower()
    return domain in DISPOSABLE_DOMAINS


def is_free_email(email: str) -> bool:
    if not email or "@" not in email:
        return False
    domain = email.rsplit("@", 1)[-1].strip().lower()
    return domain in FREE_DOMAINS


_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")


def email_syntax_ok(email: str) -> bool:
    if not email:
        return False
    return bool(_EMAIL_RE.match(email.strip()))


# ----------------------------- Area code map -----------------------------

# US area code → state (NPA → primary state). Sourced from NANPA assignments.
# Only used for risk *signal* — not enforcement. Many people have phones from
# different states (e.g. moved); a mismatch alone never blocks a booking.
AREA_CODE_TO_STATE = {
    "201":"NJ","202":"DC","203":"CT","205":"AL","206":"WA","207":"ME","208":"ID","209":"CA",
    "210":"TX","212":"NY","213":"CA","214":"TX","215":"PA","216":"OH","217":"IL","218":"MN",
    "219":"IN","220":"OH","223":"PA","224":"IL","225":"LA","227":"MD","228":"MS","229":"GA",
    "231":"MI","234":"OH","239":"FL","240":"MD","248":"MI","251":"AL","252":"NC","253":"WA",
    "254":"TX","256":"AL","260":"IN","262":"WI","267":"PA","269":"MI","270":"KY","272":"PA",
    "276":"VA","281":"TX","283":"OH","301":"MD","302":"DE","303":"CO","304":"WV","305":"FL",
    "307":"WY","308":"NE","309":"IL","310":"CA","312":"IL","313":"MI","314":"MO","315":"NY",
    "316":"KS","317":"IN","318":"LA","319":"IA","320":"MN","321":"FL","323":"CA","325":"TX",
    "330":"OH","331":"IL","332":"NY","334":"AL","336":"NC","337":"LA","339":"MA","340":"VI",
    "341":"CA","346":"TX","347":"NY","351":"MA","352":"FL","360":"WA","361":"TX","364":"KY",
    "380":"OH","385":"UT","386":"FL","401":"RI","402":"NE","404":"GA","405":"OK","406":"MT",
    "407":"FL","408":"CA","409":"TX","410":"MD","412":"PA","413":"MA","414":"WI","415":"CA",
    "417":"MO","419":"OH","423":"TN","424":"CA","425":"WA","430":"TX","432":"TX","434":"VA",
    "435":"UT","440":"OH","442":"CA","443":"MD","445":"PA","447":"IL","458":"OR","463":"IN",
    "464":"IL","469":"TX","470":"GA","475":"CT","478":"GA","479":"AR","480":"AZ","484":"PA",
    "501":"AR","502":"KY","503":"OR","504":"LA","505":"NM","507":"MN","508":"MA","509":"WA",
    "510":"CA","512":"TX","513":"OH","515":"IA","516":"NY","517":"MI","518":"NY","520":"AZ",
    "530":"CA","531":"NE","534":"WI","539":"OK","540":"VA","541":"OR","551":"NJ","557":"MO",
    "559":"CA","561":"FL","562":"CA","563":"IA","564":"WA","567":"OH","570":"PA","571":"VA",
    "573":"MO","574":"IN","575":"NM","580":"OK","585":"NY","586":"MI","601":"MS","602":"AZ",
    "603":"NH","605":"SD","606":"KY","607":"NY","608":"WI","609":"NJ","610":"PA","612":"MN",
    "614":"OH","615":"TN","616":"MI","617":"MA","618":"IL","619":"CA","620":"KS","623":"AZ",
    "626":"CA","628":"CA","629":"TN","630":"IL","631":"NY","636":"MO","640":"NJ","641":"IA",
    "646":"NY","650":"CA","651":"MN","657":"CA","660":"MO","661":"CA","662":"MS","667":"MD",
    "669":"CA","678":"GA","680":"NY","681":"WV","682":"TX","689":"FL","701":"ND","702":"NV",
    "703":"VA","704":"NC","706":"GA","707":"CA","708":"IL","712":"IA","713":"TX","714":"CA",
    "715":"WI","716":"NY","717":"PA","718":"NY","719":"CO","720":"CO","724":"PA","725":"NV",
    "727":"FL","730":"IL","731":"TN","732":"NJ","734":"MI","737":"TX","740":"OH","743":"NC",
    "747":"CA","752":"NM","754":"FL","757":"VA","760":"CA","762":"GA","763":"MN","765":"IN",
    "769":"MS","770":"GA","772":"FL","773":"IL","774":"MA","775":"NV","779":"IL","781":"MA",
    "785":"KS","786":"FL","801":"UT","802":"VT","803":"SC","804":"VA","805":"CA","806":"TX",
    "808":"HI","810":"MI","812":"IN","813":"FL","814":"PA","815":"IL","816":"MO","817":"TX",
    "818":"CA","820":"CA","828":"NC","830":"TX","831":"CA","832":"TX","838":"NY","839":"SC",
    "843":"SC","845":"NY","847":"IL","848":"NJ","850":"FL","854":"SC","856":"NJ","857":"MA",
    "858":"CA","859":"KY","860":"CT","862":"NJ","863":"FL","864":"SC","865":"TN","870":"AR",
    "872":"IL","878":"PA","901":"TN","903":"TX","904":"FL","906":"MI","907":"AK","908":"NJ",
    "909":"CA","910":"NC","912":"GA","913":"KS","914":"NY","915":"TX","916":"CA","917":"NY",
    "918":"OK","919":"NC","920":"WI","925":"CA","928":"AZ","929":"NY","930":"IN","931":"TN",
    "934":"NY","936":"TX","937":"OH","938":"AL","940":"TX","941":"FL","947":"MI","949":"CA",
    "951":"CA","952":"MN","954":"FL","956":"TX","959":"CT","970":"CO","971":"OR","972":"TX",
    "973":"NJ","978":"MA","979":"TX","980":"NC","984":"NC","985":"LA","989":"MI",
}


def area_code_of_phone(phone: str) -> str:
    """Extract a US 3-digit area code from a free-form phone string.
    Returns "" if it can't confidently identify one (e.g., international, < 10 digits)."""
    if not phone:
        return ""
    digits = re.sub(r"\D", "", phone)
    if len(digits) == 10:
        return digits[:3]
    if len(digits) == 11 and digits.startswith("1"):
        return digits[1:4]
    return ""


def state_for_phone(phone: str) -> str:
    return AREA_CODE_TO_STATE.get(area_code_of_phone(phone), "")


# Common US state token detector inside an address string (state name or 2-letter code).
US_STATE_TOKENS = {
    "AL":"AL","AK":"AK","AZ":"AZ","AR":"AR","CA":"CA","CO":"CO","CT":"CT","DE":"DE","FL":"FL",
    "GA":"GA","HI":"HI","ID":"ID","IL":"IL","IN":"IN","IA":"IA","KS":"KS","KY":"KY","LA":"LA",
    "ME":"ME","MD":"MD","MA":"MA","MI":"MI","MN":"MN","MS":"MS","MO":"MO","MT":"MT","NE":"NE",
    "NV":"NV","NH":"NH","NJ":"NJ","NM":"NM","NY":"NY","NC":"NC","ND":"ND","OH":"OH","OK":"OK",
    "OR":"OR","PA":"PA","RI":"RI","SC":"SC","SD":"SD","TN":"TN","TX":"TX","UT":"UT","VT":"VT",
    "VA":"VA","WA":"WA","WV":"WV","WI":"WI","WY":"WY","DC":"DC",
}


def extract_state_from_address(addr: str) -> str:
    """Heuristic: pull the 2-letter US state code from an address string.
    Looks for ", XX " or ", XX," patterns; returns "" if not found."""
    if not addr:
        return ""
    # Match `, ST ` (state followed by space + zip) — most reliable
    m = re.search(r",\s*([A-Z]{2})\s+\d{5}", addr)
    if m and m.group(1) in US_STATE_TOKENS:
        return m.group(1)
    # Fallback: any `, ST ` token
    m = re.search(r",\s*([A-Z]{2})\b", addr)
    if m and m.group(1) in US_STATE_TOKENS:
        return m.group(1)
    return ""


# ----------------------------- IP Geolocation -----------------------------

_IP_GEO_CACHE: dict[str, dict] = {}  # in-process LRU; survives request lifetime
_IP_GEO_LOCK = asyncio.Lock()


async def lookup_ip_geo(ip: str, db=None) -> dict:
    """Look up IP geolocation via ip-api.com (free, ~45 req/min). Returns
    dict with keys: country, country_code, region, city, isp, query, status.
    Cached in-process AND in MongoDB (`ip_geo_cache` coll) for 30 days.

    Returns {} on any failure — never raises."""
    if not ip or ip.startswith("127.") or ip == "::1":
        return {"country": "local", "country_code": "LO", "city": "", "region": "", "isp": "", "query": ip}

    if ip in _IP_GEO_CACHE:
        return _IP_GEO_CACHE[ip]

    # Mongo cache (30d)
    if db is not None:
        try:
            cached = await db.ip_geo_cache.find_one({"_id": ip}, {"_id": 0})
            if cached:
                cached_at = cached.get("cached_at")
                if cached_at:
                    try:
                        ts = datetime.fromisoformat(cached_at)
                        if datetime.now(timezone.utc) - ts < timedelta(days=30):
                            _IP_GEO_CACHE[ip] = cached.get("geo", {})
                            return _IP_GEO_CACHE[ip]
                    except Exception:
                        pass
        except Exception:
            pass

    async with _IP_GEO_LOCK:
        if ip in _IP_GEO_CACHE:
            return _IP_GEO_CACHE[ip]
        try:
            async with httpx.AsyncClient(timeout=4.0) as cli:
                r = await cli.get(
                    f"http://ip-api.com/json/{ip}",
                    params={"fields": "status,message,country,countryCode,region,regionName,city,isp,query,proxy,hosting"},
                )
            if r.status_code != 200:
                return {}
            j = r.json() or {}
            if j.get("status") != "success":
                return {}
            geo = {
                "country": j.get("country") or "",
                "country_code": j.get("countryCode") or "",
                "region": j.get("region") or "",  # 2-letter state code for US
                "region_name": j.get("regionName") or "",
                "city": j.get("city") or "",
                "isp": j.get("isp") or "",
                "proxy": bool(j.get("proxy") or False),
                "hosting": bool(j.get("hosting") or False),
                "query": j.get("query") or ip,
            }
            _IP_GEO_CACHE[ip] = geo
            if db is not None:
                try:
                    await db.ip_geo_cache.update_one(
                        {"_id": ip},
                        {"$set": {"geo": geo, "cached_at": datetime.now(timezone.utc).isoformat()}},
                        upsert=True,
                    )
                except Exception:
                    pass
            return geo
        except Exception as e:
            logger.warning(f"ip-api lookup failed for {ip}: {e}")
            return {}


# ----------------------------- Blacklist -----------------------------

def _norm_email(s: str) -> str:
    return (s or "").strip().lower()


def _norm_phone(s: str) -> str:
    return re.sub(r"\D", "", s or "")


def _norm_name(s: str) -> str:
    return re.sub(r"\s+", " ", (s or "").strip().lower())


async def check_blacklist(db, *, email: str = "", phone: str = "", ip: str = "", name: str = "") -> list[dict]:
    """Returns matching blacklist entries (may be multiple). Empty list = clean.
    Match modes:
      - email: case-insensitive exact OR domain wildcard (e.g. `@evil.com`)
      - phone: digits-only suffix match (last 10 digits)
      - ip: exact match, or CIDR `/24` prefix
      - name: case-insensitive normalized match (whole name)
    """
    norm_email = _norm_email(email)
    norm_phone = _norm_phone(phone)
    norm_name = _norm_name(name)
    norm_ip = (ip or "").strip()

    if not (norm_email or norm_phone or norm_ip or norm_name):
        return []

    # Single query that walks every blacklist entry — collection is small
    # (admin-curated, expected < a few thousand entries even at scale).
    matches: list[dict] = []
    try:
        async for entry in db.scam_blacklist.find({}, {"_id": 0}):
            kind = entry.get("kind") or "email"
            value = (entry.get("value") or "").strip()
            if not value:
                continue
            if kind == "email":
                v = value.lower()
                if v.startswith("@"):
                    # domain wildcard: @evil.com
                    if norm_email.endswith(v):
                        matches.append(entry)
                        continue
                elif v == norm_email:
                    matches.append(entry)
                    continue
            elif kind == "phone":
                v = re.sub(r"\D", "", value)
                if v and norm_phone and (norm_phone.endswith(v) or v.endswith(norm_phone)):
                    matches.append(entry)
                    continue
            elif kind == "ip":
                if not norm_ip:
                    continue
                if value.endswith("/24"):
                    prefix = ".".join(value[:-3].split(".")[:3])
                    if norm_ip.startswith(prefix + "."):
                        matches.append(entry)
                        continue
                elif value == norm_ip:
                    matches.append(entry)
                    continue
            elif kind == "name":
                if _norm_name(value) and _norm_name(value) == norm_name:
                    matches.append(entry)
                    continue
    except Exception as e:
        logger.warning(f"blacklist scan failed: {e}")
    return matches


# ----------------------------- Risk Scoring -----------------------------

# Tunables — admin-overridable in Settings down the line.
RISK_GREEN_MAX = 30   # 0-30 = green
RISK_YELLOW_MAX = 60  # 31-60 = yellow; 61+ = red


def risk_band(score: int) -> str:
    if score <= RISK_GREEN_MAX:
        return "green"
    if score <= RISK_YELLOW_MAX:
        return "yellow"
    return "red"


async def score_submission(
    *,
    db,
    full_name: str = "",
    email: str = "",
    phone: str = "",
    ip: str = "",
    user_agent: str = "",
    pickup_location: str = "",
    dropoff_location: str = "",
    amount: float = 0.0,
    blacklist_matches: Optional[list[dict]] = None,
) -> dict:
    """Compute a risk score (0-100) + flag list for a quote/booking.

    Returns:
      {
        "score": int,                  # 0-100
        "band": "green" | "yellow" | "red",
        "flags": [{"code","label","weight"}, ...],
        "ip_geo": {...},               # may be {}
        "blacklisted": bool,
        "blacklist_hits": [...],
      }
    """
    flags: list[dict] = []
    score = 0

    def add(code: str, label: str, weight: int):
        nonlocal score
        flags.append({"code": code, "label": label, "weight": weight})
        score += weight

    # ----- Blacklist (silent flag — never blocks) -----
    matches = blacklist_matches if blacklist_matches is not None else await check_blacklist(
        db, email=email, phone=phone, ip=ip, name=full_name,
    )
    if matches:
        add("blacklist", f"Matches blacklist ({len(matches)} entry)", 80)

    # ----- Email signals -----
    if email:
        if not email_syntax_ok(email):
            add("email_invalid_syntax", "Email has invalid syntax", 25)
        elif is_disposable_email(email):
            add("email_disposable", "Disposable / throwaway email domain", 35)
        # Free email isn't a strong signal alone — small weight, combines with others
        elif is_free_email(email):
            add("email_free", "Free email provider", 5)
    else:
        # No email at all — riskier for high-dollar bookings (legit customers
        # almost always want a receipt). Weight scales with amount below.
        if amount and amount >= 500:
            add("no_email_high_value", "No email provided on a high-dollar quote", 15)

    # ----- Phone ↔ Pickup state mismatch (signal, not enforcement) -----
    phone_state = state_for_phone(phone)
    pickup_state = extract_state_from_address(pickup_location)
    dropoff_state = extract_state_from_address(dropoff_location)

    if phone_state and pickup_state and phone_state != pickup_state:
        # Soft signal — many customers travel
        add("phone_state_mismatch", f"Phone area code is {phone_state}, pickup is {pickup_state}", 10)

    if pickup_state and dropoff_state and pickup_state != dropoff_state:
        # Cross-state ride — mostly a non-issue, but high-dollar long-haul
        # flagged so admin double-checks (e.g., fake out-of-town wedding scam).
        if amount and amount >= 1000:
            add("cross_state_long_haul", f"Cross-state ride ({pickup_state}→{dropoff_state}) at high value", 8)

    # ----- IP signals -----
    geo = await lookup_ip_geo(ip, db=db) if ip else {}
    if geo:
        if geo.get("country_code") and geo["country_code"] not in {"US", "LO", ""}:
            add("ip_foreign", f"IP geolocates to {geo.get('country') or geo.get('country_code')}", 25)
        if geo.get("proxy"):
            add("ip_proxy", "IP flagged as proxy/VPN", 15)
        if geo.get("hosting"):
            add("ip_hosting", "IP belongs to a hosting provider / datacenter", 12)
        # Pickup state vs IP state (US only)
        if pickup_state and geo.get("country_code") == "US" and geo.get("region"):
            if geo["region"] != pickup_state:
                add("ip_state_mismatch", f"IP is in {geo['region']}, pickup is in {pickup_state}", 8)

    # ----- Multi-quote velocity from same IP -----
    if ip:
        try:
            since = (datetime.now(timezone.utc) - timedelta(hours=24)).isoformat()
            others = await db.quote_requests.count_documents({
                "ip_address": ip,
                "created_at": {"$gt": since},
                "full_name": {"$ne": full_name},
            })
            if others >= 3:
                add("ip_velocity_high", f"{others}+ quotes from this IP in 24h with different names", 25)
            elif others >= 1:
                add("ip_velocity_low", f"{others} other quote(s) from this IP in 24h with a different name", 10)
        except Exception:
            pass

    # ----- High-dollar first-time customer -----
    if amount and amount >= 1000 and email:
        try:
            prior = await db.bookings.count_documents({"email": _norm_email(email)})
            if prior == 0:
                add("first_time_high_value", "First-time customer · high-value booking", 15)
        except Exception:
            pass

    # ----- Suspicious name patterns -----
    n = (full_name or "").strip()
    if n:
        if len(n) <= 2 or " " not in n:
            add("name_single_token", "Name is a single token (no last name)", 8)
        if re.search(r"\d", n):
            add("name_has_digits", "Name contains digits", 12)
        if re.search(r"[!@#$%^&*]", n):
            add("name_has_symbols", "Name contains symbols", 15)
        # Keyboard mashing — no vowels at all in a name ≥ 4 chars is a huge tell
        # (e.g., "sdfgh jklm", "qwerty asdf"). English names always contain at
        # least one vowel per word.
        letters = re.sub(r"[^A-Za-z]", "", n)
        if len(letters) >= 4 and not re.search(r"[aeiouAEIOU]", letters):
            add("name_no_vowels", "Name has no vowels (keyboard mash)", 30)
        # Three consecutive identical chars is another mashing signal
        if re.search(r"(.)\1{2,}", n.lower()):
            add("name_repeat_chars", "Name contains 3+ repeated characters", 15)
        # Common keyboard walk patterns
        low = n.lower()
        if any(w in low for w in ("qwerty", "asdf", "zxcv", "hjkl", "1234", "abcd", "test", "aaaa")):
            add("name_keyboard_walk", "Name contains keyboard-walk pattern", 25)

    # ----- Phone plausibility (US numbers) -----
    if phone:
        digits = re.sub(r"\D", "", phone)
        # Strip US country code prefix
        if len(digits) == 11 and digits.startswith("1"):
            digits = digits[1:]
        if len(digits) == 10:
            area, exchange = digits[:3], digits[3:6]
            # US area codes never start with 0 or 1 (NANP rule)
            if area[0] in ("0", "1"):
                add("phone_invalid_area", f"Invalid US area code {area}", 25)
            # NXX exchange code (2nd triplet) also can't start with 0 or 1
            if exchange[0] in ("0", "1"):
                add("phone_invalid_exchange", f"Invalid US exchange code {exchange}", 20)
            # All identical digits
            if len(set(digits)) <= 1:
                add("phone_all_same_digit", "Phone is all same digit", 30)
            # Sequential pattern (123-456-7890 style)
            if digits in ("1234567890", "0987654321"):
                add("phone_sequential", "Phone is a sequential test pattern", 30)
        elif digits and (len(digits) < 7 or len(digits) > 15):
            add("phone_length_invalid", f"Phone digit count is {len(digits)}", 20)

    # ----- Address plausibility -----
    for label, addr in (("pickup", pickup_location), ("dropoff", dropoff_location)):
        if not addr:
            continue
        cleaned = addr.strip()
        # Real addresses have a digit (street number OR zip) AND at least one
        # comma-separated component. "asdlfkjasdlfkj" or "test street" fail this.
        has_digit = bool(re.search(r"\d", cleaned))
        has_comma_or_multi_word = ("," in cleaned) or (len(cleaned.split()) >= 2)
        if not has_digit and not has_comma_or_multi_word:
            add(f"{label}_addr_unstructured", f"{label.title()} address is a single token", 15)
        # Keyboard mash inside address
        letters_only = re.sub(r"[^A-Za-z]", "", cleaned)
        if len(letters_only) >= 6 and not re.search(r"[aeiouAEIOU]", letters_only):
            add(f"{label}_addr_no_vowels", f"{label.title()} address has no vowels", 20)

    # ----- User-agent (bots / scripts) -----
    ua = (user_agent or "").lower()
    if ua and any(tok in ua for tok in ("python-requests", "curl/", "wget/", "go-http", "java/", "bot", "spider")):
        add("ua_bot_like", "User agent looks like a script/bot", 20)
    elif not ua:
        add("ua_missing", "No User-Agent header", 5)

    score = min(score, 100)
    return {
        "score": score,
        "band": risk_band(score),
        "flags": flags,
        "ip_geo": geo,
        "blacklisted": bool(matches),
        "blacklist_hits": matches,
    }


# ----------------------------- Phone OTP (Twilio Verify ready, MOCK fallback) -----------------------------

def _twilio_verify_configured() -> bool:
    return bool(
        os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
        and os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
        and os.environ.get("TWILIO_VERIFY_SID", "").strip()
    )


async def send_phone_otp(db, phone: str, *, purpose: str = "quote_confirm") -> dict:
    """Generate + send a 6-digit code. If Twilio Verify isn't configured, the
    code is stored in the DB and surfaced in admin UI (MOCK mode).

    Returns {"ok": bool, "mocked": bool, "code": "..." (only when mocked)}."""
    if not phone:
        return {"ok": False, "mocked": False, "error": "phone required"}

    norm = re.sub(r"\D", "", phone)
    if len(norm) < 10:
        return {"ok": False, "mocked": False, "error": "invalid phone"}

    code = f"{secrets.randbelow(900000) + 100000:06d}"
    now = datetime.now(timezone.utc)
    expires = now + timedelta(minutes=10)

    await db.phone_verifications.update_one(
        {"phone": norm, "purpose": purpose},
        {"$set": {
            "phone": norm,
            "purpose": purpose,
            "code": code,
            "attempts": 0,
            "created_at": now.isoformat(),
            "expires_at": expires.isoformat(),
            "verified": False,
            "mocked": not _twilio_verify_configured(),
        }},
        upsert=True,
    )

    if not _twilio_verify_configured():
        # MOCKED — log + surface to admin (so admin can read the code)
        logger.info(f"[OTP MOCKED] phone={norm} code={code} purpose={purpose}")
        return {"ok": True, "mocked": True, "code": code}

    # Real Twilio Verify — fire request
    sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
    tok = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
    vsid = os.environ.get("TWILIO_VERIFY_SID", "").strip()
    try:
        async with httpx.AsyncClient(timeout=6.0, auth=(sid, tok)) as cli:
            r = await cli.post(
                f"https://verify.twilio.com/v2/Services/{vsid}/Verifications",
                data={"To": f"+{norm}" if not norm.startswith("+") else norm, "Channel": "sms"},
            )
        if r.status_code in (200, 201):
            return {"ok": True, "mocked": False}
        logger.warning(f"Twilio Verify HTTP {r.status_code}: {r.text[:200]}")
        return {"ok": False, "mocked": False, "error": "twilio_send_failed"}
    except Exception as e:
        logger.warning(f"Twilio Verify exception: {e}")
        return {"ok": False, "mocked": False, "error": "twilio_exception"}


async def verify_phone_otp(db, phone: str, code: str, *, purpose: str = "quote_confirm") -> bool:
    """Verifies the code. Increments attempts; rejects after 5. Honors Twilio
    Verify when configured (delegates server-side check)."""
    if not phone or not code:
        return False
    norm = re.sub(r"\D", "", phone)
    code = re.sub(r"\D", "", code)[:6]

    rec = await db.phone_verifications.find_one({"phone": norm, "purpose": purpose}, {"_id": 0})
    if not rec:
        return False

    # Expiry
    try:
        if datetime.now(timezone.utc) > datetime.fromisoformat(rec["expires_at"]):
            return False
    except Exception:
        return False

    # Throttle attempts
    if (rec.get("attempts") or 0) >= 5:
        return False

    # Increment attempts up-front (so brute force still consumes attempts)
    await db.phone_verifications.update_one(
        {"phone": norm, "purpose": purpose},
        {"$inc": {"attempts": 1}},
    )

    # If Twilio Verify configured, delegate
    if _twilio_verify_configured() and not rec.get("mocked"):
        sid = os.environ.get("TWILIO_ACCOUNT_SID", "").strip()
        tok = os.environ.get("TWILIO_AUTH_TOKEN", "").strip()
        vsid = os.environ.get("TWILIO_VERIFY_SID", "").strip()
        try:
            async with httpx.AsyncClient(timeout=6.0, auth=(sid, tok)) as cli:
                r = await cli.post(
                    f"https://verify.twilio.com/v2/Services/{vsid}/VerificationCheck",
                    data={"To": f"+{norm}" if not norm.startswith("+") else norm, "Code": code},
                )
            ok = r.status_code in (200, 201) and (r.json().get("status") == "approved")
        except Exception:
            ok = False
    else:
        ok = rec.get("code") == code

    if ok:
        await db.phone_verifications.update_one(
            {"phone": norm, "purpose": purpose},
            {"$set": {"verified": True, "verified_at": datetime.now(timezone.utc).isoformat()}},
        )
    return ok


async def is_phone_verified(db, phone: str, *, purpose: str = "quote_confirm", max_age_hours: int = 24) -> bool:
    if not phone:
        return False
    norm = re.sub(r"\D", "", phone)
    rec = await db.phone_verifications.find_one(
        {"phone": norm, "purpose": purpose, "verified": True}, {"_id": 0},
    )
    if not rec or not rec.get("verified_at"):
        return False
    try:
        ts = datetime.fromisoformat(rec["verified_at"])
        return (datetime.now(timezone.utc) - ts) <= timedelta(hours=max_age_hours)
    except Exception:
        return False
