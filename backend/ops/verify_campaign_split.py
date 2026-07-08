"""
READ-ONLY verification of the post-split Google Ads campaign structure.

Prints a clean per-ad-group breakdown for:
  - CAMPAIGN A (Purchase): budget, ad groups → keywords + match types,
    negative counts, RSA status, Final URL, promo asset presence.
  - CAMPAIGN B (Quote): same breakdown.
  - CAMPAIGN C (Group Charter): bid strategy, per-ad-group Max CPCs, budget.

Uses whichever refresh token is available in the environment:
  - GOOGLE_ADS_ADWORDS_REFRESH_TOKEN (preferred if set)
  - falls back to GOOGLE_ADS_REFRESH_TOKEN if that token has adwords scope
    (which is the case if the user regenerated via OAuth Playground with
    BOTH https://www.googleapis.com/auth/adwords AND ...datamanager scopes)

Zero mutations. Safe to run repeatedly.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException

REFRESH = (
    os.environ.get("GOOGLE_ADS_ADWORDS_REFRESH_TOKEN")
    or os.environ.get("GOOGLE_ADS_REFRESH_TOKEN")
    or ""
)
if not REFRESH:
    raise RuntimeError("No refresh token found in env")

CFG = {
    "developer_token": os.environ["GOOGLE_ADS_DEVELOPER_TOKEN"],
    "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
    "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
    "refresh_token": REFRESH,
    "login_customer_id": os.environ["GOOGLE_ADS_LOGIN_CUSTOMER_ID"].replace("-", ""),
    "use_proto_plus": True,
}
CUSTOMER_ID = os.environ["GOOGLE_ADS_CUSTOMER_ID"].replace("-", "")

CAMPAIGN_A_NAME = "Search — Purchase (Sedan/SUV/First Class)"
CAMPAIGN_B_NAME = "Search — Quote (Party Bus / Wedding / Wine Tour)"

# Group Charter — Campaign C — original ID from the split script logs
CAMPAIGN_C_NAME_CONTAINS = "Group Charter"  # match by name-contains since no fixed ID here

MATCH_TYPE_LABELS = {
    "UNKNOWN": "unknown",
    "UNSPECIFIED": "unspec",
    "EXACT": "EXACT",
    "PHRASE": "PHRASE",
    "BROAD": "BROAD",
}
STATUS_LABEL = {
    "ENABLED": "✅ ENABLED",
    "PAUSED": "⏸  PAUSED",
    "REMOVED": "🗑  REMOVED",
    "UNKNOWN": "? UNKNOWN",
    "UNSPECIFIED": "? UNSPEC",
}
APPROVAL_LABEL = {
    "APPROVED": "✅ APPROVED",
    "APPROVED_LIMITED": "⚠️  APPROVED_LIMITED",
    "DISAPPROVED": "❌ DISAPPROVED",
    "SITE_SUSPENDED": "❌ SITE_SUSPENDED",
    "AREA_OF_INTEREST_ONLY": "⚠️  AREA_OF_INTEREST_ONLY",
    "ELIGIBLE": "✅ ELIGIBLE",
    "UNKNOWN": "? UNKNOWN",
    "UNSPECIFIED": "? UNSPEC",
}


def fetch_campaigns(gads, cid):
    """Return list of campaigns matching our A/B/C targets."""
    service = gads.get_service("GoogleAdsService")
    q = """
      SELECT
        campaign.id, campaign.name, campaign.status,
        campaign.bidding_strategy_type, campaign.advertising_channel_type,
        campaign_budget.amount_micros, campaign_budget.name
      FROM campaign
      WHERE campaign.status IN ('ENABLED', 'PAUSED')
        AND campaign.advertising_channel_type = 'SEARCH'
    """
    campaigns = []
    for row in service.search(customer_id=cid, query=q):
        name = row.campaign.name
        if (
            name == CAMPAIGN_A_NAME
            or name == CAMPAIGN_B_NAME
            or CAMPAIGN_C_NAME_CONTAINS in name
        ):
            campaigns.append({
                "id": row.campaign.id,
                "name": name,
                "status": row.campaign.status.name,
                "bidding": row.campaign.bidding_strategy_type.name,
                "budget_daily_usd": row.campaign_budget.amount_micros / 1_000_000,
                "budget_name": row.campaign_budget.name,
            })
    return campaigns


def fetch_ad_groups(gads, cid, campaign_id):
    service = gads.get_service("GoogleAdsService")
    q = f"""
      SELECT
        ad_group.id, ad_group.name, ad_group.status,
        ad_group.cpc_bid_micros
      FROM ad_group
      WHERE campaign.id = {campaign_id}
        AND ad_group.status IN ('ENABLED', 'PAUSED')
    """
    return [
        {
            "id": r.ad_group.id,
            "name": r.ad_group.name,
            "status": r.ad_group.status.name,
            "cpc_bid_usd": (r.ad_group.cpc_bid_micros or 0) / 1_000_000,
        }
        for r in service.search(customer_id=cid, query=q)
    ]


def fetch_keywords(gads, cid, ad_group_id):
    service = gads.get_service("GoogleAdsService")
    q = f"""
      SELECT
        ad_group_criterion.criterion_id,
        ad_group_criterion.keyword.text,
        ad_group_criterion.keyword.match_type,
        ad_group_criterion.status,
        ad_group_criterion.negative
      FROM keyword_view
      WHERE ad_group.id = {ad_group_id}
        AND ad_group_criterion.status != 'REMOVED'
    """
    pos, neg = [], []
    for r in service.search(customer_id=cid, query=q):
        entry = {
            "text": r.ad_group_criterion.keyword.text,
            "match": MATCH_TYPE_LABELS.get(
                r.ad_group_criterion.keyword.match_type.name,
                r.ad_group_criterion.keyword.match_type.name,
            ),
        }
        if r.ad_group_criterion.negative:
            neg.append(entry)
        else:
            pos.append(entry)
    return pos, neg


def fetch_rsa(gads, cid, ad_group_id):
    service = gads.get_service("GoogleAdsService")
    q = f"""
      SELECT
        ad_group_ad.ad.id, ad_group_ad.status,
        ad_group_ad.ad.type,
        ad_group_ad.ad.final_urls,
        ad_group_ad.policy_summary.approval_status,
        ad_group_ad.policy_summary.review_status,
        ad_group_ad.ad.responsive_search_ad.headlines,
        ad_group_ad.ad.responsive_search_ad.descriptions
      FROM ad_group_ad
      WHERE ad_group.id = {ad_group_id}
        AND ad_group_ad.status != 'REMOVED'
    """
    ads = []
    for r in service.search(customer_id=cid, query=q):
        ads.append({
            "id": r.ad_group_ad.ad.id,
            "type": r.ad_group_ad.ad.type_.name,
            "status": r.ad_group_ad.status.name,
            "approval": r.ad_group_ad.policy_summary.approval_status.name,
            "review": r.ad_group_ad.policy_summary.review_status.name,
            "final_urls": list(r.ad_group_ad.ad.final_urls) if r.ad_group_ad.ad.final_urls else [],
            "hl_count": len(r.ad_group_ad.ad.responsive_search_ad.headlines) if r.ad_group_ad.ad.type_.name == "RESPONSIVE_SEARCH_AD" else 0,
            "desc_count": len(r.ad_group_ad.ad.responsive_search_ad.descriptions) if r.ad_group_ad.ad.type_.name == "RESPONSIVE_SEARCH_AD" else 0,
        })
    return ads


def fetch_promo_assets(gads, cid, campaign_id, ad_group_id=None):
    """Return list of promo asset resource names attached at
    campaign OR ad-group scope."""
    service = gads.get_service("GoogleAdsService")
    q = f"""
      SELECT
        asset.id, asset.name,
        asset.promotion_asset.promotion_target,
        asset.promotion_asset.percent_off,
        asset.promotion_asset.money_amount_off.amount_micros,
        asset.promotion_asset.language_code,
        asset.type
      FROM asset
      WHERE asset.type = 'PROMOTION'
    """
    all_promos = []
    for r in service.search(customer_id=cid, query=q):
        pct = r.asset.promotion_asset.percent_off
        amt = r.asset.promotion_asset.money_amount_off.amount_micros
        all_promos.append({
            "id": r.asset.id,
            "resource": f"customers/{cid}/assets/{r.asset.id}",
            "percent_off": pct if pct else None,
            "money_off_usd": (amt / 1_000_000) if amt else None,
            "target": r.asset.promotion_asset.promotion_target or "-",
        })

    # Which of these are LINKED to this campaign or ad group?
    linked = []
    # campaign-level
    q2 = f"""
      SELECT campaign_asset.asset, campaign_asset.field_type
      FROM campaign_asset
      WHERE campaign.id = {campaign_id}
        AND campaign_asset.field_type = 'PROMOTION'
        AND campaign_asset.status != 'REMOVED'
    """
    for r in service.search(customer_id=cid, query=q2):
        rn = r.campaign_asset.asset
        for p in all_promos:
            if p["resource"] == rn:
                linked.append({**p, "scope": "campaign"})
    # ad-group-level
    if ad_group_id:
        q3 = f"""
          SELECT ad_group_asset.asset, ad_group_asset.field_type
          FROM ad_group_asset
          WHERE ad_group.id = {ad_group_id}
            AND ad_group_asset.field_type = 'PROMOTION'
            AND ad_group_asset.status != 'REMOVED'
        """
        for r in service.search(customer_id=cid, query=q3):
            rn = r.ad_group_asset.asset
            for p in all_promos:
                if p["resource"] == rn:
                    linked.append({**p, "scope": "ad_group"})
    return linked


def main():
    gads = GoogleAdsClient.load_from_dict(CFG)
    print(f"[connected] MCC {CFG['login_customer_id']} → customer {CUSTOMER_ID}\n")

    campaigns = fetch_campaigns(gads, CUSTOMER_ID)
    if not campaigns:
        print("No campaigns matching A/B/C found. Aborting.")
        return

    for c in campaigns:
        title_marker = ""
        if c["name"] == CAMPAIGN_A_NAME:
            title_marker = " · CAMPAIGN A (Purchase)"
        elif c["name"] == CAMPAIGN_B_NAME:
            title_marker = " · CAMPAIGN B (Quote)"
        elif CAMPAIGN_C_NAME_CONTAINS in c["name"]:
            title_marker = " · CAMPAIGN C (Group Charter)"
        print("=" * 92)
        print(f"{c['name']}{title_marker}")
        print("-" * 92)
        print(f"  Campaign ID:        {c['id']}")
        print(f"  Status:             {STATUS_LABEL.get(c['status'], c['status'])}")
        print(f"  Bid strategy:       {c['bidding']}")
        print(f"  Daily budget:       ${c['budget_daily_usd']:.2f}/day  (budget: {c['budget_name']})")
        print()

        ags = fetch_ad_groups(gads, CUSTOMER_ID, c["id"])
        if not ags:
            print("  ⚠️  NO AD GROUPS — this campaign is EMPTY.")
            continue

        for ag in ags:
            print(f"  ┌─ Ad Group: {ag['name']}")
            print(f"  │    ID:       {ag['id']}")
            print(f"  │    Status:   {STATUS_LABEL.get(ag['status'], ag['status'])}")
            print(f"  │    Max CPC:  ${ag['cpc_bid_usd']:.2f}")

            pos_kw, neg_kw = fetch_keywords(gads, CUSTOMER_ID, ag["id"])
            print(f"  │    Keywords ({len(pos_kw)} positive):")
            if not pos_kw:
                print("  │      ⚠️  ZERO POSITIVE KEYWORDS — will not serve.")
            else:
                for kw in pos_kw:
                    print(f"  │       · [{kw['match']:6}] {kw['text']}")
            print(f"  │    Negatives ({len(neg_kw)}):")
            if neg_kw:
                # Show first 10 negatives for brevity
                for kw in neg_kw[:10]:
                    print(f"  │       · [{kw['match']:6}] {kw['text']}")
                if len(neg_kw) > 10:
                    print(f"  │       · … +{len(neg_kw) - 10} more")

            ads = fetch_rsa(gads, CUSTOMER_ID, ag["id"])
            if not ads:
                print("  │    ⚠️  NO ADS — ad group will not serve.")
            else:
                for a in ads:
                    print(
                        f"  │    Ad {a['id']}: {a['type']} · "
                        f"{STATUS_LABEL.get(a['status'], a['status'])} · "
                        f"policy: {APPROVAL_LABEL.get(a['approval'], a['approval'])} / review: {a['review']}"
                    )
                    print(f"  │      Final URL: {a['final_urls'][0] if a['final_urls'] else '(none)'}")
                    if a["type"] == "RESPONSIVE_SEARCH_AD":
                        print(f"  │      Headlines: {a['hl_count']} · Descriptions: {a['desc_count']}")

            # Promo asset presence (relevant for Campaign A ad groups only, but check all)
            promos = fetch_promo_assets(gads, CUSTOMER_ID, c["id"], ag["id"])
            if promos:
                for p in promos:
                    off_display = (
                        f"{p['percent_off']}% off"
                        if p["percent_off"]
                        else (f"${p['money_off_usd']:.0f} off" if p["money_off_usd"] else "?")
                    )
                    print(f"  │    Promo asset ({p['scope']}): {off_display} · asset_id={p['id']}")
            else:
                print("  │    Promo asset: none linked")
            print("  └────────────")
        print()

    print("=" * 92)
    print("Report complete.")


if __name__ == "__main__":
    try:
        main()
    except GoogleAdsException as e:
        print(f"\nGoogle Ads API error:")
        for err in e.failure.errors:
            print(f"  {err.error_code} · {err.message}")
        if any(
            "invalid_grant" in (err.message or "").lower()
            or "insufficient" in (err.message or "").lower()
            or "scope" in (err.message or "").lower()
            for err in e.failure.errors
        ):
            print(
                "\nHINT: The current refresh token in env may be datamanager-scoped only.\n"
                "To read campaign structure you need the 'adwords' scope. Regenerate a\n"
                "refresh token via OAuth Playground with BOTH scopes:\n"
                "  - https://www.googleapis.com/auth/adwords\n"
                "  - https://www.googleapis.com/auth/datamanager\n"
                "Then export it as GOOGLE_ADS_ADWORDS_REFRESH_TOKEN before re-running."
            )
