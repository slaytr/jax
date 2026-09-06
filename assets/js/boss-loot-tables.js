/**
 * Loot tables for God Wars Dungeon 1's five bosses — Kree'arra, K'ril
 * Tsutsaroth, General Graardor, Commander Zilyana, and Nex — for the Loot
 * tab (LootTab.vue, loaded lazily via useBossLoot.ts, same "static data
 * module, not a database table" shape as area-tasks.js).
 *
 * Normal-mode drop tables only (hard mode reworks quantities/rates for the
 * same items rather than adding new ones — a later pass can add it as a
 * second table per boss if it's worth the added weight). Scraped by hand
 * from each boss's own wiki page (`action=raw` wikitext, not the rendered
 * page — the rendered `{{DropsLine}}`/`{{DropsLineWarpriest}}`/
 * `{{DropsLineEffigy}}`/`{{DropsLineMimic}}`/`{{DropsLineSpiritGems}}`
 * template calls were read from source and resolved by hand against each
 * template's own definition rather than guessed) on 2026-09-06:
 * - https://runescape.wiki/w/Kree%27arra
 * - https://runescape.wiki/w/K%27ril_Tsutsaroth
 * - https://runescape.wiki/w/General_Graardor (the actual killable boss —
 *   the wiki's own "Bandos" page is the god's lore/NPC article, with no
 *   drop table of its own)
 * - https://runescape.wiki/w/Commander_Zilyana
 * - https://runescape.wiki/w/Nex
 *
 * `rarity` is the wiki's own drop-rate notation verbatim (`"1/384"`,
 * `"Always"`, `"8/128"`, a plain percentage for K'ril's charms — his page
 * uses the wiki's data-driven CharmDataTable rather than the simple
 * percentage-per-1000 CharmDropTable every other boss here uses) rather
 * than a normalised number throughout, since the source itself mixes
 * fraction bases (out of 128, 1000, 2000, 5000...) with no common
 * denominator to normalise to without losing precision.
 *
 * The wiki's own "Gem drop table" and "Rare drop table" rolls are each
 * shared, generic tables of dozens of items common to nearly every RS3
 * monster (uncut gems, dragon equipment, runes, seeds, keys...) rather
 * than anything specific to these five bosses — each is kept here as one
 * reference row (chance to trigger the roll, a link out) instead of fully
 * transcribing either table, which would bloat every boss's list with the
 * same ~50 unrelated items and drown out what's actually distinctive
 * about killing it. `noIcon: true` marks those two rows (and the
 * furniture-plans/glory/notes rows below where no single item icon
 * applies) so the Loot tab doesn't render a broken-image icon slot for
 * them.
 *
 * Shared "tertiary" mechanics across GWD1 (spirit gems, the starved
 * ancient effigy, a mimic kill token, the six-piece Warpriest set) are
 * templated on the wiki with a shared formula rather than a flat number
 * per boss:
 * - Spirit sapphire/emerald/ruby: 5/2000, 3/2000, 2/2000 — constant
 *   (Template:DropsLineSpiritGems' own defaults; no boss here overrides
 *   them).
 * - Starved ancient effigy: base rate 1/roll, where roll=128 for every
 *   GWD1 boss except Nex (Template:DropsLineEffigy computes Nex's own
 *   roll from its combat level when none is given: floor(45000000 /
 *   floor(1001/2)^2) = 1/180).
 * - Mimic kill token: 1/max(50, 10000-level) (Template:DropsLineMimic) —
 *   580/624/1001 combat level in, 1/9420 / 1/9376 / 1/8999 out for
 *   Kree'arra/Graardor/Nex respectively. Absent on K'ril and Zilyana's own
 *   pages (neither uses the macro).
 * - Warpriest of <god> (helm/cuirass/greaves/gauntlets/boots/cape): 1/768
 *   per piece (Template:DropsLineWarpriest) — flat across every GWD1
 *   boss, not a range; the six pieces just repeat the same rate.
 */

export const BOSS_LOOT_TABLES = [
  {
    name: "Kree'arra",
    slug: 'kreearra',
    wikiUrl: "https://runescape.wiki/w/Kree%27arra",
    image: "Kree'arra.png",
    combatLevel: 580,
    location: "Armadyl's Eyrie, God Wars Dungeon",
    sections: [
      {
        name: 'Guaranteed',
        items: [
          { name: 'Big bones', quantity: '1', rarity: 'Always' },
          { name: 'Feather', quantity: '1-16', rarity: 'Always' },
        ],
      },
      {
        name: 'Unique',
        items: [
          { name: 'Armadyl helmet', quantity: '1', rarity: '1/384' },
          { name: 'Armadyl chestplate', quantity: '1', rarity: '1/384' },
          { name: 'Armadyl chainskirt', quantity: '1', rarity: '1/384' },
          { name: 'Armadyl gloves', quantity: '1', rarity: '1/384' },
          { name: 'Armadyl boots', quantity: '1', rarity: '1/384' },
          { name: 'Armadyl buckler', quantity: '1', rarity: '1/384' },
          { name: 'Armadyl hilt', quantity: '1', rarity: '1/512' },
          { name: 'Godsword shard 1', quantity: '1', rarity: '1/768' },
          { name: 'Godsword shard 2', quantity: '1', rarity: '1/768' },
          { name: 'Godsword shard 3', quantity: '1', rarity: '1/768' },
        ],
      },
      {
        name: 'Ammunition',
        items: [
          { name: 'Rune bolts', quantity: '20-25', rarity: '8/128', wikiFile: 'Rune bolts 5' },
          { name: 'Rune arrow', quantity: '100-105', rarity: '8/128', wikiFile: 'Rune arrow 5' },
          { name: 'Dragon bolts (e)', quantity: '5-10', rarity: '8/128', wikiFile: 'Dragon bolts (e) 5' },
        ],
      },
      {
        name: 'Seeds',
        items: [
          { name: 'Dwarf weed seed', quantity: '3', rarity: '16/128', wikiFile: 'Dwarf weed seed 5' },
          { name: 'Yew seed', quantity: '1', rarity: '1/128', wikiFile: 'Yew seed 5' },
        ],
      },
      {
        name: 'Salvage',
        items: [
          { name: 'Small spiky rune salvage', quantity: '1', rarity: '8/128' },
          { name: 'Medium bladed rune salvage', quantity: '1', rarity: '7/128' },
        ],
      },
      {
        name: 'Other',
        items: [
          { name: 'Coins', quantity: '19,500-20,000', rarity: '44.5/128', wikiFile: 'Coins 10000' },
          { name: 'Black dragonhide body', quantity: '1', rarity: '8/128' },
          { name: 'Super ranging potion (3)', quantity: '3', rarity: '8/128' },
          { name: 'Super defence (3)', quantity: '3', rarity: '8/128' },
          { name: 'Crushed nest', quantity: '10-15 (noted)', rarity: '8/128' },
          { name: 'Crystal key', quantity: '1', rarity: '1/128' },
        ],
      },
      {
        name: 'Gem & rare drop table',
        items: [
          { name: 'Gem drop table', quantity: '', rarity: '2/128', note: 'Rolls a random uncut gem.', wikiUrl: 'https://runescape.wiki/w/Gem_drop_table', noIcon: true },
          { name: 'Rare drop table', quantity: '', rarity: '1/100', note: "Rolls from RS3's shared rare drop table.", wikiUrl: 'https://runescape.wiki/w/Rare_drop_table', noIcon: true },
        ],
      },
      {
        name: 'Tertiary',
        items: [
          { name: 'Giant feather', quantity: '1', rarity: '1/5,000', note: 'Boss pet drop.' },
          { name: 'Long bone', quantity: '1', rarity: '1/400' },
          { name: 'Curved bone', quantity: '1', rarity: '1/5,000' },
          { name: 'Sealed clue scroll (hard)', quantity: '1', rarity: '10/1,280' },
          { name: 'Sealed clue scroll (elite)', quantity: '1', rarity: '495/128,000' },
          { name: 'Sealed clue scroll (master)', quantity: '1', rarity: '5/128,000' },
          { name: 'Spirit sapphire', quantity: '1', rarity: '5/2,000' },
          { name: 'Spirit emerald', quantity: '1', rarity: '3/2,000' },
          { name: 'Spirit ruby', quantity: '1', rarity: '2/2,000' },
          { name: 'Starved ancient effigy', quantity: '1', rarity: '1/128' },
          { name: 'Mimic kill token', quantity: '1', rarity: '1/9,420' },
          { name: 'Warpriest of Armadyl helm', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Armadyl helm (75)' },
          { name: 'Warpriest of Armadyl cuirass', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Armadyl cuirass (75)' },
          { name: 'Warpriest of Armadyl greaves', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Armadyl greaves (75)' },
          { name: 'Warpriest of Armadyl gauntlets', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Armadyl gauntlets (75)' },
          { name: 'Warpriest of Armadyl boots', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Armadyl boots (75)' },
          { name: 'Warpriest of Armadyl cape', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Armadyl cape (75)' },
          { name: "Armadyl's Assault", quantity: '1', rarity: '1/64', note: 'Dropped to every player in the room.' },
          { name: 'Furniture plans: Armadyl rug', quantity: '1', rarity: 'Unknown', wikiFile: 'Furniture plans- Armadyl rug', noIcon: true },
          { name: 'Furniture plans: Armadyl altar', quantity: '1', rarity: 'Unknown', wikiFile: 'Furniture plans- Armadyl altar', noIcon: true },
          { name: "Kree'arra's head", quantity: '1', rarity: '1/500' },
        ],
      },
      {
        name: 'Charms',
        items: [
          { name: 'Gold charm', quantity: '1', rarity: '100.776/1,000' },
          { name: 'Green charm', quantity: '1', rarity: '50.388/1,000' },
          { name: 'Crimson charm', quantity: '1', rarity: '100.776/1,000' },
          { name: 'Blue charm', quantity: '1', rarity: '161.242/1,000' },
        ],
      },
    ],
  },
  {
    name: "K'ril Tsutsaroth",
    slug: 'kril-tsutsaroth',
    wikiUrl: "https://runescape.wiki/w/K%27ril_Tsutsaroth",
    image: "K'ril Tsutsaroth.png",
    combatLevel: 650,
    location: "Zamorak's Fortress, God Wars Dungeon",
    sections: [
      {
        name: 'Guaranteed',
        items: [{ name: 'Infernal ashes', quantity: '1', rarity: 'Always' }],
      },
      {
        name: 'Unique',
        items: [
          { name: 'Hood of subjugation', quantity: '1', rarity: '1/512' },
          { name: 'Garb of subjugation', quantity: '1', rarity: '1/512' },
          { name: 'Gown of subjugation', quantity: '1', rarity: '1/512' },
          { name: 'Gloves of subjugation', quantity: '1', rarity: '1/512' },
          { name: 'Boots of subjugation', quantity: '1', rarity: '1/512' },
          { name: 'Ward of subjugation', quantity: '1', rarity: '1/512' },
          { name: 'Zamorakian spear', quantity: '1', rarity: '1/512' },
          { name: 'Steam battlestaff', quantity: '1', rarity: '1/512' },
          { name: 'Godsword shard 1', quantity: '1', rarity: '1/768' },
          { name: 'Godsword shard 2', quantity: '1', rarity: '1/768' },
          { name: 'Godsword shard 3', quantity: '1', rarity: '1/768' },
          { name: 'Zamorak hilt', quantity: '1', rarity: '1/512' },
        ],
      },
      {
        name: 'Furniture plans',
        items: [
          { name: 'Furniture plans: Zamorak altar', quantity: '1', rarity: 'Unknown', wikiFile: 'Furniture plans- Zamorak altar', noIcon: true },
          { name: 'Furniture plans: Zamorak rug', quantity: '1', rarity: 'Unknown', wikiFile: 'Furniture plans- Zamorak rug', noIcon: true },
        ],
      },
      {
        name: 'Other',
        items: [
          { name: 'Coins', quantity: '19,500-21,000', rarity: '30/128', wikiFile: 'Coins 10000' },
          { name: 'Super restore (3)', quantity: '3', rarity: '16/128' },
          { name: 'Zamorak brew (3)', quantity: '3', rarity: '16/128' },
          { name: 'Lantadyme seed', quantity: '3', rarity: '12/128', wikiFile: 'Lantadyme seed 5' },
          { name: 'Infernal ashes', quantity: '5 (noted)', rarity: '11/128' },
          { name: 'Medium bladed rune salvage', quantity: '1', rarity: '11/128' },
          { name: 'Huge plated adamant salvage', quantity: '1', rarity: '11/128' },
          { name: 'Super attack (3)', quantity: '3', rarity: '11/128' },
          { name: 'Super strength (3)', quantity: '3', rarity: '11/128' },
          { name: 'Large plated rune salvage', quantity: '1', rarity: '9/128' },
          { name: 'Orichalcite stone spirit', quantity: '3', rarity: '9/128' },
          { name: 'Wine of Zamorak', quantity: '2-10 (noted)', rarity: '4/128' },
        ],
      },
      {
        name: 'Gem & rare drop table',
        items: [
          { name: 'Gem drop table', quantity: '', rarity: '2/128', note: 'Rolls a random uncut gem.', wikiUrl: 'https://runescape.wiki/w/Gem_drop_table', noIcon: true },
          { name: 'Rare drop table', quantity: '', rarity: '2/128', note: "Rolls from RS3's shared rare drop table.", wikiUrl: 'https://runescape.wiki/w/Rare_drop_table', noIcon: true },
        ],
      },
      {
        name: 'Tertiary',
        items: [
          { name: 'Warpriest of Zamorak helm', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Zamorak helm (75)' },
          { name: 'Warpriest of Zamorak cuirass', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Zamorak cuirass (75)' },
          { name: 'Warpriest of Zamorak greaves', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Zamorak greaves (75)' },
          { name: 'Warpriest of Zamorak gauntlets', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Zamorak gauntlets (75)' },
          { name: 'Warpriest of Zamorak boots', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Zamorak boots (75)' },
          { name: 'Warpriest of Zamorak cape', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Zamorak cape (75)' },
          { name: "Razulei's Tale", quantity: '1', rarity: '1/64', note: 'Dropped to every player in the room.' },
          { name: 'Spirit sapphire', quantity: '1', rarity: '5/2,000' },
          { name: 'Spirit emerald', quantity: '1', rarity: '3/2,000' },
          { name: 'Spirit ruby', quantity: '1', rarity: '2/2,000' },
          { name: 'Sealed clue scroll (hard)', quantity: '1', rarity: '10/1,280' },
          { name: 'Sealed clue scroll (elite)', quantity: '1', rarity: '594/128,000' },
          { name: 'Sealed clue scroll (master)', quantity: '1', rarity: '6/128,000' },
          { name: 'Starved ancient effigy', quantity: '1', rarity: '1/128' },
          { name: 'Severed hoof', quantity: '1', rarity: '1/5,000', note: 'Boss pet drop.' },
          { name: "K'ril Tsutsaroth shoulder guard", quantity: '1', rarity: '1/500' },
        ],
      },
      {
        name: 'Charms',
        items: [
          { name: 'Gold charm', quantity: '1', rarity: '10%' },
          { name: 'Green charm', quantity: '1', rarity: '5%' },
          { name: 'Crimson charm', quantity: '1', rarity: '10%' },
          { name: 'Blue charm', quantity: '1', rarity: '16%' },
        ],
      },
    ],
  },
  {
    name: 'General Graardor',
    slug: 'general-graardor',
    wikiUrl: 'https://runescape.wiki/w/General_Graardor',
    image: 'General Graardor.png',
    combatLevel: 624,
    location: "Bandos's Stronghold, God Wars Dungeon",
    sections: [
      {
        name: 'Guaranteed',
        items: [{ name: 'Ourg bones', quantity: '1', rarity: 'Always', wikiFile: 'Ourg bones (General Graardor)' }],
      },
      {
        name: 'Unique',
        items: [
          { name: 'Bandos helmet', quantity: '1', rarity: '1/384' },
          { name: 'Bandos chestplate', quantity: '1', rarity: '1/384' },
          { name: 'Bandos tassets', quantity: '1', rarity: '1/384' },
          { name: 'Bandos gloves', quantity: '1', rarity: '1/384' },
          { name: 'Bandos boots', quantity: '1', rarity: '1/384' },
          { name: 'Bandos warshield', quantity: '1', rarity: '1/384' },
          { name: 'Bandos hilt', quantity: '1', rarity: '1/512' },
          { name: 'Godsword shard 1', quantity: '1', rarity: '1/768' },
          { name: 'Godsword shard 2', quantity: '1', rarity: '1/768' },
          { name: 'Godsword shard 3', quantity: '1', rarity: '1/768' },
        ],
      },
      {
        name: 'Stone spirits',
        items: [
          { name: 'Runite stone spirit', quantity: '3', rarity: '4/128' },
          { name: 'Drakolith stone spirit', quantity: '3', rarity: '8/128' },
          { name: 'Orichalcite stone spirit', quantity: '3', rarity: '8/128' },
        ],
      },
      {
        name: 'Salvage',
        items: [
          { name: 'Medium bladed rune salvage', quantity: '1', rarity: '8/128' },
          { name: 'Medium spiky rune salvage', quantity: '1', rarity: '6/128' },
          { name: 'Large bladed rune salvage', quantity: '1', rarity: '8/128' },
          { name: 'Huge plated rune salvage', quantity: '1', rarity: '8/128' },
        ],
      },
      {
        name: 'Other',
        items: [
          { name: 'Coins', quantity: '19,500-20,000', rarity: '32/128', wikiFile: 'Coins 10000' },
          { name: 'Snapdragon seed', quantity: '1', rarity: '16/128', wikiFile: 'Snapdragon seed 5' },
          { name: 'Ourg bones', quantity: '3 (noted)', rarity: '8/128', wikiFile: 'Ourg bones (General Graardor)' },
          { name: 'Magic logs', quantity: '15-20 (noted)', rarity: '8/128' },
          { name: 'Super restore (4)', quantity: '3', rarity: '7/128' },
        ],
      },
      {
        name: 'Gem & rare drop table',
        items: [
          { name: 'Gem drop table', quantity: '', rarity: '6/128', note: 'Rolls a random uncut gem.', wikiUrl: 'https://runescape.wiki/w/Gem_drop_table', noIcon: true },
          { name: 'Rare drop table', quantity: '', rarity: '1/100', note: "Rolls from RS3's shared rare drop table.", wikiUrl: 'https://runescape.wiki/w/Rare_drop_table', noIcon: true },
        ],
      },
      {
        name: 'Tertiary',
        items: [
          { name: 'The Glory of General Graardor', quantity: '1', rarity: '1/57', note: 'Dropped to every player in the room, alongside a unique.' },
          { name: 'Sealed clue scroll (hard)', quantity: '1', rarity: '10/1,280' },
          { name: 'Sealed clue scroll (elite)', quantity: '1', rarity: '495/128,000' },
          { name: 'Sealed clue scroll (master)', quantity: '1', rarity: '5/128,000' },
          { name: 'Decaying tooth', quantity: '1', rarity: '1/5,000', note: 'Boss pet drop.' },
          { name: 'Warpriest of Bandos helm', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Bandos helm (75)' },
          { name: 'Warpriest of Bandos cuirass', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Bandos cuirass (75)' },
          { name: 'Warpriest of Bandos greaves', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Bandos greaves (75)' },
          { name: 'Warpriest of Bandos gauntlets', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Bandos gauntlets (75)' },
          { name: 'Warpriest of Bandos boots', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Bandos boots (75)' },
          { name: 'Warpriest of Bandos cape', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Bandos cape (75)' },
          { name: 'Spirit sapphire', quantity: '1', rarity: '5/2,000' },
          { name: 'Spirit emerald', quantity: '1', rarity: '3/2,000' },
          { name: 'Spirit ruby', quantity: '1', rarity: '2/2,000' },
          { name: 'Starved ancient effigy', quantity: '1', rarity: '1/128' },
          { name: 'Mimic kill token', quantity: '1', rarity: '1/9,376' },
          { name: "General Graardor's head", quantity: '1', rarity: '1/500' },
          { name: 'Furniture plans: Bandos rug', quantity: '1', rarity: 'Unknown', wikiFile: 'Furniture plans- Bandos rug', noIcon: true },
          { name: 'Furniture plans: Bandos altar', quantity: '1', rarity: 'Unknown', wikiFile: 'Furniture plans- Bandos altar', noIcon: true },
        ],
      },
      {
        name: 'Charms',
        items: [
          { name: 'Gold charm', quantity: '1', rarity: '100.776/1,000' },
          { name: 'Green charm', quantity: '1', rarity: '50.388/1,000' },
          { name: 'Crimson charm', quantity: '1', rarity: '100.776/1,000' },
          { name: 'Blue charm', quantity: '1', rarity: '161.242/1,000' },
        ],
      },
    ],
  },
  {
    name: 'Commander Zilyana',
    slug: 'commander-zilyana',
    wikiUrl: 'https://runescape.wiki/w/Commander_Zilyana',
    image: 'Commander Zilyana.png',
    combatLevel: 596,
    location: "Saradomin's Encampment, God Wars Dungeon",
    sections: [
      {
        name: 'Guaranteed',
        items: [{ name: 'Bones', quantity: '1', rarity: 'Always' }],
      },
      {
        name: 'Unique',
        items: [
          { name: 'Saradomin sword', quantity: '1', rarity: '1/320' },
          { name: 'Armadyl crossbow', quantity: '1', rarity: '1/640' },
          { name: 'Off-hand Armadyl crossbow', quantity: '1', rarity: '1/640' },
          { name: "Saradomin's murmur", quantity: '1', rarity: '1/320' },
          { name: "Saradomin's hiss", quantity: '1', rarity: '1/320' },
          { name: "Saradomin's whisper", quantity: '1', rarity: '1/320' },
          { name: "Saradomin's hum", quantity: '1', rarity: 'Very rare' },
          { name: 'Saradomin hilt', quantity: '1', rarity: '1/512' },
          { name: 'Godsword shard 1', quantity: '1', rarity: '1/768' },
          { name: 'Godsword shard 2', quantity: '1', rarity: '1/768' },
          { name: 'Godsword shard 3', quantity: '1', rarity: '1/768' },
        ],
      },
      {
        name: 'Weapons',
        items: [
          { name: 'Rune dart', quantity: '35-40', rarity: '4/128' },
          { name: 'Off-hand rune dart', quantity: '35-40', rarity: '4/128' },
        ],
      },
      {
        name: 'Consumables',
        items: [
          { name: 'Super magic potion (3)', quantity: '3', rarity: '8/128' },
          { name: 'Super defence (3)', quantity: '3', rarity: '8/128' },
          { name: 'Prayer potion (4)', quantity: '3', rarity: '8/128' },
          { name: 'Saradomin brew (3)', quantity: '3', rarity: '6/128' },
          { name: 'Super restore (4)', quantity: '3', rarity: '6/128' },
        ],
      },
      {
        name: 'Seeds',
        items: [
          { name: 'Ranarr seed', quantity: '2', rarity: '16/128', wikiFile: 'Ranarr seed 5' },
          { name: 'Magic seed', quantity: '1', rarity: '1/128', wikiFile: 'Magic seed 5' },
        ],
      },
      {
        name: 'Salvage',
        items: [
          { name: 'Huge plated adamant salvage', quantity: '1', rarity: '8/128' },
          { name: 'Large plated rune salvage', quantity: '1', rarity: '15/128' },
        ],
      },
      {
        name: 'Other',
        items: [
          { name: 'Coins', quantity: '19,500-20,000', rarity: '31/128', wikiFile: 'Coins 10000' },
          { name: 'Battlestaff', quantity: '2 (noted)', rarity: '8/128' },
          { name: 'Unicorn horn', quantity: '5-10 (noted)', rarity: '8/128' },
          { name: 'Diamond', quantity: '6 (noted)', rarity: '8/128' },
        ],
      },
      {
        name: 'Gem & rare drop table',
        items: [
          { name: 'Gem drop table', quantity: '', rarity: '2/128', note: 'Rolls a random uncut gem.', wikiUrl: 'https://runescape.wiki/w/Gem_drop_table', noIcon: true },
          { name: 'Rare drop table', quantity: '', rarity: '1/100', note: "Rolls from RS3's shared rare drop table.", wikiUrl: 'https://runescape.wiki/w/Rare_drop_table', noIcon: true },
        ],
      },
      {
        name: 'Tertiary',
        items: [
          { name: 'Warpriest of Saradomin helm', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Saradomin helm (75)' },
          { name: 'Warpriest of Saradomin cuirass', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Saradomin cuirass (75)' },
          { name: 'Warpriest of Saradomin greaves', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Saradomin greaves (75)' },
          { name: 'Warpriest of Saradomin gauntlets', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Saradomin gauntlets (75)' },
          { name: 'Warpriest of Saradomin boots', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Saradomin boots (75)' },
          { name: 'Warpriest of Saradomin cape', quantity: '1', rarity: '1/768', wikiFile: 'Warpriest of Saradomin cape (75)' },
          { name: "Zilyana's Notes", quantity: '1', rarity: '1/57', note: 'Dropped to every player in the room, alongside a unique.' },
          { name: 'Sealed clue scroll (hard)', quantity: '1', rarity: '10/1,280' },
          { name: 'Sealed clue scroll (elite)', quantity: '1', rarity: '495/128,000' },
          { name: 'Sealed clue scroll (master)', quantity: '1', rarity: '5/128,000' },
          { name: 'Starved ancient effigy', quantity: '1', rarity: '1/128' },
          { name: 'Auburn lock', quantity: '1', rarity: '1/5,000', note: 'Boss pet drop.' },
          { name: 'Furniture plans: Saradomin rug', quantity: '1', rarity: 'Unknown', wikiFile: 'Furniture plans- Saradomin rug', noIcon: true },
          { name: 'Furniture plans: Saradomin altar', quantity: '1', rarity: 'Unknown', wikiFile: 'Furniture plans- Saradomin altar', noIcon: true },
          { name: "Zilyana's wings", quantity: '1', rarity: '1/500' },
        ],
      },
      {
        name: 'Charms',
        items: [
          { name: 'Gold charm', quantity: '1', rarity: '100.776/1,000' },
          { name: 'Green charm', quantity: '1', rarity: '50.388/1,000' },
          { name: 'Crimson charm', quantity: '1', rarity: '100.776/1,000' },
          { name: 'Blue charm', quantity: '1', rarity: '161.242/1,000' },
        ],
      },
    ],
  },
  {
    name: 'Nex',
    slug: 'nex',
    wikiUrl: 'https://runescape.wiki/w/Nex',
    image: 'Nex.png',
    combatLevel: 1001,
    location: 'Ancient Prison, God Wars Dungeon',
    sections: [
      {
        name: 'Guaranteed',
        items: [
          { name: 'Big bones', quantity: '1', rarity: 'Always' },
          { name: 'Zaryte fragments', quantity: '1', rarity: 'Always', note: "Only during the Kili's Knowledge VI (power) relic power, if Nex is killed with necromancy." },
        ],
      },
      {
        name: 'Main drop (6/128 chance to roll)',
        items: [
          { name: 'Torva full helm', quantity: '1', rarity: '1/384' },
          { name: 'Torva platebody', quantity: '1', rarity: '1/384' },
          { name: 'Torva platelegs', quantity: '1', rarity: '1/384' },
          { name: 'Torva boots', quantity: '1', rarity: '1/384' },
          { name: 'Torva gloves', quantity: '1', rarity: '1/384' },
          { name: 'Pernix cowl', quantity: '1', rarity: '1/384' },
          { name: 'Pernix body', quantity: '1', rarity: '1/384' },
          { name: 'Pernix chaps', quantity: '1', rarity: '1/384' },
          { name: 'Pernix boots', quantity: '1', rarity: '1/384' },
          { name: 'Pernix gloves', quantity: '1', rarity: '1/384' },
          { name: 'Virtus mask', quantity: '1', rarity: '1/384' },
          { name: 'Virtus robe top', quantity: '1', rarity: '1/384' },
          { name: 'Virtus robe legs', quantity: '1', rarity: '1/384' },
          { name: 'Virtus boots', quantity: '1', rarity: '1/384' },
          { name: 'Virtus gloves', quantity: '1', rarity: '1/384' },
          { name: 'Virtus wand', quantity: '1', rarity: '1/384' },
          { name: 'Virtus book', quantity: '1', rarity: '1/384' },
          { name: 'Zaryte bow', quantity: '1', rarity: '1/384' },
        ],
      },
      {
        name: 'Seeds',
        items: [
          { name: 'Avantoe seed', quantity: '8', rarity: '11/128', wikiFile: 'Avantoe seed 5' },
          { name: 'Dwarf weed seed', quantity: '8', rarity: '11/128', wikiFile: 'Dwarf weed seed 5' },
          { name: 'Torstol seed', quantity: '5', rarity: '8/128', wikiFile: 'Torstol seed 5' },
          { name: 'Torstol seed', quantity: '12', rarity: '6/128', wikiFile: 'Torstol seed 5' },
          { name: 'Magic seed', quantity: '5', rarity: '8/128', wikiFile: 'Magic seed 5' },
        ],
      },
      {
        name: 'Other',
        items: [
          { name: 'Saradomin brew (4)', quantity: '10', rarity: '8/128' },
          { name: 'Super restore (4)', quantity: '30', rarity: '8/128' },
          { name: 'Saradomin brew (4)', quantity: '30', rarity: '29/128' },
          { name: 'Super restore (4)', quantity: '10', rarity: '29/128' },
          { name: 'Magic logs', quantity: '375 (noted)', rarity: '8/128' },
          { name: 'Phasmatite stone spirit', quantity: '20', rarity: '16/128' },
          { name: 'Necrite stone spirit', quantity: '20', rarity: '8/128' },
          { name: 'Green dragonhide', quantity: '400 (noted)', rarity: '8/128' },
          { name: 'Uncut dragonstone', quantity: '20 (noted)', rarity: '8/128' },
          { name: 'Onyx bolts (e)', quantity: '375', rarity: '10/128', wikiFile: 'Onyx bolts (e) 5' },
        ],
      },
      {
        name: 'Rare drop table',
        items: [
          { name: 'Rare drop table', quantity: '', rarity: '1/50', note: "Two rolls against RS3's shared rare drop table.", wikiUrl: 'https://runescape.wiki/w/Rare_drop_table', noIcon: true },
        ],
      },
      {
        name: 'Tertiary',
        items: [
          { name: 'Ancient emblem', quantity: '1', rarity: '1/50', note: 'Requires a tier 70+ defender equipped or carried.' },
          { name: "Nex's Followers", quantity: '1', rarity: '3/64', note: 'Only alongside a unique drop; reappears until collected.' },
          { name: 'Sealed clue scroll (hard)', quantity: '1', rarity: '10/1,280' },
          { name: 'Sealed clue scroll (elite)', quantity: '1', rarity: '594/128,000' },
          { name: 'Sealed clue scroll (master)', quantity: '1', rarity: '6/128,000' },
          { name: 'Blood-soaked feather', quantity: '1', rarity: '1/2,000', note: 'Boss pet drop.' },
          { name: 'Starved ancient effigy', quantity: '1', rarity: '1/180' },
          { name: 'Mimic kill token', quantity: '1', rarity: '1/8,999' },
          { name: "Nex's wings", quantity: '1', rarity: '1/500' },
        ],
      },
      {
        name: 'Charms',
        items: [
          { name: 'Gold charm', quantity: '20', rarity: '26.874/1,000' },
          { name: 'Green charm', quantity: '20', rarity: '13.437/1,000' },
          { name: 'Crimson charm', quantity: '20', rarity: '48.372/1,000' },
          { name: 'Blue charm', quantity: '20', rarity: '239.176/1,000' },
        ],
      },
    ],
  },
];
