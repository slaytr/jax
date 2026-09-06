/**
 * Turns boss-loot-tables.js's own human-readable `rarity`/`quantity`
 * strings back into numbers the Loot tab's simulator (LootTab.vue) can
 * actually roll against — same "human-readable text over a bespoke schema"
 * call as lib/areaTasks.ts's own parseRequirement, so the data file stays
 * exactly what a person reads off the wiki instead of a pre-split
 * {numerator, denominator} shape nothing else needs.
 */

/** `"1/384"` -> 1/384, `"Always"` -> 1, `"16%"` -> 0.16. `null` for anything
 * with no fixed numeric chance to roll against (`"Unknown"`, `"Very rare"`,
 * the two furniture-plan drops, Saradomin's hum) — the simulator skips
 * those rows rather than guessing a number for them. */
export function parseRarity(rarity: string): number | null {
  const cleaned = rarity.replace(/,/g, '').trim();
  if (/^always$/i.test(cleaned)) return 1;

  const percent = cleaned.match(/^([\d.]+)%$/);
  if (percent) return Number(percent[1]) / 100;

  const fraction = cleaned.match(/^([\d.]+)\/([\d.]+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);

  return null;
}

/** `"20-25"` -> [20, 25], `"3 (noted)"` -> [3, 3], `""` -> [1, 1] (the Gem/
 * Rare drop table reference rows have no quantity of their own — each hit
 * just counts as one trigger of that table). Falls back to [1, 1] for
 * anything else unparseable rather than throwing, same defensive stance as
 * parseRarity returning null. */
export function parseQuantity(quantity: string): [number, number] {
  const cleaned = quantity
    .replace(/,/g, '')
    .replace(/\s*\(noted\)/i, '')
    .trim();
  if (!cleaned) return [1, 1];

  const range = cleaned.match(/^(\d+)-(\d+)$/);
  if (range) return [Number(range[1]), Number(range[2])];

  const flat = Number(cleaned);
  return Number.isFinite(flat) ? [flat, flat] : [1, 1];
}

export interface RollResult {
  hits: number;
  qty: number;
}

/** N independent Bernoulli trials (one per kill) at this row's own rarity —
 * simple over exactly correct: several rows on the same boss are really
 * mutually exclusive slots on one shared table (only one Unique can drop
 * per kill, say), but every rate here is already the wiki's own marginal
 * "chance per kill" figure, and at these rates two such rows firing on the
 * same simulated kill is rare enough (~1 in tens of thousands of kills for
 * the rarest pairs) to not be worth modelling the shared-table structure
 * for. Returns null when parseRarity can't give this row a number at all. */
export function rollItem(rarity: string, quantity: string, kills: number): RollResult | null {
  const p = parseRarity(rarity);
  if (p === null) return null;

  const [min, max] = parseQuantity(quantity);
  let hits = 0;
  let qty = 0;
  for (let i = 0; i < kills; i += 1) {
    if (Math.random() < p) {
      hits += 1;
      qty += min === max ? min : min + Math.floor(Math.random() * (max - min + 1));
    }
  }
  return { hits, qty };
}
