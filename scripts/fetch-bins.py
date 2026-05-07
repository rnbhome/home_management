#!/usr/bin/env python3
"""Fetch upcoming bin collections from Cambridge City Council and merge into data/state.json.

Past entries (date < today) are preserved; today and future entries are replaced
with whatever the council API returns.
"""
import json
import os
import sys
from datetime import datetime, timezone
from urllib import request

UPRN = os.environ.get("BIN_UPRN", "200004201521")
STATE_PATH = os.environ.get("STATE_PATH", "data/state.json")
API_URL = (
    f"https://servicelayer3c.azure-api.net/wastecalendar/collection/search/"
    f"{UPRN}/?numberOfCollections=255"
)

TYPE_MAP = {
    "DOMESTIC": "Black bin",
    "RECYCLE": "Blue bin",
    "ORGANIC": "Green bin",
}


def fetch_collections():
    req = request.Request(
        API_URL,
        headers={
            "User-Agent": "home_management/1.0 (+https://github.com/rnbhome/home_management)",
            "Accept": "application/json",
        },
    )
    with request.urlopen(req, timeout=30) as r:
        return json.load(r).get("collections", [])


def merge_bins(existing, fetched, today):
    kept = [e for e in existing if e.get("date", "") < today]
    by_date = {}
    for c in fetched:
        d = c.get("date", "")[:10]
        if not d or d < today:
            continue
        for t in c.get("roundTypes", []):
            label = TYPE_MAP.get(t)
            if not label:
                continue
            by_date.setdefault(d, set()).add(label)
    new_entries = [
        {"date": d, "bins": sorted(by_date[d])} for d in sorted(by_date)
    ]
    return kept + new_entries


def main():
    with open(STATE_PATH) as f:
        state = json.load(f)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    fetched = fetch_collections()
    if not fetched:
        print("API returned no collections; leaving state unchanged.")
        return
    new_bins = merge_bins(state.get("bins", []), fetched, today)
    if new_bins == state.get("bins"):
        print("No change.")
        return
    state["bins"] = new_bins
    with open(STATE_PATH, "w") as f:
        json.dump(state, f, indent=2)
        f.write("\n")
    print(f"Updated bins: {len(new_bins)} entries.")


if __name__ == "__main__":
    main()
