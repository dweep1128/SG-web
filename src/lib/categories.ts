// DRAFT keyword classifier: BUSY has no real category data (1170 of 1417 items sit in group "General").
// Read-only — derives a category from the item name (and a few BUSY group names) at render time; never writes to the DB.
// ponytail: first-matching-rule heuristic, ~80–90% right on eyeball. Upgrade path: a category column on busy_items
// (or display overrides) once Dweep has corrected the draft.
import { normalize } from "./normalize.ts";

export const CATEGORIES = [
  { slug: "chargers", label: "Chargers" },
  { slug: "batteries", label: "Batteries" },
  { slug: "controllers", label: "Controllers" },
  { slug: "meters", label: "Meters & displays" },
  { slug: "lights", label: "Lights & indicators" },
  { slug: "suspension", label: "Suspension" },
  { slug: "wheels", label: "Wheels & tyres" },
  { slug: "brakes", label: "Brakes" },
  { slug: "motors", label: "Motors & sensors" },
  { slug: "controls", label: "Throttles, locks & levers" },
  { slug: "wiring", label: "Wiring & electricals" },
  { slug: "body", label: "Body parts" },
  { slug: "hardware", label: "Hardware & bearings" },
  { slug: "other", label: "Other" },
] as const;

export type CategorySlug = (typeof CATEGORIES)[number]["slug"];

// BUSY groups that already imply a category. "CABLE ALL TYPE" is deliberately absent: it mixes brake/throttle/speedo cables.
const GROUP_RULES: Record<string, CategorySlug> = {
  "SEAL ALL TYPE": "hardware",
  "BEARING ALL TYPE": "hardware",
  "DISC PAD ALL TYPE": "brakes",
  "PANEL ALL TYPE": "body",
  "VISOR ALL TYPE": "body",
  "TRIM ALL TYPE": "body",
  "FOOTMAT": "body",
  "MUDGUARD ALL TYPE": "body",
  "PLASTIC PARTS": "body",
  "HERO OPTIMA": "body",
  "SWING ARM ALL TYPE": "suspension",
};

// Order matters: first rule with a matching word wins ("REAR BRAKE CABLE" → brakes, not wiring).
const KEYWORD_RULES: [CategorySlug, string[]][] = [
  ["chargers", ["charger"]],
  ["batteries", ["battery", "lithium", "bms", "cell"]],
  ["controllers", ["controller"]],
  ["meters", ["meter", "speedometer", "speedo", "display", "digi", "odometer"]],
  ["lights", ["light", "headlight", "taillight", "indicator", "indigactor", "idicator", "indcator", "blinker", "blinked", "bulb", "led", "lamp", "reflector", "fog"]],
  ["suspension", ["shocker", "shock", "swing", "fork", "suspension"]],
  ["wheels", ["tyre", "tire", "tube", "tubeless", "valve", "rim", "wheel", "alloy", "hub"]],
  ["brakes", ["brake", "disc", "pad", "caliper", "calliper", "caliber", "drum", "shoe", "cylinder", "mc"]],
  ["motors", ["motor", "magnet", "sensor", "hall", "belt", "chain", "pully", "pulley", "sprocket"]],
  ["controls", ["throttle", "accelerator", "lever", "handle", "grip", "mirror", "lock", "ignition", "key"]],
  ["wiring", ["wire", "wiring", "harness", "cable", "switch", "socket", "shocket", "connector", "anderson", "coupler", "fuse", "mcb", "flasher", "horn", "relay", "converter", "convertor", "male", "female", "xlr", "xt60", "xt90", "lead"]],
  ["body", ["panel", "visor", "mudguard", "mudgaurd", "fender", "fendar", "pannel", "floor", "dicky", "chrome", "glass", "backrest", "rest", "plate", "trim", "body", "nose", "cover", "footmat", "footboard", "footrest", "seat", "plastic", "guard", "sticker", "paint", "carrier", "box"]],
  ["hardware", ["nut", "bolt", "washer", "warshel", "screw", "seal", "bearing", "spring", "pin", "bush", "racer", "clip", "hook", "cone", "stand", "thimble", "thimmle"]],
];

// "shockers" should match "shocker": allow a trailing plural s.
function hasWord(tokens: string[], word: string): boolean {
  return tokens.some((t) => t === word || t === `${word}s`);
}

export function classifyPart(name: string, busyGroup: string | null): CategorySlug {
  if (busyGroup && GROUP_RULES[busyGroup]) return GROUP_RULES[busyGroup];
  const tokens = normalize(name).split(" ");
  for (const [slug, words] of KEYWORD_RULES) if (words.some((w) => hasWord(tokens, w))) return slug;
  return "other";
}

export function categoryLabel(slug: string): string {
  return CATEGORIES.find((c) => c.slug === slug)?.label ?? "Other";
}

export function isCategorySlug(value: unknown): value is CategorySlug {
  return CATEGORIES.some((c) => c.slug === value);
}
