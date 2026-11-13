#!/usr/bin/env python3
"""Regenerate src/data/listings.json from the MASTER Sales Pipeline workbook.

    python3 tools/sync_listings.py "/path/to/MASTER Sales Pipeline.xlsx" [--today YYYY-MM-DD]

The workbook is opened read-only and is never modified. Only these DEALS columns
are read: Status, TYPE, ADDRESS, CITY, VALUE and the date / market-time columns.
Names, phone numbers and commission figures are never read into the output.

Rules (see tools/LISTINGS_SYNC.md):
  * ACTIVE seller rows appear under "active" only when listing-display.json marks the
    address "public": true and the start date has arrived. Everything else is reported
    on stdout as "held" and is NOT written to the repo.
  * PENDING seller rows appear under "under_contract".
  * SOLD rows appear under "sold" when the sale price is $1,000,000 or more.
  * A listing-display.json entry with "pin" stays on the page whatever the workbook says.
Prints a JSON summary (counts, changes, held, notes) and exits 0. Exit 2 = workbook unreadable.
"""
import sys, re, json, datetime, argparse, pathlib, warnings

ROOT = pathlib.Path(__file__).resolve().parent.parent
DISPLAY = ROOT / "src" / "data" / "listing-display.json"
OUT = ROOT / "src" / "data" / "listings.json"
SOLD_MIN = 1_000_000
SUFFIX = {"DRIVE","DR","ROAD","RD","COURT","CT","LANE","LN","AVENUE","AVE","PLACE","PL",
          "STREET","ST","CIRCLE","CIR","COVE","CV","BOULEVARD","BLVD","TERRACE","WAY"}
SIDE_LABEL = {"list": "Listing representation", "buyer": "Buyer representation",
              "both": "Represented both sides", "referral": "Buyer referral"}

def key_of(addr):
    a = re.sub(r"\(.*?\)", " ", str(addr).upper())
    a = re.sub(r"[^A-Z0-9 ]", " ", a)
    toks = a.split()
    if len(toks) > 2 and toks[-1] in SUFFIX:      # drop one trailing street suffix only
        toks.pop()
    return " ".join(toks)

def titled(addr):
    a = re.sub(r"\(.*?\)", " ", str(addr)).strip()
    return " ".join(w.capitalize() if not re.fullmatch(r"[NSEW]\.?", w.upper()) else w.upper().rstrip(".") + "."
                    for w in a.split())

def as_date(v):
    if isinstance(v, datetime.datetime): return v.date()
    if isinstance(v, datetime.date): return v
    return None

def side_of(t):
    t = str(t or "").upper()
    if "REF" in t: return "referral"
    s, b = "SELL" in t, "BUY" in t
    return "both" if s and b else "list" if s else "buyer" if b else None

def read_deals(path):
    import openpyxl
    warnings.filterwarnings("ignore")
    wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
    ws = wb["DEALS"] if "DEALS" in wb.sheetnames else wb["PIPELINE"]
    rows = list(ws.iter_rows(min_row=1, max_col=22, values_only=True))
    hdr = next(i for i, r in enumerate(rows[:30]) if r and str(r[0]).strip().lower() == "status")
    col = {str(c).strip().upper(): i for i, c in enumerate(rows[hdr]) if c}
    def c(*names):
        for n in names:
            for k, i in col.items():
                if k.startswith(n): return i
        raise KeyError(names)
    ix = dict(status=c("STATUS"), type=c("TYPE"), addr=c("ADDRESS"), city=c("CITY"), value=c("VALUE"),
              start=c("LIST/START"), contract=c("CONTRACT DATE"), close=c("CLOSE DATE"), mt=c("MARKET TIME"))
    deals = []
    for r in rows[hdr + 1:]:
        if not r or not r[ix["status"]] or not r[ix["addr"]]: continue
        addr = str(r[ix["addr"]]).strip()
        if addr.upper() in ("TBD", "", "--"): continue
        val = r[ix["value"]]
        deals.append(dict(status=str(r[ix["status"]]).strip().upper(), side=side_of(r[ix["type"]]),
                          addr=addr, city=str(r[ix["city"]] or "").strip().title(),
                          value=int(val) if isinstance(val, (int, float)) else None,
                          start=as_date(r[ix["start"]]), close=as_date(r[ix["close"]]),
                          mt=r[ix["mt"]] if isinstance(r[ix["mt"]], (int, float)) else None,
                          key=key_of(addr)))
    return deals

def sold_year(d):
    m = re.search(r"\((\d{4})\)", d["status"])
    if m: return int(m.group(1))
    if d["close"]: return d["close"].year
    if d["start"] and d["mt"] is not None:
        return (d["start"] + datetime.timedelta(days=int(d["mt"]))).year
    return d["start"].year if d["start"] else None

def card(d, disp, **extra):
    out = dict(key=d["key"], address=disp.get("address") or titled(d["addr"]),
               town=disp.get("town") or d["city"], photo=disp.get("photo"),
               specs=disp.get("specs"), blurb=disp.get("blurb"), href=disp.get("href"))
    out.update(extra)
    return {k: v for k, v in out.items() if v is not None}

def build(deals, display, today):
    notes, held = [], []
    active, pending, sold = [], [], []
    seen_active = set()
    for d in deals:
        disp = display.get(d["key"], {})
        st = d["status"]
        if st == "ACTIVE" and d["side"] in ("list", "both"):
            if not re.match(r"\d", d["key"]):
                held.append(dict(address=d["addr"], reason="no street number in the workbook")); continue
            if d["start"] and d["start"] > today:
                held.append(dict(address=d["addr"], reason=f"launch scheduled {d['start'].isoformat()}")); continue
            if not disp.get("public"):
                held.append(dict(address=d["addr"], reason="not confirmed as a public listing")); continue
            active.append(card(d, disp, status="Active", price=disp.get("list_price")))
            seen_active.add(d["key"])
        elif st == "PENDING" and d["side"] in ("list", "both"):
            if not disp.get("list_price"): notes.append(f"{d['addr']}: no list price on file; shown without a price")
            pending.append(card(d, disp, status="Under Contract", price=disp.get("list_price")))
    # pinned listings stay whatever the workbook says
    for k, disp in display.items():
        if disp.get("pin") == "active" and k not in seen_active:
            active.insert(0, card(dict(key=k, addr=k, city=""), disp, status="Active", price=disp.get("list_price")))
    # sold: one card per sale; a SELL row and a BUY row for the same sale collapse to "both"
    groups = {}
    for d in deals:
        if not d["status"].startswith("SOLD"): continue
        yr = sold_year(d)
        for g in groups.get(d["key"], []):
            same = g["value"] and d["value"] and abs(g["value"] - d["value"]) <= 0.02 * g["value"]
            if same and {g["side"], d["side"]} == {"list", "buyer"}:
                g["side"] = "both"; break
        else:
            groups.setdefault(d["key"], []).append(dict(d, year=yr))
    for k, gs in groups.items():
        for g in gs:
            disp = display.get(f"{k}@{g['year']}") or (display.get(k, {}) if len(gs) == 1 or g is max(gs, key=lambda x: x["year"] or 0) else {})
            price = disp.get("sold_price") or g["value"]
            if not price or price < SOLD_MIN: continue
            if not disp.get("sold_price"): notes.append(f"{g['addr']}: sale price taken from the workbook VALUE column (not MLS-verified)")
            side = disp.get("side") or g["side"] or "list"
            closed = disp.get("closed")
            year = int(closed[:4]) if closed else g["year"]
            sold.append(card(g, disp, status="Closed", price=int(price), side=side,
                             side_label=SIDE_LABEL[side], year=year, closed=closed))
    sold.sort(key=lambda s: (s.get("closed") or f"{s.get('year') or 0}-00-00", s["price"]), reverse=True)
    for s in active + pending:
        if not s.get("photo"): notes.append(f"{s['address']}: no photo on file")
    return dict(active=active, under_contract=pending, sold=sold), held, notes

def diff(old, new):
    ch = []
    for sec in ("active", "under_contract", "sold"):
        o = {x["key"] + str(x.get("year", "")): x for x in old.get(sec, [])}
        n = {x["key"] + str(x.get("year", "")): x for x in new.get(sec, [])}
        ch += [f"+ {sec}: {n[k]['address']}" for k in n if k not in o]
        ch += [f"- {sec}: {o[k]['address']}" for k in o if k not in n]
        ch += [f"~ {sec}: {n[k]['address']}" for k in n if k in o and n[k] != o[k]]
    return ch

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("workbook"); ap.add_argument("--today"); ap.add_argument("--check", action="store_true")
    a = ap.parse_args()
    today = datetime.date.fromisoformat(a.today) if a.today else datetime.date.today()
    try:
        deals = read_deals(a.workbook)
    except Exception as e:
        print(json.dumps(dict(status="RED", error=f"workbook unreadable: {type(e).__name__}: {e}"))); sys.exit(2)
    display = json.loads(DISPLAY.read_text(encoding="utf-8"))["listings"]
    new, held, notes = build(deals, display, today)
    old = json.loads(OUT.read_text(encoding="utf-8")) if OUT.exists() else {}
    changes = diff(old, new)
    if changes and not a.check:
        OUT.write_text(json.dumps(new, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(json.dumps(dict(status="GREEN", deals_read=len(deals), active=len(new["active"]),
                          under_contract=len(new["under_contract"]), sold=len(new["sold"]),
                          changes=changes, held=held, notes=notes), indent=1))

if __name__ == "__main__":
    main()
