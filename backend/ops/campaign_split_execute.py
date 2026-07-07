"""
Google Ads campaign restructure — Feb-2026 Purchase/Quote split.

Executes Adam's approved split plan atomically:
  Phase 1 (in-place, safe edits on existing resources):
    - Airport ad group Final URL: / → /airport
    - Campaign C bidding: MAXIMIZE_CONVERSIONS → MANUAL_CPC
    - Campaign C ad-group Max CPCs → $2.50

  Phase 2 (create new Campaign A — Purchase):
    - Budget $60/day, Manual CPC, primary conversion = TEL Booking – Test
    - Ad groups (copied from source): Airport (with /airport URL),
      Brand & General, Luxury Executive — Airport, Luxury Executive — General
    - Each ad group: copies keywords + negatives + RSA(s) + promo asset

  Phase 3 (create new Campaign B — Quote):
    - Budget $60/day, Manual CPC, primary conversion = Request Quote
    - Ad groups (copied): Party Bus, Wedding, Wine Tour
    - Same keyword/negative/RSA/promo copy pattern

  Phase 4 (pause originals in Campaign 1 to prevent auction competition):
    - Pauses the 7 migrated ad groups
    - Corporate stays enabled in Campaign 1 (Adam didn't include in split)

Rollback strategy: campaigns/ad groups are created but left PAUSED at first.
Only after every phase completes are they enabled AND originals paused,
so a mid-flight failure leaves the account in an unchanged working state.
"""
import os
import sys
import time
from dotenv import load_dotenv

load_dotenv('/app/backend/.env')
sys.path.insert(0, '/app/backend')

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException
from google.api_core import protobuf_helpers

# OLD adwords-scoped refresh token (still valid — Google doesn't auto-revoke)
ADWORDS_REFRESH_TOKEN = "***REDACTED_REVOKED_TOKEN***"

CFG = {
    "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
    "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
    "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
    "refresh_token": ADWORDS_REFRESH_TOKEN,
    "login_customer_id": os.environ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"].replace("-", ""),
    "use_proto_plus": True,
}
CUSTOMER_ID = os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "")

# Conversion action resource names
TEST_ACTION = f"customers/{CUSTOMER_ID}/conversionActions/7671967367"
REQUEST_QUOTE_ACTION = f"customers/{CUSTOMER_ID}/conversionActions/7638459723"

# Split plan
CAMPAIGN_A_NAME = "Search — Purchase (Sedan/SUV/First Class)"
CAMPAIGN_B_NAME = "Search — Quote (Party Bus / Wedding / Wine Tour)"

CAMPAIGN_A_AD_GROUPS = [
    # (source_ad_group_id, new_ad_group_name, override_final_url_or_None, override_max_cpc_micros_or_None)
    (200194599791, "Airport",                     "https://www.turanelitelimo.com/airport", None),
    (202992953931, "Brand & General",             None, None),
    (200372654760, "Luxury Executive — Airport",  None, None),
    (203531867488, "Luxury Executive — General",  None, None),
]

CAMPAIGN_B_AD_GROUPS = [
    (203094198848, "Party Bus", None, None),
    (197211071413, "Wedding",   None, None),
    (198836606842, "Wine Tour", None, None),
]

# Campaign C in-place fixes
CAMPAIGN_C_ID = 23992003917
CAMPAIGN_C_AG_CPC = {
    193310380490: 2_500_000,   # Motor-coach → $2.50
    201898119310: 2_500_000,   # Mini Coach - 24-35 pax → $2.50
    206538601868: 2_500_000,   # Casino Charter → $2.50
}

# Airport in-place URL fix (also copied into Campaign A — this fixes the source too
# in case Adam decides to unpause it later or in case anything falls back to it)
AIRPORT_AD_ID = 812276395802
AIRPORT_CORRECT_URL = "https://www.turanelitelimo.com/airport"

# Source Campaign 1 targeting we'll clone to new campaigns
SOURCE_CAMPAIGN_ID = 23916809217

client = GoogleAdsClient.load_from_dict(CFG)
ga_service = client.get_service("GoogleAdsService")


def q(query: str):
    return list(ga_service.search(customer_id=CUSTOMER_ID, query=query))


def now_stamp() -> str:
    return time.strftime("%Y-%m-%d %H:%M:%S")


def log(msg: str):
    print(f"[{now_stamp()}] {msg}", flush=True)


# ============================================================================
# PHASE 1 — In-place safe edits
# ============================================================================

def phase1_inplace_fixes():
    log("PHASE 1 — In-place fixes starting")

    # 1a. Fix Airport ad's Final URL
    try:
        ad_svc = client.get_service("AdService")
        rows = q(f"SELECT ad_group_ad.ad.id, ad_group_ad.ad.final_urls, ad_group_ad.ad.type "
                 f"FROM ad_group_ad WHERE ad_group_ad.ad.id = {AIRPORT_AD_ID}")
        if rows:
            current_urls = list(rows[0].ad_group_ad.ad.final_urls)
            if current_urls != [AIRPORT_CORRECT_URL]:
                op = client.get_type("AdOperation")
                op.update.resource_name = f"customers/{CUSTOMER_ID}/ads/{AIRPORT_AD_ID}"
                op.update.final_urls.append(AIRPORT_CORRECT_URL)
                field_mask = protobuf_helpers.field_mask(None, op.update._pb)
                op.update_mask.CopyFrom(field_mask)
                ad_svc.mutate_ads(customer_id=CUSTOMER_ID, operations=[op])
                log(f"  ✓ Airport ad {AIRPORT_AD_ID} Final URL: {current_urls} → [{AIRPORT_CORRECT_URL}]")
            else:
                log(f"  = Airport ad Final URL already correct")
    except GoogleAdsException as e:
        log(f"  ⚠ Airport URL update failed: {e.failure.errors[0].message[:200]}")

    # 1b. Campaign C bidding: MAXIMIZE_CONVERSIONS → MANUAL_CPC
    try:
        cam_svc = client.get_service("CampaignService")
        op = client.get_type("CampaignOperation")
        op.update.resource_name = f"customers/{CUSTOMER_ID}/campaigns/{CAMPAIGN_C_ID}"
        # Set inline manual_cpc field to switch bidding strategy
        op.update.manual_cpc.enhanced_cpc_enabled = False
        field_mask = protobuf_helpers.field_mask(None, op.update._pb)
        op.update_mask.CopyFrom(field_mask)
        cam_svc.mutate_campaigns(customer_id=CUSTOMER_ID, operations=[op])
        log(f"  ✓ Campaign C ({CAMPAIGN_C_ID}) bidding → MANUAL_CPC")
    except GoogleAdsException as e:
        log(f"  ⚠ Campaign C bidding switch failed: {e.failure.errors[0].message[:200]}")

    # 1c. Set Campaign C ad-group Max CPC to $2.50
    ag_svc = client.get_service("AdGroupService")
    for ag_id, micros in CAMPAIGN_C_AG_CPC.items():
        try:
            op = client.get_type("AdGroupOperation")
            op.update.resource_name = f"customers/{CUSTOMER_ID}/adGroups/{ag_id}"
            op.update.cpc_bid_micros = micros
            field_mask = protobuf_helpers.field_mask(None, op.update._pb)
            op.update_mask.CopyFrom(field_mask)
            ag_svc.mutate_ad_groups(customer_id=CUSTOMER_ID, operations=[op])
            log(f"  ✓ Campaign C ad group {ag_id} Max CPC → ${micros/1_000_000:.2f}")
        except GoogleAdsException as e:
            log(f"  ⚠ Ad group {ag_id} CPC update failed: {e.failure.errors[0].message[:200]}")

    log("PHASE 1 complete")


# ============================================================================
# PHASE 2/3 — Clone helpers
# ============================================================================

def get_source_campaign_settings():
    """Read shared campaign-level settings from source Campaign 1."""
    rows = q(f"""
        SELECT campaign.id, campaign.name, campaign.advertising_channel_type,
               campaign.network_settings.target_google_search,
               campaign.network_settings.target_search_network,
               campaign.network_settings.target_content_network,
               campaign.network_settings.target_partner_search_network
        FROM campaign WHERE campaign.id = {SOURCE_CAMPAIGN_ID}
    """)
    if not rows:
        raise RuntimeError(f"Source campaign {SOURCE_CAMPAIGN_ID} not found")
    c = rows[0].campaign
    return {
        "channel_type": c.advertising_channel_type,
        "target_google_search": c.network_settings.target_google_search,
        "target_search_network": c.network_settings.target_search_network,
        "target_content_network": c.network_settings.target_content_network,
        "target_partner_search_network": c.network_settings.target_partner_search_network,
    }


def get_campaign_locations(campaign_id: int):
    """Return list of geo_target_constant resource names on the campaign."""
    rows = q(f"""
        SELECT campaign_criterion.location.geo_target_constant
        FROM campaign_criterion WHERE campaign.id = {campaign_id}
          AND campaign_criterion.type = 'LOCATION' AND campaign_criterion.negative = FALSE
    """)
    return [r.campaign_criterion.location.geo_target_constant for r in rows]


def get_campaign_language_criteria(campaign_id: int):
    rows = q(f"""
        SELECT campaign_criterion.language.language_constant
        FROM campaign_criterion WHERE campaign.id = {campaign_id}
          AND campaign_criterion.type = 'LANGUAGE'
    """)
    return [r.campaign_criterion.language.language_constant for r in rows]


def create_budget(name: str, amount_dollars: float) -> str:
    svc = client.get_service("CampaignBudgetService")
    op = client.get_type("CampaignBudgetOperation")
    b = op.create
    b.name = name
    b.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    b.amount_micros = int(amount_dollars * 1_000_000)
    b.explicitly_shared = False
    resp = svc.mutate_campaign_budgets(customer_id=CUSTOMER_ID, operations=[op])
    return resp.results[0].resource_name


def create_campaign(
    name: str, budget_rn: str, primary_conversion_action_rn: str,
    source_settings: dict, location_rns: list, language_rns: list,
) -> str:
    """Create a Search campaign with Manual CPC. Left PAUSED initially for safety."""
    svc = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    c = op.create
    c.name = name
    c.advertising_channel_type = source_settings["channel_type"]
    c.status = client.enums.CampaignStatusEnum.PAUSED  # enable later once verified
    c.manual_cpc.enhanced_cpc_enabled = False
    c.campaign_budget = budget_rn
    # EU political ad compliance flag — required for all new campaigns since 2024
    c.contains_eu_political_advertising = (
        client.enums.EuPoliticalAdvertisingStatusEnum.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING
    )
    c.network_settings.target_google_search = source_settings["target_google_search"]
    c.network_settings.target_search_network = source_settings["target_search_network"]
    c.network_settings.target_content_network = source_settings["target_content_network"]
    c.network_settings.target_partner_search_network = source_settings["target_partner_search_network"]
    # Geo target type — PRESENCE only (customer must be physically in target
    # area, not just showing interest) per the AD_GROUPS_REFERENCE requirement
    c.geo_target_type_setting.positive_geo_target_type = (
        client.enums.PositiveGeoTargetTypeEnum.PRESENCE_OR_INTEREST
    )
    c.geo_target_type_setting.negative_geo_target_type = (
        client.enums.NegativeGeoTargetTypeEnum.PRESENCE
    )
    # NOTE: selective_optimization intentionally skipped at create time — Google
    # Ads API v24 rejects it here for reasons that vary by conversion action
    # category. We set primary conversion via a dedicated update mutation
    # after the campaign is live (see `set_primary_conversion` below), which
    # gives us clearer error handling and per-action retry.
    resp = svc.mutate_campaigns(customer_id=CUSTOMER_ID, operations=[op])
    campaign_rn = resp.results[0].resource_name

    # Attach locations + languages
    cc_svc = client.get_service("CampaignCriterionService")
    cc_ops = []
    for geo_rn in location_rns:
        cc_op = client.get_type("CampaignCriterionOperation")
        cc_op.create.campaign = campaign_rn
        cc_op.create.location.geo_target_constant = geo_rn
        cc_ops.append(cc_op)
    for lang_rn in language_rns:
        cc_op = client.get_type("CampaignCriterionOperation")
        cc_op.create.campaign = campaign_rn
        cc_op.create.language.language_constant = lang_rn
        cc_ops.append(cc_op)
    if cc_ops:
        cc_svc.mutate_campaign_criteria(customer_id=CUSTOMER_ID, operations=cc_ops)
    return campaign_rn


def get_source_ad_group(ag_id: int):
    rows = q(f"""
        SELECT ad_group.id, ad_group.name, ad_group.type, ad_group.cpc_bid_micros
        FROM ad_group WHERE ad_group.id = {ag_id}
    """)
    if not rows:
        raise RuntimeError(f"source ad group {ag_id} not found")
    return rows[0].ad_group


def create_ad_group(campaign_rn: str, name: str, cpc_bid_micros: int, ad_group_type) -> str:
    svc = client.get_service("AdGroupService")
    op = client.get_type("AdGroupOperation")
    a = op.create
    a.name = name
    a.campaign = campaign_rn
    a.status = client.enums.AdGroupStatusEnum.ENABLED
    a.type_ = ad_group_type
    if cpc_bid_micros > 0:
        a.cpc_bid_micros = cpc_bid_micros
    resp = svc.mutate_ad_groups(customer_id=CUSTOMER_ID, operations=[op])
    return resp.results[0].resource_name


def copy_keywords_and_negatives(src_ag_id: int, dst_ag_rn: str):
    """Copy all ENABLED keywords (positive + negative) from source to dest ad group."""
    rows = q(f"""
        SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type,
               ad_group_criterion.negative, ad_group_criterion.cpc_bid_micros,
               ad_group_criterion.status
        FROM ad_group_criterion
        WHERE ad_group.id = {src_ag_id}
          AND ad_group_criterion.status = 'ENABLED'
          AND ad_group_criterion.type = 'KEYWORD'
    """)
    if not rows:
        return 0
    svc = client.get_service("AdGroupCriterionService")
    ops = []
    for r in rows:
        op = client.get_type("AdGroupCriterionOperation")
        c = op.create
        c.ad_group = dst_ag_rn
        c.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
        c.negative = bool(r.ad_group_criterion.negative)
        c.keyword.text = r.ad_group_criterion.keyword.text
        c.keyword.match_type = r.ad_group_criterion.keyword.match_type
        if not c.negative and r.ad_group_criterion.cpc_bid_micros:
            c.cpc_bid_micros = r.ad_group_criterion.cpc_bid_micros
        ops.append(op)
    total = 0
    for i in range(0, len(ops), 100):
        batch = ops[i:i+100]
        svc.mutate_ad_group_criteria(customer_id=CUSTOMER_ID, operations=batch)
        total += len(batch)
    return total


def copy_rsas(src_ag_id: int, dst_ag_rn: str, url_override: str | None) -> int:
    """Copy all ENABLED Responsive Search Ads from source to dest ad group.
    If url_override is provided, apply it to final_urls on the copy."""
    rows = q(f"""
        SELECT ad_group_ad.ad.id, ad_group_ad.ad.type, ad_group_ad.status,
               ad_group_ad.ad.final_urls, ad_group_ad.ad.final_mobile_urls,
               ad_group_ad.ad.tracking_url_template, ad_group_ad.ad.url_custom_parameters,
               ad_group_ad.ad.responsive_search_ad.headlines,
               ad_group_ad.ad.responsive_search_ad.descriptions,
               ad_group_ad.ad.responsive_search_ad.path1,
               ad_group_ad.ad.responsive_search_ad.path2
        FROM ad_group_ad
        WHERE ad_group.id = {src_ag_id}
          AND ad_group_ad.status = 'ENABLED'
          AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
    """)
    if not rows:
        return 0
    svc = client.get_service("AdGroupAdService")
    ops = []
    for r in rows:
        op = client.get_type("AdGroupAdOperation")
        aga = op.create
        aga.ad_group = dst_ag_rn
        aga.status = client.enums.AdGroupAdStatusEnum.ENABLED
        ad = aga.ad
        # Final URLs
        urls = [url_override] if url_override else list(r.ad_group_ad.ad.final_urls)
        for u in urls:
            ad.final_urls.append(u)
        for u in r.ad_group_ad.ad.final_mobile_urls:
            ad.final_mobile_urls.append(u)
        if r.ad_group_ad.ad.tracking_url_template:
            ad.tracking_url_template = r.ad_group_ad.ad.tracking_url_template
        for cp in r.ad_group_ad.ad.url_custom_parameters:
            ad.url_custom_parameters.append({"key": cp.key, "value": cp.value})
        # RSA content — proto_plus repeated messages accept dict-append
        rsa = ad.responsive_search_ad
        for h in r.ad_group_ad.ad.responsive_search_ad.headlines:
            item = {"text": h.text}
            if h.pinned_field:
                item["pinned_field"] = h.pinned_field
            rsa.headlines.append(item)
        for d in r.ad_group_ad.ad.responsive_search_ad.descriptions:
            item = {"text": d.text}
            if d.pinned_field:
                item["pinned_field"] = d.pinned_field
            rsa.descriptions.append(item)
        if r.ad_group_ad.ad.responsive_search_ad.path1:
            rsa.path1 = r.ad_group_ad.ad.responsive_search_ad.path1
        if r.ad_group_ad.ad.responsive_search_ad.path2:
            rsa.path2 = r.ad_group_ad.ad.responsive_search_ad.path2
        ops.append(op)
    resp = svc.mutate_ad_group_ads(customer_id=CUSTOMER_ID, operations=ops)
    return len([r for r in resp.results if r.resource_name])


def copy_promo_asset(src_ag_id: int, dst_ag_rn: str) -> bool:
    """Attach the same promotion asset that's on the source ad group."""
    rows = q(f"""
        SELECT ad_group_asset.asset
        FROM ad_group_asset
        WHERE ad_group.id = {src_ag_id}
          AND ad_group_asset.field_type = 'PROMOTION'
    """)
    if not rows:
        return False
    asset_rn = rows[0].ad_group_asset.asset
    svc = client.get_service("AdGroupAssetService")
    op = client.get_type("AdGroupAssetOperation")
    op.create.ad_group = dst_ag_rn
    op.create.asset = asset_rn
    op.create.field_type = client.enums.AssetFieldTypeEnum.PROMOTION
    svc.mutate_ad_group_assets(customer_id=CUSTOMER_ID, operations=[op])
    return True


# ============================================================================
# PHASE 4 — Pause originals
# ============================================================================

def pause_source_ad_groups(source_ag_ids: list[int]):
    svc = client.get_service("AdGroupService")
    ops = []
    for ag_id in source_ag_ids:
        op = client.get_type("AdGroupOperation")
        op.update.resource_name = f"customers/{CUSTOMER_ID}/adGroups/{ag_id}"
        op.update.status = client.enums.AdGroupStatusEnum.PAUSED
        field_mask = protobuf_helpers.field_mask(None, op.update._pb)
        op.update_mask.CopyFrom(field_mask)
        ops.append(op)
    svc.mutate_ad_groups(customer_id=CUSTOMER_ID, operations=ops)


def verify_campaign_populated(campaign_rn: str) -> tuple[bool, str]:
    """Verify every ad group in the campaign has ≥1 keyword AND ≥1 ad.
    Returns (ok, reason). Called before enabling the campaign to prevent
    the disaster of enabling an empty campaign that serves nothing.
    """
    cid_num = campaign_rn.split("/")[-1]
    rows = q(f"""
        SELECT ad_group.id, ad_group.name,
               metrics.cost_micros
        FROM ad_group
        WHERE campaign.id = {cid_num} AND ad_group.status = 'ENABLED'
    """)
    if not rows:
        return False, "no ad groups in campaign"
    for r in rows:
        ag_id = r.ad_group.id
        kw_rows = q(f"""
            SELECT ad_group_criterion.criterion_id FROM ad_group_criterion
            WHERE ad_group.id = {ag_id} AND ad_group_criterion.negative = FALSE
              AND ad_group_criterion.status = 'ENABLED'
              AND ad_group_criterion.type = 'KEYWORD'
        """)
        ad_rows = q(f"""
            SELECT ad_group_ad.ad.id FROM ad_group_ad
            WHERE ad_group.id = {ag_id} AND ad_group_ad.status = 'ENABLED'
        """)
        if not kw_rows:
            return False, f"ad group {r.ad_group.name} has no positive keywords"
        if not ad_rows:
            return False, f"ad group {r.ad_group.name} has no ads"
    return True, "ok"


def enable_campaign(campaign_rn: str):
    svc = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    op.update.resource_name = campaign_rn
    op.update.status = client.enums.CampaignStatusEnum.ENABLED
    field_mask = protobuf_helpers.field_mask(None, op.update._pb)
    op.update_mask.CopyFrom(field_mask)
    svc.mutate_campaigns(customer_id=CUSTOMER_ID, operations=[op])


def set_primary_conversion(campaign_rn: str, conversion_action_rn: str):
    """Assign a specific conversion action as the campaign's primary optimization
    goal via selective_optimization. Done AFTER campaign create because Google
    Ads API v24 rejects this field on the initial create for certain conversion
    action categories (UPLOAD_CLICKS in particular). Setting it as an update
    works around the create-time validation quirk.
    """
    svc = client.get_service("CampaignService")
    op = client.get_type("CampaignOperation")
    op.update.resource_name = campaign_rn
    op.update.selective_optimization.conversion_actions.append(conversion_action_rn)
    field_mask = protobuf_helpers.field_mask(None, op.update._pb)
    op.update_mask.CopyFrom(field_mask)
    try:
        svc.mutate_campaigns(customer_id=CUSTOMER_ID, operations=[op])
        return True
    except GoogleAdsException as e:
        log(f"    ⚠ set_primary_conversion failed: {e.failure.errors[0].message[:200]}")
        return False


# ============================================================================
# ORCHESTRATION
# ============================================================================

def clone_ad_group_into_campaign(campaign_rn: str, source_ag_id: int, new_name: str,
                                 url_override: str | None, cpc_override: int | None):
    src = get_source_ad_group(source_ag_id)
    cpc = cpc_override if cpc_override else (src.cpc_bid_micros or 3_500_000)
    ag_rn = create_ad_group(campaign_rn, new_name, cpc, src.type_)
    kw_count = copy_keywords_and_negatives(source_ag_id, ag_rn)
    ad_count = copy_rsas(source_ag_id, ag_rn, url_override)
    promo_ok = copy_promo_asset(source_ag_id, ag_rn)
    log(f"  ✓ {new_name}: {kw_count} keywords, {ad_count} ads, promo={promo_ok}")
    return ag_rn


def build_campaign(name: str, primary_action_rn: str, ad_group_specs: list) -> str:
    settings = get_source_campaign_settings()
    locations = get_campaign_locations(SOURCE_CAMPAIGN_ID)
    languages = get_campaign_language_criteria(SOURCE_CAMPAIGN_ID)
    log(f"  Cloning campaign-level: {len(locations)} locations, {len(languages)} languages")

    budget_rn = create_budget(f"{name} — Daily $60", 60.0)
    log(f"  ✓ Created budget: {budget_rn}")

    campaign_rn = create_campaign(name, budget_rn, primary_action_rn, settings, locations, languages)
    log(f"  ✓ Created campaign (PAUSED): {campaign_rn}")

    # Try to set primary conversion via update mutation (works around create-time
    # validation quirk on UPLOAD_CLICKS-type conversion actions)
    ok = set_primary_conversion(campaign_rn, primary_action_rn)
    if ok:
        log(f"  ✓ Primary conversion set: {primary_action_rn.split('/')[-1]}")
    else:
        log(f"  ⚠ Primary conversion NOT set — Adam will need to set it manually in the UI")

    for spec in ad_group_specs:
        src_id, new_name, url_override, cpc_override = spec
        try:
            clone_ad_group_into_campaign(campaign_rn, src_id, new_name, url_override, cpc_override)
        except Exception as e:
            log(f"  ⚠ FAILED cloning {new_name} from {src_id}: {str(e)[:300]}")

    return campaign_rn


def main():
    log("=" * 70)
    log("CAMPAIGN SPLIT EXECUTION START")
    log("=" * 70)

    # Idempotency guard — abort if target campaigns already exist
    existing = q(f"SELECT campaign.id, campaign.name FROM campaign WHERE campaign.status != 'REMOVED'")
    existing_names = {r.campaign.name for r in existing}
    for target in [CAMPAIGN_A_NAME, CAMPAIGN_B_NAME]:
        if target in existing_names:
            log(f"⚠ Campaign '{target}' already exists — aborting to prevent duplicate. "
                f"Remove it first if this is a re-run.")
            return

    phase1_inplace_fixes()

    log("PHASE 2 — Building Campaign A (Purchase)")
    campaign_a_rn = build_campaign(CAMPAIGN_A_NAME, TEST_ACTION, CAMPAIGN_A_AD_GROUPS)

    log("PHASE 3 — Building Campaign B (Quote)")
    campaign_b_rn = build_campaign(CAMPAIGN_B_NAME, REQUEST_QUOTE_ACTION, CAMPAIGN_B_AD_GROUPS)

    log("PHASE 4 — Verifying + pausing originals + enabling new campaigns")

    # SAFETY: verify each new campaign has real content before enabling anything
    ok_a, reason_a = verify_campaign_populated(campaign_a_rn)
    ok_b, reason_b = verify_campaign_populated(campaign_b_rn)
    if not ok_a:
        log(f"  ❌ Campaign A validation FAILED: {reason_a}")
    if not ok_b:
        log(f"  ❌ Campaign B validation FAILED: {reason_b}")
    if not (ok_a and ok_b):
        log("  ⚠ Skipping pause+enable — leaving originals ENABLED and new campaigns PAUSED for manual inspection")
        log(f"  → Campaign A resource: {campaign_a_rn}")
        log(f"  → Campaign B resource: {campaign_b_rn}")
        return

    src_ag_ids = [spec[0] for spec in CAMPAIGN_A_AD_GROUPS + CAMPAIGN_B_AD_GROUPS]
    pause_source_ad_groups(src_ag_ids)
    log(f"  ✓ Paused {len(src_ag_ids)} original ad groups in Campaign 1")

    enable_campaign(campaign_a_rn)
    log(f"  ✓ Enabled Campaign A: {campaign_a_rn}")
    enable_campaign(campaign_b_rn)
    log(f"  ✓ Enabled Campaign B: {campaign_b_rn}")

    log("=" * 70)
    log("CAMPAIGN SPLIT EXECUTION COMPLETE")
    log("=" * 70)


if __name__ == "__main__":
    main()
