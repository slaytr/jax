import { ref } from 'vue';

/** One drop-table row. `wikiFile` only matters to scripts/fetch-boss-icons.mjs
 * (which wiki file to download the icon from); the page only ever reads
 * `name`/`quantity`/`rarity`/`note`/`wikiUrl`/`noIcon`/`unique`. */
export interface BossLootItem {
  name: string;
  quantity: string;
  rarity: string;
  note?: string;
  wikiFile?: string;
  wikiUrl?: string;
  noIcon?: boolean;
  // Marks a signature drop that isn't in a section literally named
  // "Unique" (Cave horror's Black mask (10) sits under "Armour") — the
  // Loot tab's own simulator purple-borders this the same as a Unique
  // section's own rows. Most bosses don't need this at all; their own
  // Unique (or Nex's Main drop) section name is enough on its own.
  unique?: boolean;
}

export interface BossLootSection {
  name: string;
  items: BossLootItem[];
}

export interface Boss {
  name: string;
  slug: string;
  wikiUrl: string;
  image: string;
  // Splits the Loot tab's sidebar into headed sections (LootTab.vue's own
  // groupedBosses) — otherwise identical in shape to a 'Boss' entry.
  category: 'Boss' | 'Monster';
  // Multiplies LootTab.vue's own base portrait width (and, via
  // scripts/fetch-boss-icons.mjs, the resolution it's fetched at) — unset
  // for every boss whose wiki portrait already reads at a normal size next
  // to the others. See K'ril's own entry in boss-loot-tables.js for why he
  // needs one.
  portraitScale?: number;
  combatLevel: number;
  location: string;
  sections: BossLootSection[];
}

let cached: Boss[] | null = null;

/**
 * The Loot tab's own boss-loot-tables.js load — same "static data module,
 * dynamically imported on first switch to the tab, cached module-wide"
 * shape as useAreaTasks.ts (this data isn't per-player or backed by a
 * database table either).
 */
export function useBossLoot() {
  const bosses = ref<Boss[] | null>(cached);
  const status = ref<'idle' | 'loading' | 'ready' | 'error'>(cached ? 'ready' : 'idle');
  const error = ref<string | null>(null);
  let requested = Boolean(cached);

  function ensureLoaded() {
    if (requested) return;
    requested = true;
    status.value = 'loading';
    import('@shared/boss-loot-tables.js')
      .then((module) => {
        cached = module.BOSS_LOOT_TABLES as Boss[];
        bosses.value = cached;
        status.value = 'ready';
      })
      .catch((err: unknown) => {
        console.error(err);
        error.value = 'Could not load boss loot data.';
        status.value = 'error';
      });
  }

  return { bosses, status, error, ensureLoaded };
}
