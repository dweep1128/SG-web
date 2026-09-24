// Field → BUSY column map for the BUSY → Supabase sync. Every choice comes from docs/busy-schema-report.md.
// Evidence tags are copied from that report. GUESS = supported by data, NOT yet confirmed on the BUSY screen,
// which is why prices and stock stay hidden (price_visible / stock_visible) until PRICE_VERIFIED / STOCK_VERIFIED.
//
// SQL aliases used below are fixed by the queries in busy.mjs:
//   i  = Master1 item row (MasterType 6)       g  = Master1 item group (MasterType 5, via i.ParentGrp)
//   u  = Master1 unit (MasterType 8, via i.CM1) ts = MasterSupport tax category row (MasterType 25, via i.CM8)
//   f  = Folio1 opening balances               t  = Tran2 item lines (RecType 2) summed per item
//
// type: int | number | text | bool, with "?" = NULL allowed.

export const ITEM_FIELDS = [
  { field: "busy_code", sql: "i.Code", alias: "Code", type: "int", evidence: "DATA" },
  { field: "busy_name", sql: "i.Name", alias: "Name", type: "text", evidence: "DATA" },
  { field: "busy_alias", sql: "i.Alias", alias: "Alias", type: "text?", evidence: "DATA (empty for all items today)" },
  { field: "busy_print_name", sql: "i.PrintName", alias: "PrintName", type: "text?", evidence: "DATA" },
  { field: "hsn_code", sql: "i.HSNCode", alias: "HSNCode", type: "text?", evidence: "GUESS (strong: column name; 1291 = 8504)" },
  { field: "busy_stamp", sql: "i.Stamp", alias: "Stamp", type: "int", evidence: "GUESS (edit counter, UNCONFIRMED)" },
  { field: "sale_price", sql: "i.D3", alias: "SalePrice", type: "number", evidence: "GUESS (1291 billed at 330 = D3)" },
  { field: "busy_group_code", sql: "i.ParentGrp", alias: "ParentGrp", type: "int", evidence: "DATA (resolves to MasterType 5)" },
  { field: "busy_group_name", sql: "g.Name", alias: "GroupName", type: "text?", evidence: "DATA" },
  { field: "unit_name", sql: "u.Name", alias: "UnitName", type: "text?", evidence: "GUESS (CM1 = main unit)" },
  { field: "gst_pct", sql: "ts.D2", alias: "GstPct", type: "number?", evidence: "GUESS (strong: matches all 11 tax category names)" },
  { field: "busy_deactivated", sql: "i.DeactiveMaster", alias: "DeactiveMaster", type: "bool", evidence: "GUESS (column name)" },
  { field: "busy_blocked", sql: "i.BlockedMaster", alias: "BlockedMaster", type: "bool", evidence: "GUESS (column name)" },
];

export const ITEM_CODE_FIELDS = [
  { field: "busy_code", sql: "Code", alias: "Code", type: "int" },
  { field: "busy_stamp", sql: "Stamp", alias: "Stamp", type: "int" },
];

export const STOCK_FIELDS = [
  { field: "busy_code", sql: "i.Code", alias: "Code", type: "int", evidence: "DATA" },
  // Opening qty + signed movements. Matches BUSY's own summaries for 1584/1590 items (report §3).
  { field: "stock_qty", sql: "ISNULL(f.D1,0) + ISNULL(t.Qty,0)", alias: "StockQty", type: "number", evidence: "GUESS (UNCONFIRMED vs screen)" },
];

// Purchase/cost data must never be selected, stored or printed. Checked against every SQL string before it is sent.
export const COST_COLUMN_PATTERN = /\b(D4|PurcPrice|PurchasePrice|CostPrice|Cost)\b/i;
