#!/usr/bin/env python3
import csv
import json
from collections import defaultdict
from datetime import datetime
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT / "public"
OUT_DIR = PUBLIC_DIR / "precomputed"


def to_float(value):
    if value is None:
        return None
    text = str(value).strip().replace(",", "")
    if text == "":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def to_year(value):
    try:
        return int(float(value))
    except Exception:
        return None


def exact_name(value):
    return str(value or "").strip()


def read_csv_rows(path):
    with path.open("r", encoding="latin-1", newline="") as f:
        return list(csv.DictReader(f))


def build_change_ownership():
    path = PUBLIC_DIR / "Hospital_CHOW_2026.01.02.csv"
    raw_rows = read_csv_rows(path)
    rows = []
    for idx, row in enumerate(raw_rows):
        buyer_state = str(row.get("ENROLLMENT STATE - BUYER") or "").strip().upper()
        seller_state = str(row.get("ENROLLMENT STATE - SELLER") or "").strip().upper()
        if not buyer_state and not seller_state:
            continue
        buyer_org = str(row.get("ORGANIZATION NAME - BUYER") or "").strip() or "Unknown Buyer"
        seller_org = str(row.get("ORGANIZATION NAME - SELLER") or "").strip() or "Unknown Seller"
        buyer_id = str(row.get("ENROLLMENT ID - BUYER") or "").strip() or buyer_org
        seller_id = str(row.get("ENROLLMENT ID - SELLER") or "").strip() or seller_org
        chow_type = str(row.get("CHOW TYPE TEXT") or "").strip() or "Unknown"
        date_raw = str(row.get("EFFECTIVE DATE") or "").strip()
        date_iso = None
        year_month = "Unknown"
        if date_raw:
            try:
                dt = datetime.strptime(date_raw, "%m/%d/%Y")
                date_iso = dt.date().isoformat()
                year_month = f"{dt.year:04d}-{dt.month:02d}"
            except Exception:
                pass
        rows.append(
            {
                "id": f"{idx}-{buyer_id}-{seller_id}",
                "dateIso": date_iso,
                "yearMonth": year_month,
                "chowType": chow_type,
                "buyerState": buyer_state,
                "sellerState": seller_state,
                "buyerOrg": buyer_org,
                "sellerOrg": seller_org,
                "buyerId": buyer_id,
                "sellerId": seller_id,
            }
        )
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sourceFile": str(path.name),
        "sourceRowCount": len(raw_rows),
        "normalizedRowCount": len(rows),
        "rows": rows,
    }


STATE_FIPS = {
    "AL": "01", "AK": "02", "AZ": "04", "AR": "05", "CA": "06", "CO": "08", "CT": "09", "DE": "10", "FL": "12",
    "GA": "13", "HI": "15", "ID": "16", "IL": "17", "IN": "18", "IA": "19", "KS": "20", "KY": "21", "LA": "22",
    "ME": "23", "MD": "24", "MA": "25", "MI": "26", "MN": "27", "MS": "28", "MO": "29", "MT": "30", "NE": "31",
    "NV": "32", "NH": "33", "NJ": "34", "NM": "35", "NY": "36", "NC": "37", "ND": "38", "OH": "39", "OK": "40",
    "OR": "41", "PA": "42", "RI": "44", "SC": "45", "SD": "46", "TN": "47", "TX": "48", "UT": "49", "VT": "50",
    "VA": "51", "WA": "53", "WV": "54", "WI": "55", "WY": "56", "DC": "11",
}


def build_mup_geo():
    path = PUBLIC_DIR / "MUP_PHY_R25_P05_V20_D23_Geo.csv"
    raw_rows = read_csv_rows(path)
    state_agg = {}
    hcpcs_agg = {}
    pos_agg = {"Office": {"services": 0.0, "beneficiaries": 0.0}, "Facility": {"services": 0.0, "beneficiaries": 0.0}}
    drug_agg = {"Drug": {"services": 0.0, "beneficiaries": 0.0}, "NonDrug": {"services": 0.0, "beneficiaries": 0.0}}

    for row in raw_rows:
        geo_level = str(row.get("Rndrng_Prvdr_Geo_Lvl") or "").strip()
        geo_code = str(row.get("Rndrng_Prvdr_Geo_Cd") or "").strip().upper()
        geo_desc = str(row.get("Rndrng_Prvdr_Geo_Desc") or "").strip()
        hcpcs_code = str(row.get("HCPCS_Cd") or "").strip() or "Unknown"
        hcpcs_desc = str(row.get("HCPCS_Desc") or "").strip()
        place_of_svc = str(row.get("Place_Of_Srvc") or "").strip().upper()
        drug_ind = str(row.get("HCPCS_Drug_Ind") or "").strip().upper()

        tot_providers = to_float(row.get("Tot_Rndrng_Prvdrs")) or 0.0
        tot_benes = to_float(row.get("Tot_Benes")) or 0.0
        tot_srvcs = to_float(row.get("Tot_Srvcs")) or 0.0
        allowed = to_float(row.get("Avg_Mdcr_Alowd_Amt")) or 0.0
        payment = to_float(row.get("Avg_Mdcr_Pymt_Amt")) or 0.0
        stdzd = to_float(row.get("Avg_Mdcr_Stdzd_Amt")) or 0.0

        if geo_level == "State" and geo_code in STATE_FIPS:
            prev = state_agg.get(geo_code) or {
                "stateCode": geo_code,
                "stateName": geo_desc or geo_code,
                "fips": STATE_FIPS[geo_code],
                "sumProviders": 0.0,
                "sumBenes": 0.0,
                "sumSvc": 0.0,
                "weightedAllowed": 0.0,
                "weightedPayment": 0.0,
                "weightedStdzd": 0.0,
            }
            prev["sumProviders"] += tot_providers
            prev["sumBenes"] += tot_benes
            prev["sumSvc"] += tot_srvcs
            prev["weightedAllowed"] += allowed * tot_srvcs
            prev["weightedPayment"] += payment * tot_srvcs
            prev["weightedStdzd"] += stdzd * tot_srvcs
            state_agg[geo_code] = prev

        if geo_level == "National":
            hcpcs_prev = hcpcs_agg.get(hcpcs_code) or {"code": hcpcs_code, "desc": hcpcs_desc, "totSrvcs": 0.0, "totBenes": 0.0}
            hcpcs_prev["totSrvcs"] += tot_srvcs
            hcpcs_prev["totBenes"] += tot_benes
            hcpcs_agg[hcpcs_code] = hcpcs_prev

            pos_key = "Facility" if place_of_svc == "F" else "Office"
            pos_agg[pos_key]["services"] += tot_srvcs
            pos_agg[pos_key]["beneficiaries"] += tot_benes

            drug_key = "Drug" if drug_ind == "Y" else "NonDrug"
            drug_agg[drug_key]["services"] += tot_srvcs
            drug_agg[drug_key]["beneficiaries"] += tot_benes

    state_data = []
    for entry in state_agg.values():
        sum_svc = entry["sumSvc"]
        state_data.append(
            {
                **entry,
                "weightedAllowed": (entry["weightedAllowed"] / sum_svc) if sum_svc else 0.0,
                "weightedPayment": (entry["weightedPayment"] / sum_svc) if sum_svc else 0.0,
                "weightedStdzd": (entry["weightedStdzd"] / sum_svc) if sum_svc else 0.0,
            }
        )

    hcpcs_data = sorted(hcpcs_agg.values(), key=lambda r: r["totSrvcs"], reverse=True)[:30]
    hcpcs_data = [
        {
            "code": entry["code"],
            "label": f"{entry['code']} {entry['desc']}".strip()[:60],
            "totSrvcs": entry["totSrvcs"],
            "totBenes": entry["totBenes"],
        }
        for entry in hcpcs_data
    ]

    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sourceFile": str(path.name),
        "rowCount": len(raw_rows),
        "stateData": state_data,
        "hcpcsData": hcpcs_data,
        "posData": [{"category": key, **value} for key, value in pos_agg.items()],
        "drugData": [{"category": key, **value} for key, value in drug_agg.items()],
    }


def build_consolidation():
    chow_path = PUBLIC_DIR / "Hospital_CHOW_2026.01.02.csv"
    hcris_path = PUBLIC_DIR / "hcris_hospyear.csv"
    chow_rows = read_csv_rows(chow_path)
    hcris_rows = read_csv_rows(hcris_path)

    events = []
    for idx, row in enumerate(chow_rows):
        buyer_name_raw = exact_name(row.get("ORGANIZATION NAME - BUYER"))
        buyer_dba_raw = exact_name(row.get("DOING BUSINESS AS NAME - BUYER"))
        date_raw = str(row.get("EFFECTIVE DATE") or "").strip()
        if not buyer_name_raw or not date_raw:
            continue
        try:
            event_year = datetime.strptime(date_raw, "%m/%d/%Y").year
        except Exception:
            continue
        candidate_match_names = []
        for name in [buyer_name_raw, buyer_dba_raw]:
            if name and name not in candidate_match_names:
                candidate_match_names.append(name)
        if not candidate_match_names:
            continue
        events.append(
            {
                "id": f"event-{idx}",
                "buyerNameRaw": buyer_name_raw,
                "buyerDbaRaw": buyer_dba_raw,
                "candidateMatchNames": candidate_match_names,
                "eventYear": event_year,
                "chowType": str(row.get("CHOW TYPE TEXT") or "").strip() or "Unknown",
            }
        )

    hcris_by_hospital = defaultdict(list)
    for row in hcris_rows:
        hospital_name = exact_name(row.get("hospital_name"))
        year = to_year(row.get("ayear"))
        if not hospital_name or year is None:
            continue
        netpatrev = to_float(row.get("netpatrev"))
        totcost = to_float(row.get("totcost"))
        margin = None
        if netpatrev is not None and totcost is not None and netpatrev != 0:
            margin = (netpatrev - totcost) / netpatrev
        metric_row = {
            "year": year,
            "hospitalName": hospital_name,
            "ipoprev": to_float(row.get("ipoprev")),
            "iphosprev": to_float(row.get("iphosprev")),
            "opoprev": to_float(row.get("opoprev")),
            "netpatrev": netpatrev,
            "totcost": totcost,
            "margin": margin,
        }
        hcris_by_hospital[hospital_name].append(metric_row)

    matched_events = []
    for event in events:
        matched_key = next((name for name in event["candidateMatchNames"] if name in hcris_by_hospital), None)
        if not matched_key:
            continue
        series = hcris_by_hospital[matched_key]
        pre_rows = [r for r in series if event["eventYear"] - 3 <= r["year"] <= event["eventYear"] - 1]
        post_rows = [r for r in series if event["eventYear"] + 1 <= r["year"] <= event["eventYear"] + 3]
        matched_events.append(
            {
                **event,
                "matchedHospitalName": matched_key,
                "series": series,
                "preRows": pre_rows,
                "postRows": post_rows,
            }
        )

    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sourceFiles": [str(chow_path.name), str(hcris_path.name)],
        "chowEventsProcessed": len(events),
        "hcrisRowsProcessed": len(hcris_rows),
        "matchedEvents": matched_events,
    }


OWNERSHIP_CATEGORY = {
    1: "Nonprofit", 2: "Nonprofit",
    3: "For-Profit", 4: "For-Profit", 5: "For-Profit", 6: "For-Profit",
    7: "Government", 8: "Government", 9: "Government", 10: "Government",
    11: "Government", 12: "Government", 13: "Government",
}


def build_hospital_cost_report():
    path = PUBLIC_DIR / "hcris_hospyear.csv"
    raw_rows = read_csv_rows(path)
    rows = []
    for row in raw_rows:
        ayear = to_year(row.get("ayear"))
        revenue = to_float(row.get("netpatrev"))
        cost = to_float(row.get("totcost"))
        if ayear is None or revenue is None or cost is None or revenue <= 0 or cost <= 0:
            continue
        margin_raw = ((revenue - cost) / revenue) * 100
        typ_control = to_year(row.get("typ_control"))
        rows.append(
            {
                "pn": str(row.get("pn") or ""),
                "ayear": ayear,
                "hospital_name": str(row.get("hospital_name") or ""),
                "revenue": revenue,
                "cost": cost,
                "beds_total": to_float(row.get("beds_total")) or 0.0,
                "marginRaw": margin_raw,
                "margin": max(-200.0, min(200.0, margin_raw)),
                "ownershipCategory": OWNERSHIP_CATEGORY.get(typ_control, "Unknown"),
            }
        )
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sourceFile": str(path.name),
        "sourceRowCount": len(raw_rows),
        "normalizedRowCount": len(rows),
        "rows": rows,
    }


def write_json(name, payload):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    with path.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=True, separators=(",", ":"))
    print(f"Wrote {path} ({path.stat().st_size} bytes)")


def main():
    write_json("hospital_cost_report.json", build_hospital_cost_report())
    write_json("change_ownership.json", build_change_ownership())
    write_json("mup_geo_services.json", build_mup_geo())
    write_json("consolidation_effects.json", build_consolidation())


if __name__ == "__main__":
    main()
