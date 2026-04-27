#!/usr/bin/env python3
import csv
import json
import math
import re
from collections import defaultdict
from datetime import datetime
from pathlib import Path

from ccn_definitions import grouped_ccn_data


ROOT = Path(__file__).resolve().parent.parent
PUBLIC_DIR = ROOT / "public"
OUT_DIR = PUBLIC_DIR / "precomputed"

STATE_FROM_FIPS_PREFIX = {
    "01": "AL", "02": "AK", "04": "AZ", "05": "AR", "06": "CA", "08": "CO", "09": "CT", "10": "DE", "11": "DC",
    "12": "FL", "13": "GA", "15": "HI", "16": "ID", "17": "IL", "18": "IN", "19": "IA", "20": "KS", "21": "KY",
    "22": "LA", "23": "ME", "24": "MD", "25": "MA", "26": "MI", "27": "MN", "28": "MS", "29": "MO", "30": "MT",
    "31": "NE", "32": "NV", "33": "NH", "34": "NJ", "35": "NM", "36": "NY", "37": "NC", "38": "ND", "39": "OH",
    "40": "OK", "41": "OR", "42": "PA", "44": "RI", "45": "SC", "46": "SD", "47": "TN", "48": "TX", "49": "UT",
    "50": "VT", "51": "VA", "53": "WA", "54": "WV", "55": "WI", "56": "WY",
}


def read_csv_rows(path):
    with path.open("r", encoding="latin-1", newline="") as handle:
        return list(csv.DictReader(handle))


def read_json(path):
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(name, payload):
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    path = OUT_DIR / name
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=True, separators=(",", ":"))
    print(f"Wrote {path} ({path.stat().st_size} bytes)")


def to_float(value):
    if isinstance(value, float) and math.isnan(value):
        return None
    text = str(value or "").strip().replace(",", "")
    if not text:
        return None
    try:
        return float(text)
    except Exception:
        return None


def to_year(value):
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    if len(text) >= 4 and text[:4].isdigit():
        y = int(text[:4])
        if 1900 <= y <= 2100:
            return y
    try:
        y = int(float(text))
        if 1900 <= y <= 2100:
            return y
    except Exception:
        return None
    return None


def to_int_code(value):
    num = to_float(value)
    if num is None:
        return None
    try:
        return int(num)
    except Exception:
        return None


def build_ccn_range_table():
    ranges = []
    categories = grouped_ccn_data.get("categories", {})
    for broad_category, records in categories.items():
        for record in records:
            ranges.append((record["start"], record["end"], broad_category))
    return ranges


CCN_RANGE_TABLE = build_ccn_range_table()

OWNERSHIP_BY_TYP_CONTROL = {
    1: "Nonprofit",
    2: "Voluntary Nonprofit",
    3: "Proprietary",
    4: "For-Profit",
    5: "For-Profit",
    6: "For-Profit",
    7: "Government",
    8: "Government",
    9: "Government",
    10: "Government",
    11: "Government",
    12: "Government",
    13: "Government",
}


def hospital_type_for_ccn(ccn):
    digits = "".join(ch for ch in str(ccn or "") if ch.isdigit())
    if len(digits) < 6:
        return "Unknown"
    facility_code = int(digits[-4:])
    for start, end, label in CCN_RANGE_TABLE:
        if start <= facility_code <= end:
            return label
    return "Specialty, Reserved & Other"


def state_from_ccn(ccn):
    digits = "".join(ch for ch in str(ccn or "") if ch.isdigit())
    if len(digits) < 2:
        return "UNK"
    return STATE_FROM_FIPS_PREFIX.get(digits[:2], "UNK")


def normalize_hospital_name(value):
    text = str(value or "").upper().strip()
    text = re.sub(r"[^A-Z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def canonical_hospital_name(value):
    base = normalize_hospital_name(value)
    if not base:
        return ""
    stop_words = {
        "THE",
        "INC",
        "LLC",
        "CO",
        "CORP",
        "CORPORATION",
        "HOSPITAL",
        "HOSP",
        "MEDICAL",
        "CENTER",
        "CTR",
        "HEALTH",
        "SYSTEM",
        "SYSTEMS",
        "OF",
        "AND",
    }
    tokens = [token for token in base.split(" ") if token and token not in stop_words]
    return " ".join(tokens)


def build_chow_name_to_ccn():
    chow_path = PUBLIC_DIR / "Hospital_CHOW_2026.01.02.csv"
    if not chow_path.exists():
        return {"exact": {}, "canonical": {}}

    exact = {}
    canonical = {}
    for row in read_csv_rows(chow_path):
        pairs = [
            ("ORGANIZATION NAME - BUYER", "CCN - BUYER"),
            ("ORGANIZATION NAME - SELLER", "CCN - SELLER"),
        ]
        for name_key, ccn_key in pairs:
            ccn = str(row.get(ccn_key) or "").strip()
            if not ccn:
                continue
            name_exact = normalize_hospital_name(row.get(name_key))
            if name_exact and name_exact not in exact:
                exact[name_exact] = ccn
            name_canon = canonical_hospital_name(row.get(name_key))
            if name_canon and name_canon not in canonical:
                canonical[name_canon] = ccn

    return {"exact": exact, "canonical": canonical}


def load_or_build_hospital_cost_report():
    csv_path = PUBLIC_DIR / "hcris_hospyear.csv"
    cached_path = OUT_DIR / "hospital_cost_report.json"
    if not csv_path.exists():
        if cached_path.exists():
            payload = read_json(cached_path)
            if isinstance(payload, dict) and isinstance(payload.get("rows"), list):
                return payload
        raise FileNotFoundError("Missing both hcris_hospyear.csv and precomputed hospital_cost_report.json")

    raw_rows = read_csv_rows(csv_path)
    chow_lookup = build_chow_name_to_ccn()
    exact_lookup = chow_lookup["exact"]
    canonical_lookup = chow_lookup["canonical"]

    rows = []
    for row in raw_rows:
        year = to_year(row.get("ayear"))
        revenue = to_float(row.get("netpatrev")) or to_float(row.get("tottotrev"))
        cost = to_float(row.get("totcost"))
        if year is None or revenue is None or cost is None or revenue <= 0 or cost <= 0:
            continue
        typ_control = to_int_code(row.get("typ_control"))
        hospital_name = str(row.get("hospital_name") or "")
        normalized_name = normalize_hospital_name(hospital_name)
        canonical_name = canonical_hospital_name(hospital_name)
        matched_ccn = exact_lookup.get(normalized_name) or canonical_lookup.get(canonical_name)
        fallback_ccn = str(row.get("pn") or "").strip()
        ccn_for_classification = matched_ccn or fallback_ccn
        ccn_source = "chow_name_match" if matched_ccn else ("pn_fallback" if fallback_ccn else "none")
        rows.append(
            {
                "pn": str(row.get("pn") or ""),
                "ayear": year,
                "hospital_name": hospital_name,
                "matched_ccn": matched_ccn or "",
                "ccn_source": ccn_source,
                "facilityType": hospital_type_for_ccn(ccn_for_classification),
                "tottotrev": to_float(row.get("tottotrev")) or revenue,
                "totcost": cost,
                "iptotrev": to_float(row.get("iptotrev")) or to_float(row.get("iphosprev")) or to_float(row.get("ipoprev")),
                "optotrev": to_float(row.get("optotrev")) or to_float(row.get("opoprev")),
                "income": to_float(row.get("income")),
                "typ_control": typ_control,
                "ownershipCategory": OWNERSHIP_BY_TYP_CONTROL.get(typ_control, "Unknown"),
                "beds_total": to_float(row.get("beds_total")),
                "beds_grandtotal": to_float(row.get("beds_grandtotal")),
                "costuccare_v2010": to_float(row.get("costuccare_v2010")),
                "costchcare": to_float(row.get("costchcare")),
                "ipbeddays_adultped": to_float(row.get("ipbeddays_adultped")),
                "availbeddays_adultped": to_float(row.get("availbeddays_adultped")),
                "chain_name": str(row.get("chain_name") or ""),
                "chainname": str(row.get("chainname") or ""),
                "system_name": str(row.get("system_name") or ""),
                "revenue": revenue,
                "cost": cost,
                "revenueReal": revenue,
                "costReal": cost,
            }
        )
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sourceFile": csv_path.name,
        "sourceRowCount": len(raw_rows),
        "normalizedRowCount": len(rows),
        "rows": rows,
    }


def load_or_build_change_ownership():
    cached_path = OUT_DIR / "change_ownership.json"
    if cached_path.exists():
        payload = read_json(cached_path)
        if isinstance(payload, dict) and isinstance(payload.get("rows"), list):
            return payload

    csv_path = PUBLIC_DIR / "Hospital_CHOW_2026.01.02.csv"
    if not csv_path.exists():
        raise FileNotFoundError("Missing both precomputed change_ownership.json and Hospital_CHOW_2026.01.02.csv")

    rows = []
    for idx, row in enumerate(read_csv_rows(csv_path)):
        buyer_state = str(row.get("ENROLLMENT STATE - BUYER") or "").strip().upper()
        seller_state = str(row.get("ENROLLMENT STATE - SELLER") or "").strip().upper()
        buyer_org = str(row.get("ORGANIZATION NAME - BUYER") or "").strip() or "Unknown Buyer"
        seller_org = str(row.get("ORGANIZATION NAME - SELLER") or "").strip() or "Unknown Seller"
        buyer_id = str(row.get("ENROLLMENT ID - BUYER") or "").strip() or buyer_org
        seller_id = str(row.get("ENROLLMENT ID - SELLER") or "").strip() or seller_org
        buyer_ccn = str(row.get("CCN - BUYER") or "").strip()
        seller_ccn = str(row.get("CCN - SELLER") or "").strip()
        date_raw = str(row.get("EFFECTIVE DATE") or "").strip()
        date_iso = None
        if date_raw:
            try:
                date_iso = datetime.strptime(date_raw, "%m/%d/%Y").date().isoformat()
            except Exception:
                date_iso = None
        rows.append(
            {
                "id": f"{idx}-{buyer_id}-{seller_id}",
                "dateIso": date_iso,
                "yearMonth": date_iso[:7] if date_iso else "Unknown",
                "chowType": str(row.get("CHOW TYPE TEXT") or "").strip() or "Unknown",
                "buyerState": buyer_state,
                "sellerState": seller_state,
                "buyerOrg": buyer_org,
                "sellerOrg": seller_org,
                "buyerId": buyer_id,
                "sellerId": seller_id,
                "buyerCcn": buyer_ccn,
                "sellerCcn": seller_ccn,
                "providerType": str(row.get("PROVIDER TYPE TEXT") or "").strip() or "Unknown",
            }
        )
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sourceFile": csv_path.name,
        "sourceRowCount": len(rows),
        "normalizedRowCount": len(rows),
        "rows": rows,
    }


def percentile(sorted_values, ratio):
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return float(sorted_values[0])
    idx = ratio * (len(sorted_values) - 1)
    low = int(idx)
    high = min(len(sorted_values) - 1, low + 1)
    frac = idx - low
    return float(sorted_values[low] * (1 - frac) + sorted_values[high] * frac)


def build_cost_analysis(cost_payload):
    rows = cost_payload.get("rows", [])
    cube = defaultdict(lambda: {"totalCost": 0.0, "totalRevenue": 0.0, "hospitalCount": 0})
    hospital_year = defaultdict(lambda: {"sumCost": 0.0, "count": 0, "name": "", "state": "UNK", "hospitalType": "Unknown"})
    values_by_year = defaultdict(list)
    states = set()
    hospital_types = set()
    years = set()

    for row in rows:
        year = to_year(row.get("ayear"))
        if year is None or year < 1996 or year > 2024:
            continue
        pn = str(row.get("pn") or "")
        state = state_from_ccn(pn)
        hospital_type = hospital_type_for_ccn(pn)
        cost = to_float(row.get("costReal") if row.get("costReal") is not None else row.get("cost"))
        revenue = to_float(row.get("revenueReal") if row.get("revenueReal") is not None else row.get("revenue"))
        if cost is None or revenue is None or cost <= 0 or revenue <= 0:
            continue
        years.add(year)
        states.add(state)
        hospital_types.add(hospital_type)
        values_by_year[year].append(cost)

        cube_key = (year, state, hospital_type)
        cube[cube_key]["totalCost"] += cost
        cube[cube_key]["totalRevenue"] += revenue
        cube[cube_key]["hospitalCount"] += 1

        hy_key = (year, pn, state, hospital_type)
        hospital_year[hy_key]["sumCost"] += cost
        hospital_year[hy_key]["count"] += 1
        hospital_year[hy_key]["name"] = str(row.get("hospital_name") or pn)
        hospital_year[hy_key]["state"] = state
        hospital_year[hy_key]["hospitalType"] = hospital_type

    cube_rows = []
    overall_rollup = defaultdict(lambda: {"totalCost": 0.0, "totalRevenue": 0.0, "hospitalCount": 0})
    for (year, state, hospital_type), metrics in cube.items():
        cube_rows.append(
            {
                "year": year,
                "state": state,
                "hospitalType": hospital_type,
                "totalCost": metrics["totalCost"],
                "totalRevenue": metrics["totalRevenue"],
                "hospitalCount": metrics["hospitalCount"],
            }
        )
        for key in [(year, "ALL", "ALL"), (year, state, "ALL"), (year, "ALL", hospital_type)]:
            overall_rollup[key]["totalCost"] += metrics["totalCost"]
            overall_rollup[key]["totalRevenue"] += metrics["totalRevenue"]
            overall_rollup[key]["hospitalCount"] += metrics["hospitalCount"]

    for (year, state, hospital_type), metrics in overall_rollup.items():
        cube_rows.append(
            {
                "year": year,
                "state": state,
                "hospitalType": hospital_type,
                "totalCost": metrics["totalCost"],
                "totalRevenue": metrics["totalRevenue"],
                "hospitalCount": metrics["hospitalCount"],
            }
        )

    distribution = []
    for year in sorted(years):
        series = sorted(values_by_year[year])
        distribution.append(
            {
                "year": year,
                "p25": percentile(series, 0.25),
                "p50": percentile(series, 0.50),
                "p75": percentile(series, 0.75),
            }
        )

    hospital_avg = []
    for (year, pn, state, hospital_type), metrics in hospital_year.items():
        avg_cost = metrics["sumCost"] / metrics["count"]
        hospital_avg.append(
            {
                "year": year,
                "pn": pn,
                "state": state,
                "hospitalType": hospital_type,
                "label": metrics["name"][:28],
                "avgCost": avg_cost,
            }
        )

    comparison = []
    bins = defaultdict(list)
    for row in hospital_avg:
        keys = [
            (row["year"], row["state"], row["hospitalType"]),
            (row["year"], row["state"], "ALL"),
            (row["year"], "ALL", row["hospitalType"]),
            (row["year"], "ALL", "ALL"),
        ]
        for key in keys:
            bins[key].append(row)

    for (year, state, hospital_type), records in bins.items():
        ordered = sorted(records, key=lambda entry: entry["avgCost"], reverse=True)
        top = ordered[:6]
        bottom = list(reversed(ordered[-6:])) if len(ordered) > 6 else []
        for record in top:
            comparison.append(
                {
                    "year": year,
                    "state": state,
                    "hospitalType": hospital_type,
                    "label": f"Top {record['label']}",
                    "avgCost": record["avgCost"],
                }
            )
        for record in bottom:
            comparison.append(
                {
                    "year": year,
                    "state": state,
                    "hospitalType": hospital_type,
                    "label": f"Bottom {record['label']}",
                    "avgCost": record["avgCost"],
                }
            )

    year_list = sorted(years)
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "metadata": {
            "minYear": year_list[0] if year_list else 1996,
            "maxYear": year_list[-1] if year_list else 2024,
            "states": sorted(states),
            "hospitalTypes": sorted(hospital_types),
        },
        "cube": cube_rows,
        "distribution": distribution,
        "comparison": comparison,
    }


def get_num_with_fallback(row, keys):
    for key in keys:
        if key in row and row.get(key) is not None:
            value = to_float(row.get(key))
            if value is not None:
                return value
    return None


def round_int(value):
    if value is None:
        return None
    return int(round(value))


def build_cost_analysis_story(cost_payload):
    rows = cost_payload.get("rows", [])
    normalized = []
    years = set()
    for row in rows:
        year = to_year(row.get("ayear"))
        if year is None or year < 1990 or year > 2030:
            continue
        years.add(year)

        chain_raw = row.get("chain_name") or row.get("chainname") or row.get("system_name")
        chain_str = str(chain_raw).strip() if chain_raw is not None else ""
        chain_str = re.sub(r"^(name|chain name)\s*:\s*", "", chain_str, flags=re.IGNORECASE).strip()
        chain_str = re.sub(r"\s+", " ", chain_str).strip()
        if chain_str.lower() in {"nan", "none", "null", "na", "n/a", "unknown", "not available"}:
            chain_str = ""

        ownership = row.get("ownershipCategory")
        if not ownership:
            typ_ctrl = get_num_with_fallback(row, ["typ_control"])
            if typ_ctrl is not None:
                ownership = f"Type {int(typ_ctrl)}"
            else:
                ownership = "Unknown"
        facility_type = str(row.get("facilityType") or "Unknown")

        normalized.append(
            {
                "ayear": year,
                "revenue": get_num_with_fallback(row, ["tottotrev", "revenue", "revenueReal", "netpatrev"]),
                "cost": get_num_with_fallback(row, ["totcost", "cost", "costReal"]),
                "iptotrev": get_num_with_fallback(row, ["iptotrev", "iphosprev", "ipoprev"]),
                "optotrev": get_num_with_fallback(row, ["optotrev", "opoprev"]),
                "income": get_num_with_fallback(row, ["income", "marginRaw", "margin"]),
                "ownershipCategory": str(ownership),
                "facilityType": facility_type,
                "bedsTotal": get_num_with_fallback(row, ["beds_total", "beds_grandtotal"]),
                "uncompCare": get_num_with_fallback(row, ["costuccare_v2010", "costchcare"]),
                "ipBedDays": get_num_with_fallback(row, ["ipbeddays_adultped"]),
                "availBedDays": get_num_with_fallback(row, ["availbeddays_adultped"]),
                "chainName": chain_str,
            }
        )

    year_list = sorted(years)
    min_year = year_list[0] if year_list else 1996
    max_year = year_list[-1] if year_list else 2024
    recent_start = max(max_year - 4, min_year)

    macro_by_year = defaultdict(lambda: {"year": None, "revenue": 0.0, "cost": 0.0})
    delivery_by_year = defaultdict(lambda: {"year": None, "inpatient": 0.0, "outpatient": 0.0, "count": 0})
    profit_by_owner = defaultdict(lambda: {"ownership": None, "income": 0.0, "count": 0})
    uncomp_by_year = defaultdict(lambda: {"year": None, "sumUncompCare": 0.0, "count": 0})
    size_vs_uncomp_by_year = defaultdict(list)
    occupancy_by_year = defaultdict(lambda: defaultdict(int))
    chain_by_year = defaultdict(lambda: defaultdict(float))

    for row in normalized:
        y = row["ayear"]

        # 1. Macro Trend
        if row["revenue"] is not None and row["cost"] is not None:
            macro_by_year[y]["year"] = y
            macro_by_year[y]["revenue"] += row["revenue"]
            macro_by_year[y]["cost"] += row["cost"]

        # 2. Delivery Shift
        if row["iptotrev"] is not None and row["optotrev"] is not None:
            delivery_by_year[y]["year"] = y
            delivery_by_year[y]["inpatient"] += row["iptotrev"]
            delivery_by_year[y]["outpatient"] += row["optotrev"]
            delivery_by_year[y]["count"] += 1

        # 3. Profitability (Recent years only)
        if y >= recent_start and row["income"] is not None:
            own = row["facilityType"] or "Unknown"
            profit_by_owner[own]["ownership"] = own
            profit_by_owner[own]["income"] += row["income"]
            profit_by_owner[own]["count"] += 1

        # 3b. Uncompensated Care Burden Trend
        uncomp = row["uncompCare"]
        if uncomp is not None:
            uncomp_by_year[y]["year"] = y
            uncomp_by_year[y]["sumUncompCare"] += uncomp
            uncomp_by_year[y]["count"] += 1

        # 4. Chain Capacity & Size vs Uncomp
        beds = row["bedsTotal"]
        if beds is not None and beds > 0:
            if row["chainName"]:
                chain_by_year[y][row["chainName"]] += beds

            if uncomp is not None and len(size_vs_uncomp_by_year[y]) < 2500:
                size_vs_uncomp_by_year[y].append({"x": beds, "y": uncomp})

        # 5. Occupancy Histograms
        ip_days = row["ipBedDays"]
        avail_days = row["availBedDays"]
        if ip_days is not None and avail_days is not None and avail_days > 0:
            occ = ip_days / avail_days
            if 0 <= occ <= 1:
                bucket = min(0.95, int(occ * 20) / 20.0)
                occupancy_by_year[y][bucket] += 1

    # Formatting Results
    macro_trend = [
        {
            "year": row["year"],
            "revenue": round_int(row["revenue"]),
            "cost": round_int(row["cost"]),
        }
        for row in sorted(macro_by_year.values(), key=lambda r: r["year"])
    ]

    delivery_shift = [
        {
            "year": e["year"],
            "inpatient": round_int(e["inpatient"] / e["count"]),
            "outpatient": round_int(e["outpatient"] / e["count"]),
        }
        for e in sorted(delivery_by_year.values(), key=lambda r: r["year"]) if e["count"] > 0
    ]

    profitability = [
        {"ownership": e["ownership"], "income": round_int(e["income"] / e["count"])}
        for e in profit_by_owner.values() if e["count"] > 0
    ]
    profitability.sort(key=lambda r: r["income"], reverse=True)

    uncomp_care_trend = [
        {
            "year": e["year"],
            "avgUncompCare": round_int(e["sumUncompCare"] / e["count"]),
            "reportingHospitals": e["count"],
        }
        for e in sorted(uncomp_by_year.values(), key=lambda r: r["year"]) if e["count"] > 0
    ]

    size_vs_uncomp = {
        str(y): [{"x": round_int(row["x"]), "y": round_int(row["y"])} for row in rows]
        for y, rows in size_vs_uncomp_by_year.items()
    }

    occupancy_hist = {}
    for y, buckets in occupancy_by_year.items():
        hist = []
        for bucket in sorted(buckets.keys()):
            label = f"{int(round(bucket * 100))}-{int(round((bucket + 0.05) * 100))}%"
            hist.append({"bucket": label, "count": buckets[bucket]})
        occupancy_hist[str(y)] = hist
    chain_capacity = {
        str(y): [
            {"chain": chain[:34], "beds": round_int(beds)}
            for chain, beds in sorted(chains.items(), key=lambda item: item[1], reverse=True)[:10]
        ]
        for y, chains in chain_by_year.items()
    }

    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "metadata": {
            "minYear": min_year,
            "maxYear": max_year,
            "recentStartYear": recent_start,
            "availableYears": year_list,
        },
        "macroTrend": macro_trend,
        "deliveryShift": delivery_shift,
        "profitabilityByOwnership": profitability,
        "uncompCareTrend": uncomp_care_trend,
        "sizeVsUncompByYear": size_vs_uncomp,
        "occupancyHistogramByYear": occupancy_hist,
        "chainCapacityByYear": chain_capacity,
    }


def event_year(event):
    return to_year(event.get("dateIso")) or to_year(event.get("yearMonth")) or 1996


def system_id_for_event(event):
    buyer_id = str(event.get("buyerId") or "").strip()
    if buyer_id:
        return buyer_id
    org = str(event.get("buyerOrg") or "unknown").strip().upper()
    return org[:24] or "unknown"


def clean_buyer_name(value):
    text = str(value or "").upper().strip()
    text = re.sub(r"\b(LLC|INC|INCORPORATED|LTD|CORPORATION|CORP|COMPANY|CO)\b", " ", text)
    text = re.sub(r"[^A-Z0-9 ]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text or "UNKNOWN BUYER"


def normalize_events(chow_payload):
    normalized = []
    for row in chow_payload.get("rows", []):
        year = event_year(row)
        if year < 1996 or year > 2024:
            continue
        buyer_id = str(row.get("buyerId") or "").strip() or "unknown-buyer"
        seller_id = str(row.get("sellerId") or "").strip() or "unknown-seller"
        buyer_ccn = str(row.get("buyerCcn") or "").strip()
        seller_ccn = str(row.get("sellerCcn") or "").strip()
        buyer_state = str(row.get("buyerState") or "").strip().upper() or state_from_ccn(buyer_ccn)
        seller_state = str(row.get("sellerState") or "").strip().upper() or state_from_ccn(seller_ccn)
        normalized.append(
            {
                "id": str(row.get("id") or f"{buyer_id}-{seller_id}-{year}"),
                "year": year,
                "chowType": str(row.get("chowType") or "Unknown"),
                "buyerId": buyer_id,
                "sellerId": seller_id,
                "buyerCcn": buyer_ccn,
                "sellerCcn": seller_ccn,
                "buyerOrg": str(row.get("buyerOrg") or buyer_id),
                "sellerOrg": str(row.get("sellerOrg") or seller_id),
                "buyerNameClean": clean_buyer_name(row.get("buyerOrg")),
                "buyerState": buyer_state,
                "sellerState": seller_state,
                "facilityType": hospital_type_for_ccn(seller_ccn),
                "hospitalType": hospital_type_for_ccn(seller_ccn),
                "isOutOfState": bool(buyer_state and seller_state and buyer_state != seller_state),
                "systemId": system_id_for_event(row),
                "providerType": str(row.get("providerType") or "Unknown"),
            }
        )
    return sorted(normalized, key=lambda event: (event["year"], event["id"]))


def build_ownership_evolution(chow_payload):
    events = normalize_events(chow_payload)
    years = sorted({event["year"] for event in events})
    hospital_types = sorted({event["hospitalType"] for event in events if event["hospitalType"]})
    systems = defaultdict(int)
    for event in events:
        systems[event["systemId"]] += 1
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "years": years,
        "hospitalTypes": hospital_types,
        "events": events,
        "systems": [{"systemId": system_id, "events": count} for system_id, count in sorted(systems.items(), key=lambda i: i[1], reverse=True)],
    }


def build_consolidation(chow_payload):
    events = normalize_events(chow_payload)
    years = sorted({event["year"] for event in events})
    facility_types = sorted({event["facilityType"] for event in events if event.get("facilityType")})
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "years": years,
        "facilityTypes": facility_types,
        "events": events,
    }


def build_consolidation_footprint(ownership_payload):
    events = ownership_payload.get("events", [])
    years = ownership_payload.get("years", [])
    systems = ownership_payload.get("systems", [])[:80]
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "years": years,
        "events": events,
        "systems": systems,
        "preYear": 2005,
        "postYear": 2024,
    }


def build_story_overview(cost_payload, ownership_payload):
    years = [to_year(row.get("ayear")) for row in cost_payload.get("rows", []) if to_year(row.get("ayear")) is not None]
    hospitals = {str(row.get("pn") or "") for row in cost_payload.get("rows", []) if str(row.get("pn") or "")}
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "hospitals": len(hospitals),
        "ownershipEvents": len(ownership_payload.get("events", [])),
        "minYear": min(years) if years else 1996,
        "maxYear": max(years) if years else 2024,
    }


def load_existing_consolidation_effects():
    path = OUT_DIR / "consolidation_effects.json"
    if path.exists():
        return read_json(path)
    return {
        "generatedAt": datetime.utcnow().isoformat() + "Z",
        "sourceFiles": [],
        "matchedEvents": [],
    }


def main():
    cost_payload = load_or_build_hospital_cost_report()
    chow_payload = load_or_build_change_ownership()
    consolidation_payload = build_consolidation(chow_payload)
    overview_payload = build_story_overview(cost_payload, consolidation_payload)
    cost_analysis_payload = build_cost_analysis(cost_payload)
    cost_analysis_story_payload = build_cost_analysis_story(cost_payload)

    write_json("hospital_cost_report.json", cost_payload)
    write_json("change_ownership.json", chow_payload)
    write_json("consolidation_effects.json", load_existing_consolidation_effects())
    write_json("cost_analysis.json", cost_analysis_payload)
    write_json("cost_analysis_story.json", cost_analysis_story_payload)
    write_json("consolidation.json", consolidation_payload)
    write_json("story_overview.json", overview_payload)


if __name__ == "__main__":
    main()
