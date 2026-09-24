// Self-check for search normalisation, fuzzy matching, highlighting and the draft classifier.
// Run: npm run check:search   (plain Node, no test framework; exits non-zero on failure)
import assert from "node:assert/strict";
import { classifyPart } from "../src/lib/categories.ts";
import { normalize } from "../src/lib/normalize.ts";
import { buildIndex, highlight, search, suggest, type SearchDoc } from "../src/lib/search.ts";

// Hand-made fixture, shaped like real names (double spaces, punctuation). Not real stock or prices.
const doc = (code: number, name: string, hsn: string, cat: SearchDoc["cat"]): SearchDoc => ({ code, name, hsn, cat, price: 100, stock: "in" });
const docs: SearchDoc[] = [
  doc(1291, "CHARGER  60V", "8504", "chargers"),
  doc(1340, "CHARGER 60V 3AMP", "8504", "chargers"),
  doc(3072, "CHARGER 48V ACTUAL 4AMP", "8504", "chargers"),
  doc(1315, "BEARING 6200 2RS", "8482", "hardware"),
  doc(1378, "DISC PUMP L/R", "8714", "brakes"),
  doc(1683, "THROTTLE F/R", "8714", "controls"),
  doc(2046, "CHARGER LEAD ACID 60V 4AMP FULL  DISPLAY", "8504", "chargers"),
  doc(1583, "REAR BRAKE CABLE", "8714", "brakes"),
];
const index = buildIndex(docs);
const codes = (q: string) => search(index, q).map((d) => d.code);

// normalisation
assert.equal(normalize("CHARGER  60 V / 3-AMP"), "charger 60v 3amp");
assert.equal(normalize("60 v"), normalize("60v"));
assert.equal(normalize("DISC PUMP L/R"), "disc pump l r");

// the spec's typo example, and unit spacing
assert.ok(codes("chager 60v").includes(1340), "chager 60v → CHARGER 60V 3AMP");
assert.ok(!codes("chager 60v").includes(3072), "60v must not match 48V");
assert.deepEqual(codes("chager 60 v"), codes("chager 60v"));
assert.ok(codes("charger 3 amp").includes(1340));

// code, HSN, category, punctuation
assert.equal(codes("1315")[0], 1315, "exact item code first");
assert.ok(codes("8482").includes(1315), "HSN search");
assert.ok(codes("brakes").includes(1583), "category label search");
assert.ok(codes("disc pump l/r").includes(1378), "punctuation ignored");
assert.ok(codes("thrttle").includes(1683), "one-letter typo");
assert.deepEqual(codes("   "), []);

// no-results path still suggests something close
assert.equal(codes("charger 72v").length, 0);
assert.ok(suggest(index, "charger 72v", 6).some((d) => d.cat === "chargers"));

// highlighting is word-level and typo-tolerant
const hits = (name: string, q: string) => highlight(name, q).filter((s) => s.hit).map((s) => s.text.trim());
assert.deepEqual(hits("CHARGER 60V 3AMP", "chager 60v"), ["CHARGER", "60V"]);
assert.deepEqual(hits("DISC PUMP L/R", "pump"), ["PUMP"]);
assert.equal(highlight("CHARGER  60V", "x").map((s) => s.text).join(""), "CHARGER  60V", "segments rebuild the text");

// classifier spot checks
assert.equal(classifyPart("REAR BRAKE CABLE", "CABLE ALL TYPE"), "brakes");
assert.equal(classifyPart("CHARGING SOCKET XLR FEMALE WITH WIRE", "General"), "wiring");
assert.equal(classifyPart("FRONT MUDGUARD AMPERE TYPE RED (A3)", "MUDGUARD ALL TYPE"), "body");
assert.equal(classifyPart("ASUS LAPTOP", "General"), "other");
assert.equal(classifyPart("MOTOR L KEY NUT (10PCS PACK)", "General"), "hardware", "fasteners are hardware");
assert.equal(classifyPart("SIDE STAND NUT BOLT (5 PCS PACK)", "General"), "hardware");
assert.equal(classifyPart("BRAKE SHOE 110MM WITH SPRING", "General"), "brakes", "accessory spring");
assert.equal(classifyPart("KEY LOCK", "General"), "controls");
assert.equal(classifyPart("THROTTLE WITH DISPLAY AND KEY", "General"), "controls");
assert.equal(classifyPart("HUB MOTOR 1000W 10\" DISC TYPE", "General"), "motors");

console.log("check-search: all assertions passed");
