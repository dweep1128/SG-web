# Catalog exclusions — DRAFT for review (2026-09-24)

Not applied. `scripts/busy-sync/catalog-exclusions.json` is unchanged. After review, copy the approved lines into it
(`busy_code` + exact `busy_name`); the next item sync then hides them via `exclude_from_catalog`.

Source: live `public_catalog_list()` (1417 items), scanned by name + HSN. Names are exactly as in BUSY.

## A. Not parts: propose excluding

| Code | BUSY name | Why |
|---|---|---|
| 1296 | 32 INCH LED TV | Television (HSN 8528); currently shows under "Lights" because of "LED" |
| 1301 | ASUS LAPTOP | Laptop (HSN 8471) |
| 1499 | LLOYD SAC GLS1813FWSHX | Split AC (HSN 8415) |
| 2851 | AC AKABISHI | AC |
| 1706 | WALL FAN | Appliance |
| 1581 | PRINTER TSC 244 PRO | Label printer (office equipment) |
| 1561 | MUSIC SYSTEM | Appliance |
| 1700 | VACCUM FLASK STEEL | Household item (HSN 7323) |
| 1468 | HELMET | Helmet |
| 2651 | HELMENT MATT BLACK | Helmet |
| 2652 | HELMENT FANCY COULERD | Helmet |
| 2841 | (SKT) DAIRY | Stationery (diary), no HSN |
| 3084 | ESTIMATE BOOK | Stationery, no HSN |
| 2860 | HOLI GIFT | Gift / paper item (HSN 4819) |
| 3080 | ADJUSTMENT STOCK ITEM | Accounting adjustment line, not a product |
| 3110 | Gatta | Carton / packing material (HSN 4819) |
| 3242 | TAPE | Packing tape (HSN 3919) |
| 3244 | BUBLE | Bubble wrap (HSN 3919) |

## B. Whole vehicles: confirm with client

| Code | BUSY name | Note |
|---|---|---|
| 1386 | E SCOOTER G3 | HSN 8711 (motorcycles) |
| 1387 | E SCOOTER MAGIC | HSN 8711 |
| 1389 | ELECTRIC SCOOTY | HSN 8711 |
| 2826 | A3 SCOOTY | HSN 8714, but priced like a vehicle |

## C. Unsure: left visible, check if these are sold to dealers

| Code | BUSY name | Note |
|---|---|---|
| 2458 | TESTING DEVICE | Workshop tool? |
| 3140 | WD-40 | Workshop consumable |
| 3038 | AIR FOOTPUMP | Accessory / tool |
| 1806 | MOBILE HOLDER | Scooter accessory |
| 2062 | CHARGING MOBILE PORT SET | Scooter accessory |
| 1656 | SUKUM TT 22036 | Name unclear |
| 2829 | D P P40 | Name unclear |
