# Listings sync — how the Properties page stays current

The Properties page (`src/pages/properties.astro`) renders from `src/data/listings.json`.
That file is **generated** — never hand-edit it.

## Source of truth
The sales pipeline workbook (`MASTER Sales Pipeline.xlsx`, sheet `DEALS`) decides **which
listings appear and what their status is**. The workbook is read-only to every agent.

| Workbook status | Page section | Condition |
|---|---|---|
| `ACTIVE` (seller side) | Active · On Market | start date has arrived **and** the address is marked `"public": true` in `listing-display.json` |
| `PENDING` (seller side) | Under Contract | always |
| `SOLD…` | Sold | sale price **$1,000,000 or more** (both listing- and buyer-side sales) |
| anything else | not shown | removed on the next run |

A `listing-display.json` entry with `"pin": "active"` stays on the page regardless of the workbook.

## What is never published
Only the principal's own listings and sales. No other agent's listings, no team or combined
statistics, no client names, no commission data. Active listings that are not confirmed public
are held back and reported in the run summary — they are not written to this repository.

## `src/data/listing-display.json`
Presentation facts keyed by normalized street address (number + street name, suffix dropped,
upper case — e.g. `"530 OAK KNOLL"`): display address, town, `list_price`, MLS-verified
`sold_price` and `closed` date, `side` (`list` / `buyer` / `both` / `referral`), `photo`, `blurb`.
When `sold_price` is absent the workbook VALUE column is used and the run notes say so.
A sold listing with no `photo` is shown in the "Also closed" ledger instead of the gallery.

## Run
```
pip install openpyxl
python3 tools/sync_listings.py "/path/to/MASTER Sales Pipeline.xlsx"
npm run build          # must pass before pushing
```
The script prints a JSON summary (`changes`, `held`, `notes`). No changes → nothing to commit.
Pushing to `main` deploys.
