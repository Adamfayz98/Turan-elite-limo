"""
Apply approved post-split changes to Google Ads:
  1. Campaign A primary conversion → Profit (7673194491) via selective_optimization
  2. Campaign B primary conversion → Request Quote (7638459723) via selective_optimization
  3. Campaign C: Manual CPC + $2.50 max CPC on every ad group
  4. Pause "Corporate" ad group in campaign "Search — Luxury Chauffeur"

Reads refresh token from GOOGLE_ADS_ADWORDS_REFRESH_TOKEN (shell env),
falls back to GOOGLE_ADS_REFRESH_TOKEN (.env).

Every mutation is guarded — a failure on one does NOT abort the others.
Prints a clean "changed / unchanged / failed" summary at the end.
"""
import os
import sys
from dotenv import load_dotenv

load_dotenv("/app/backend/.env")
sys.path.insert(0, "/app/backend")

from google.ads.googleads.client import GoogleAdsClient
from google.ads.googleads.errors import GoogleAdsException
from google.api_core import protobuf_helpers

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

PROFIT_ACTION = f"customers/{CUSTOMER_ID}/conversionActions/7673194491"
REQUEST_QUOTE_ACTION = f"customers/{CUSTOMER_ID}/conversionActions/7638459723"

CAMPAIGN_A_NAME = "Search — Purchase (Sedan/SUV/First Class)"
CAMPAIGN_B_NAME = "Search — Quote (Party Bus / Wedding / Wine Tour)"
CAMPAIGN_C_NAME_CONTAINS = "Group Charter"
OLD_CAMPAIGN_NAME_CONTAINS = "Luxury Chauffeur"
CORPORATE_AG_NAME_CONTAINS = "Corporate"


def find_campaigns(gads, cid):
    service = gads.get_service("GoogleAdsService")
    q = """
      SELECT campaign.id, campaign.name, campaign.status,
             campaign.bidding_strategy_type
      FROM campaign
      WHERE campaign.status IN ('ENABLED', 'PAUSED')
    """
    result = {"a": None, "b": None, "c": None, "old": None}
    for row in service.search(customer_id=cid, query=q):
        name = row.campaign.name
        entry = {
            "id": row.campaign.id,
            "name": name,
            "status": row.campaign.status.name,
            "bidding": row.campaign.bidding_strategy_type.name,
            "resource": f"customers/{cid}/campaigns/{row.campaign.id}",
        }
        if name == CAMPAIGN_A_NAME:
            result["a"] = entry
        elif name == CAMPAIGN_B_NAME:
            result["b"] = entry
        elif CAMPAIGN_C_NAME_CONTAINS in name:
            result["c"] = entry
        elif OLD_CAMPAIGN_NAME_CONTAINS in name:
            result["old"] = entry
    return result


def set_selective_optimization(gads, cid, campaign, action_resource, label):
    """Set campaign.selective_optimization.conversion_actions = [action]."""
    if not campaign:
        return {"status": "SKIPPED", "reason": "campaign not found"}
    svc = gads.get_service("CampaignService")
    op = gads.get_type("CampaignOperation")
    c = op.update
    c.resource_name = campaign["resource"]
    c.selective_optimization.conversion_actions.append(action_resource)
    op.update_mask.CopyFrom(protobuf_helpers.field_mask(None, c._pb))
    try:
        svc.mutate_campaigns(customer_id=cid, operations=[op])
        return {"status": "CHANGED", "detail": f"Set selective_optimization → {label}"}
    except GoogleAdsException as e:
        msgs = "; ".join(err.message for err in e.failure.errors)
        return {"status": "FAILED", "detail": msgs}


def switch_to_manual_cpc(gads, cid, campaign):
    if not campaign:
        return {"status": "SKIPPED", "reason": "campaign not found"}
    if campaign["bidding"] == "MANUAL_CPC":
        return {"status": "UNCHANGED", "detail": "already MANUAL_CPC"}
    svc = gads.get_service("CampaignService")
    op = gads.get_type("CampaignOperation")
    c = op.update
    c.resource_name = campaign["resource"]
    c.manual_cpc.enhanced_cpc_enabled = False
    op.update_mask.CopyFrom(protobuf_helpers.field_mask(None, c._pb))
    try:
        svc.mutate_campaigns(customer_id=cid, operations=[op])
        return {"status": "CHANGED", "detail": "MAXIMIZE_CONVERSIONS → MANUAL_CPC"}
    except GoogleAdsException as e:
        msgs = "; ".join(err.message for err in e.failure.errors)
        return {"status": "FAILED", "detail": msgs}


def set_ad_group_bids_to_250(gads, cid, campaign):
    if not campaign:
        return {"status": "SKIPPED", "reason": "campaign not found"}
    svc = gads.get_service("GoogleAdsService")
    q = f"""
      SELECT ad_group.id, ad_group.name, ad_group.cpc_bid_micros
      FROM ad_group
      WHERE campaign.id = {campaign['id']}
        AND ad_group.status IN ('ENABLED', 'PAUSED')
    """
    ad_groups = list(svc.search(customer_id=cid, query=q))
    if not ad_groups:
        return {"status": "SKIPPED", "reason": "no ad groups"}
    ag_service = gads.get_service("AdGroupService")
    ops = []
    changed = []
    unchanged = []
    for r in ad_groups:
        current = r.ad_group.cpc_bid_micros or 0
        if current == 2_500_000:
            unchanged.append(r.ad_group.name)
            continue
        op = gads.get_type("AdGroupOperation")
        ag = op.update
        ag.resource_name = f"customers/{cid}/adGroups/{r.ad_group.id}"
        ag.cpc_bid_micros = 2_500_000
        op.update_mask.CopyFrom(protobuf_helpers.field_mask(None, ag._pb))
        ops.append(op)
        changed.append(r.ad_group.name)
    if not ops:
        return {"status": "UNCHANGED", "detail": f"all bids already $2.50 ({len(unchanged)} ad groups)"}
    try:
        ag_service.mutate_ad_groups(customer_id=cid, operations=ops)
        return {"status": "CHANGED", "detail": f"Set $2.50 max CPC on: {', '.join(changed)}"}
    except GoogleAdsException as e:
        msgs = "; ".join(err.message for err in e.failure.errors)
        return {"status": "FAILED", "detail": msgs}


def pause_corporate_ad_group(gads, cid, old_campaign):
    if not old_campaign:
        return {"status": "SKIPPED", "reason": "'Luxury Chauffeur' campaign not found"}
    svc = gads.get_service("GoogleAdsService")
    q = f"""
      SELECT ad_group.id, ad_group.name, ad_group.status
      FROM ad_group
      WHERE campaign.id = {old_campaign['id']}
        AND ad_group.status = 'ENABLED'
    """
    target = None
    for r in svc.search(customer_id=cid, query=q):
        if CORPORATE_AG_NAME_CONTAINS.lower() in r.ad_group.name.lower():
            target = r.ad_group
            break
    if not target:
        return {"status": "SKIPPED", "reason": "no enabled 'Corporate' ad group found in old campaign"}
    ag_service = gads.get_service("AdGroupService")
    op = gads.get_type("AdGroupOperation")
    ag = op.update
    ag.resource_name = f"customers/{cid}/adGroups/{target.id}"
    ag.status = gads.enums.AdGroupStatusEnum.PAUSED
    op.update_mask.CopyFrom(protobuf_helpers.field_mask(None, ag._pb))
    try:
        ag_service.mutate_ad_groups(customer_id=cid, operations=[op])
        return {"status": "CHANGED", "detail": f"Paused '{target.name}' (id={target.id})"}
    except GoogleAdsException as e:
        msgs = "; ".join(err.message for err in e.failure.errors)
        return {"status": "FAILED", "detail": msgs}


def main():
    gads = GoogleAdsClient.load_from_dict(CFG)
    print(f"[connected] MCC {CFG['login_customer_id']} → customer {CUSTOMER_ID}\n")

    campaigns = find_campaigns(gads, CUSTOMER_ID)
    print(f"Located campaigns:")
    for k, v in campaigns.items():
        if v:
            print(f"  {k.upper():4} = [{v['id']}] {v['name']} · {v['status']} · {v['bidding']}")
        else:
            print(f"  {k.upper():4} = NOT FOUND")
    print()

    results = {}

    print("=" * 70)
    print("MUTATION 1: Campaign A primary conversion → Profit")
    print("-" * 70)
    results["a_conv"] = set_selective_optimization(
        gads, CUSTOMER_ID, campaigns["a"], PROFIT_ACTION, "Profit (7673194491)"
    )
    print(f"  {results['a_conv']['status']}: {results['a_conv'].get('detail') or results['a_conv'].get('reason')}\n")

    print("=" * 70)
    print("MUTATION 2: Campaign B primary conversion → Request Quote")
    print("-" * 70)
    results["b_conv"] = set_selective_optimization(
        gads, CUSTOMER_ID, campaigns["b"], REQUEST_QUOTE_ACTION, "Request Quote (7638459723)"
    )
    print(f"  {results['b_conv']['status']}: {results['b_conv'].get('detail') or results['b_conv'].get('reason')}\n")

    print("=" * 70)
    print("MUTATION 3a: Campaign C bidding → MANUAL_CPC")
    print("-" * 70)
    results["c_bid"] = switch_to_manual_cpc(gads, CUSTOMER_ID, campaigns["c"])
    print(f"  {results['c_bid']['status']}: {results['c_bid'].get('detail') or results['c_bid'].get('reason')}\n")

    print("=" * 70)
    print("MUTATION 3b: Campaign C ad-group max CPCs → $2.50")
    print("-" * 70)
    results["c_bids"] = set_ad_group_bids_to_250(gads, CUSTOMER_ID, campaigns["c"])
    print(f"  {results['c_bids']['status']}: {results['c_bids'].get('detail') or results['c_bids'].get('reason')}\n")

    print("=" * 70)
    print("MUTATION 4: Pause Corporate ad group in 'Search — Luxury Chauffeur'")
    print("-" * 70)
    results["corp_pause"] = pause_corporate_ad_group(gads, CUSTOMER_ID, campaigns["old"])
    print(f"  {results['corp_pause']['status']}: {results['corp_pause'].get('detail') or results['corp_pause'].get('reason')}\n")

    print("=" * 70)
    print("SUMMARY")
    print("-" * 70)
    for k, r in results.items():
        icon = {"CHANGED": "✅", "UNCHANGED": "✔️ ", "SKIPPED": "⚠️ ", "FAILED": "❌"}.get(r["status"], "?")
        print(f"  {icon} {k:12} {r['status']:9} — {r.get('detail') or r.get('reason','')}")


if __name__ == "__main__":
    try:
        main()
    except GoogleAdsException as e:
        print("Google Ads API error at top level:")
        for err in e.failure.errors:
            print(f"  {err.error_code} · {err.message}")
