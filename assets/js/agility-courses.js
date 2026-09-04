/**
 * Every current RS3 Agility training course — level requirement, per-lap
 * (or per-circuit) XP, and rough lap time — for the Agility XP calculator
 * (the first skill in the planned skill-by-skill calculator rollout; see
 * xp-table.js for the level<->XP curve the calculator itself will need
 * alongside this).
 *
 * Hand-transcribed from the wiki's own "Agility courses" section
 * (https://runescape.wiki/w/Agility#Agility_courses) — BUT that article
 * turned out to be only *partly* updated for the 2026 Agility course
 * rebalance (two separate wiki update pages:
 * https://runescape.wiki/w/2026_early-game_rebalance, which increased
 * Burthorpe/Gnome Stronghold/Agility Pyramid/Penguin/Barbarian Outpost, and
 * https://runescape.wiki/w/2026_mid-game_rebalance, which increased
 * everything from Ape Atoll up through Hefin/Dorgesh-Kaan/Anachronia).
 * Cross-checking every course against both rebalance pages' own
 * before/after tables found the main article already current for most
 * courses, but still showing pre-rebalance numbers for Hefin (all five
 * level brackets), Dorgesh-Kaan, and Anachronia specifically — those three
 * were re-sourced from their own individual wiki pages instead (which
 * *were* updated), not the shared Agility article. The older
 * Calculator:Agility page (https://runescape.wiki/w/Calculator:Agility,
 * template source at Calculator:Template/Agility) was checked too, but
 * it's missing Burthorpe, Het's Oasis and Anachronia entirely and is stale
 * everywhere else it overlaps — not used as a source for anything here.
 *
 * Every other course's `xpPerLap` sums to that course's own per-obstacle
 * XP table, cross-checked against its own quoted "roughly N experience per
 * hour" figure (xpPerHour = 3600/lapTimeSeconds * xpPerLap, allowing for
 * rounding).
 *
 * Not hand-maintained data in the usual sense (nothing here is edited by
 * hand *day to day*), but there's no structured API for it (no Bucket
 * table backs individual course XP the way quest-data/fetch-quests.mjs's
 * infobox_quest table does) — re-transcribe from the wiki by hand if a new
 * course ships or another rebalance lands. A wiki update-log page (like the
 * two rebalance pages above) is the fastest way to notice the latter: it
 * names exactly which courses moved, which is what caught Hefin/Dorgesh-
 * Kaan/Anachronia being stale here in the first place — the shared Agility
 * article's own prose gave no hint anything was out of date.
 *
 * All Agility training past level 5 requires membership (free-to-play is
 * capped at level 5 with no course of its own), so that's not repeated per
 * course below.
 *
 * Shape, per course:
 * - `levelRequirement` — number, or the *lowest* unlock for a course with
 *   several gated sections (Anachronia) — see its own note.
 * - `requirements` — quests/items/other-skill levels beyond the Agility
 *   level itself, plain text, empty array if none.
 * - `xpPerLap` / `xpPerHour` — null on courses with no single "one lap, one
 *   total" shape (Brimhaven's ticket mechanic, Werewolf Skullball's
 *   pass/fail timing, Hefin's level-scaling, Dorgesh-Kaan's route choice,
 *   Anachronia's per-section structure) — see each one's own `variants`
 *   instead.
 * - `variants` — only present where a calculator needs to offer more than
 *   one selectable option for the same course (a level bracket, a route
 *   choice, a section); absent everywhere else.
 */

export const AGILITY_COURSES = [
  {
    name: 'Burthorpe Agility Course',
    slug: 'burthorpe',
    wikiUrl: 'https://runescape.wiki/w/Burthorpe_Agility_Course',
    levelRequirement: 1,
    requirements: [],
    lapTimeSeconds: 36,
    xpPerLap: 139.2,
    xpPerHour: 13920,
    notes: 'No obstacle can be failed, so no food is needed. 6 obstacles (9.2 xp each) plus a 74.8 lap bonus.',
  },
  {
    name: 'Gnome Stronghold Agility Course',
    slug: 'gnome-stronghold',
    wikiUrl: 'https://runescape.wiki/w/Gnome_Stronghold_Agility_Course',
    levelRequirement: 1,
    requirements: [],
    lapTimeSeconds: 33.6,
    xpPerLap: 130,
    xpPerHour: 13928.5,
    notes: 'No obstacle can be failed, so no food is needed. The recommended starting course.',
  },
  {
    name: 'Advanced Gnome Stronghold Agility Course',
    slug: 'gnome-stronghold-advanced',
    wikiUrl: 'https://runescape.wiki/w/Gnome_Stronghold_Agility_Course#Advanced_course',
    levelRequirement: 85,
    requirements: [],
    lapTimeSeconds: 40,
    xpPerLap: 1800.5,
    xpPerHour: 162045,
    notes:
      'Begins at the same spot as the regular course; the signpost run can be failed below level 89. ' +
      'Every 250 laps without failing earns a piece of agile armour (legs).',
  },
  {
    name: 'Brimhaven Agility Arena',
    slug: 'brimhaven-arena',
    wikiUrl: 'https://runescape.wiki/w/Brimhaven_Agility_Arena',
    levelRequirement: 1,
    requirements: ['200 coins per visit (free after Rocking Out)'],
    lapTimeSeconds: null,
    xpPerLap: null,
    xpPerHour: 20000,
    notes:
      'Not lap-based — tag the flashing pillar for a ticket, redeemable for XP. The marked pillar changes ' +
      'once a minute, capping this at 60 tickets (roughly 20,000 xp) per hour regardless of Agility level.',
  },
  {
    name: 'Agility Pyramid',
    slug: 'agility-pyramid',
    wikiUrl: 'https://runescape.wiki/w/Agility_Pyramid',
    levelRequirement: 30,
    requirements: ['Water source (desert heat)'],
    lapTimeSeconds: 140,
    xpPerLap: 1500,
    xpPerHour: 38571.4,
    notes: 'Obstacles can be failed. The pyramid top artefact reached on each lap sells to Simon Templeton for 1,000 coins.',
  },
  {
    name: 'Penguin Agility Course',
    slug: 'penguin',
    wikiUrl: 'https://runescape.wiki/w/Penguin_Agility_Course',
    levelRequirement: 30,
    requirements: ['Cold War (partial)', 'Clockwork suit (Penguin suit)'],
    lapTimeSeconds: 70,
    xpPerLap: 900,
    xpPerHour: 46285.7,
    notes: 'All four obstacles can be failed — food/agility potions recommended.',
  },
  {
    name: 'Barbarian Outpost Agility Course',
    slug: 'barbarian-outpost',
    wikiUrl: 'https://runescape.wiki/w/Barbarian_Outpost_Agility_Course',
    levelRequirement: 35,
    requirements: ['Bar Crawl (miniquest)'],
    lapTimeSeconds: 30,
    xpPerLap: 350,
    xpPerHour: 42000,
    notes: 'Several obstacles can be failed — food recommended. A temporary Agility boost can squeeze through the entrance tunnel below level 35.',
  },
  {
    name: 'Advanced Barbarian Outpost Agility Course',
    slug: 'barbarian-outpost-advanced',
    wikiUrl: 'https://runescape.wiki/w/Barbarian_Outpost_Agility_Course#Advanced_course',
    levelRequirement: 90,
    requirements: [],
    lapTimeSeconds: 40,
    xpPerLap: 2000,
    xpPerHour: 180000,
    notes:
      'Runs up the wall instead of climbing the obstacle net. Obstacles stop failing at level 93. Every 250 laps ' +
      'without failing earns a piece of agile armour (top).',
  },
  {
    name: 'Ape Atoll Agility Course',
    slug: 'ape-atoll',
    wikiUrl: 'https://runescape.wiki/w/Ape_Atoll_Agility_Course',
    levelRequirement: 48,
    requirements: ['Monkey Madness', 'Ninja monkey greegree (small)'],
    lapTimeSeconds: 42,
    xpPerLap: 615,
    xpPerHour: 52714.2,
    notes: 'Obstacles can be failed below level 75. A respawning pineapple at the end of the course doubles as food.',
  },
  {
    name: 'Wilderness Agility Course',
    slug: 'wilderness',
    wikiUrl: 'https://runescape.wiki/w/Wilderness_Agility_Course',
    levelRequirement: 52,
    requirements: ['Level 50–53 Wilderness (PvP risk)'],
    lapTimeSeconds: 42,
    xpPerLap: 571.4,
    xpPerHour: 48977.1,
    notes: 'Temporary Agility boosts (agility potion, summer pie) can be used to enter below level 52.',
  },
  {
    name: 'Werewolf Agility Course',
    slug: 'werewolf',
    wikiUrl: 'https://runescape.wiki/w/Werewolf_Agility_Course',
    levelRequirement: 60,
    requirements: ['Creature of Fenkenstrain', 'Ring of charos'],
    lapTimeSeconds: 43,
    xpPerLap: 750,
    xpPerHour: 62790.6,
    notes:
      'xpPerLap assumes picking up the stick along the course and returning it for its +264 bonus each lap ' +
      '(obstacles alone total 486); the zip line is the only failable obstacle, and failure drops off sharply past level 72.',
  },
  {
    name: 'Bandos Agility Course',
    slug: 'bandos',
    wikiUrl: 'https://runescape.wiki/w/Bandos_Agility_Course',
    levelRequirement: 60,
    requirements: ['The Chosen Commander', '60 Ranged', '60 Strength', 'Crossbow', 'Mithril grapple or enhanced grappling hook'],
    lapTimeSeconds: 31.2,
    xpPerLap: 585,
    xpPerHour: 67500,
    notes:
      'Also trains Ranged and Strength: +125 each per lap (14,423 xp/hour each). Every obstacle but the jump-to-ledge, ' +
      'grapple spear and jump-down-throne can be failed; the ourg-statue jump keeps a failure chance even at level 99.',
    xpPerLapOther: { ranged: 125, strength: 125 },
  },
  {
    name: "Het's Oasis Agility Course",
    slug: 'hets-oasis',
    wikiUrl: "https://runescape.wiki/w/Het's_Oasis_Agility_Course",
    levelRequirement: 65,
    requirements: [],
    lapTimeSeconds: 105,
    xpPerLap: 2045,
    xpPerHour: 70114,
    notes: 'No lap bonus — every obstacle just adds its own XP, but the last obstacle’s XP drops 1% per obstacle failed that lap.',
  },
  {
    name: 'Hefin Agility Course',
    slug: 'hefin',
    wikiUrl: 'https://runescape.wiki/w/Hefin_Agility_Course',
    levelRequirement: 77,
    requirements: ["Plague's End"],
    lapTimeSeconds: 44,
    xpPerLap: null,
    xpPerHour: null,
    notes:
      'No obstacle can ever be failed. Per-lap XP scales with Agility level (six obstacles plus a lap bonus) — see `variants`. ' +
      'Multiply by 1.2 while Voice of Seren is active in the Hefin district. Figures below are the 2026 mid-game-rebalance ' +
      'ones (runescape.wiki/w/2026_mid-game_rebalance) — the Agility article\'s own Hefin table still shows the pre-rebalance ' +
      'numbers (704/880/1056/1184/1328) as of this transcription.',
    voiceOfSerenMultiplier: 1.2,
    variants: [
      { label: 'Level 77–81', levelRequirement: 77, xpPerLap: 1200, xpPerHour: 102857.1 },
      { label: 'Level 82–86', levelRequirement: 82, xpPerLap: 1400, xpPerHour: 120000 },
      { label: 'Level 87–91', levelRequirement: 87, xpPerLap: 1600, xpPerHour: 137142.9 },
      { label: 'Level 92–96', levelRequirement: 92, xpPerLap: 1800, xpPerHour: 154285.7 },
      { label: 'Level 97+', levelRequirement: 97, xpPerLap: 2000, xpPerHour: 171428.6 },
    ],
  },
  {
    name: 'Dorgesh-Kaan Agility Course',
    slug: 'dorgesh-kaan',
    wikiUrl: 'https://runescape.wiki/w/Dorgesh-Kaan_Agility_Course',
    levelRequirement: 80,
    requirements: ['Death to the Dorgeshuun', 'Light source'],
    lapTimeSeconds: null,
    xpPerLap: null,
    xpPerHour: null,
    notes:
      'Four route combinations trade a shorter round trip for less XP (and two of them shift some of that XP to Ranged/' +
      'Strength instead) — see `variants`. Re-sourced from the course\'s own page rather than the shared Agility article, ' +
      "whose one-route summary (2,375 xp) is the pre-2026-mid-game-rebalance figure. The individual page itself notes the " +
      "two \"Both Route\" variants' slightly different Agility totals (2,858 vs 2,804) as an acknowledged bug/incomplete " +
      'rebalance, not two genuinely different routes.',
    variants: [
      {
        label: 'Agility Course Route both ways',
        xpPerLap: 5500,
        lapTimeSeconds: 152,
        xpPerHour: 130263.1,
      },
      {
        label: 'Ranged Grapple Route both ways',
        xpPerLap: 162,
        lapTimeSeconds: 70,
        xpPerHour: 8331.4,
        requirements: ['80 Strength', '80 Ranged', 'Mithril grapple or enhanced grappling hook', 'Crossbow'],
        xpPerLapOther: { ranged: 1250, strength: 108 },
        xpPerHourOther: { ranged: 64285.7, strength: 5554.2 },
      },
      {
        label: 'Both Route (Agility Course Route out, Ranged Grapple Route back)',
        xpPerLap: 2858,
        lapTimeSeconds: 111,
        xpPerHour: 92691.8,
        requirements: ['80 Strength', '80 Ranged', 'Mithril grapple or enhanced grappling hook', 'Crossbow'],
        xpPerLapOther: { ranged: 625, strength: 54 },
      },
      {
        label: 'Both Route (Ranged Grapple Route out, Agility Course Route back)',
        xpPerLap: 2804,
        lapTimeSeconds: 111,
        xpPerHour: 90940.5,
        requirements: ['80 Strength', '80 Ranged', 'Mithril grapple or enhanced grappling hook', 'Crossbow'],
        xpPerLapOther: { ranged: 625, strength: 54 },
      },
    ],
  },
  {
    name: 'Anachronia Agility Course',
    slug: 'anachronia',
    wikiUrl: 'https://runescape.wiki/w/Anachronia_Agility_Course',
    levelRequirement: 30,
    requirements: [],
    lapTimeSeconds: null,
    xpPerLap: null,
    xpPerHour: null,
    notes:
      'Seven individually-gated sections ring the island (A/G at level 30, B/F at 50, C/E at 70, D at 85 only) — a player ' +
      'can repeat just one open section as its own short loop, or, once level 85, run the whole 52-obstacle lap for a large ' +
      "completion bonus on top — see `variants` for both. Every obstacle is a flat 22 xp; re-sourced from the course's own " +
      'page rather than the shared Agility article, whose flat-20-xp/20,040-full-lap prose is the pre-2026-mid-game-' +
      'rebalance figure (current full lap is 28,000 — confirmed against the rebalance page\'s own before/after table too). ' +
      'A failed obstacle costs 5% of current health but never needs repeating, and does not reset section/lap progress.',
    xpPerObstacle: 22,
    maxLevelRequirement: 85,
    variants: [
      { label: 'Section A (level 30, northern beginner)', levelRequirement: 30, xpPerLap: 300, lapTimeSeconds: 34, xpPerHour: 31764.7 },
      { label: 'Section G (level 30, south-western beginner)', levelRequirement: 30, xpPerLap: 344, lapTimeSeconds: 70.5, xpPerHour: 17565.9 },
      { label: 'Section B (level 50, northern novice)', levelRequirement: 50, xpPerLap: 694, lapTimeSeconds: 64, xpPerHour: 39037.5 },
      { label: 'Section F (level 50, southern novice)', levelRequirement: 50, xpPerLap: 650, lapTimeSeconds: 56.7, xpPerHour: 41269.8 },
      { label: 'Section C (level 70, north-eastern advanced)', levelRequirement: 70, xpPerLap: 1300, lapTimeSeconds: 57.5, xpPerHour: 81391.3 },
      { label: 'Section E (level 70, south-eastern advanced)', levelRequirement: 70, xpPerLap: 1300, lapTimeSeconds: 70.5, xpPerHour: 66382.9 },
      { label: 'Section D (level 85 only, eastern)', levelRequirement: 85, xpPerLap: 1676, lapTimeSeconds: 69, xpPerHour: 87443.4 },
      {
        label: 'Full lap (all seven sections + completion bonus)',
        levelRequirement: 85,
        xpPerLap: 28000,
        lapTimeSeconds: 713,
        xpPerHour: 141459,
        notes:
          'lapTimeSeconds is derived from the wiki\'s own 141,459 xp/hour figure, not its "under 8 minutes 30 seconds" ' +
          '(510s) prose — the two are inconsistent with each other (510s would be ~197,600 xp/hour); the hourly figure is ' +
          'trusted as the more specific claim. Ability-assisted play (Surge/Dive/Bladed Dive) can reportedly push past ' +
          '184,985 xp/hour.',
      },
    ],
  },
  {
    name: 'Werewolf Skullball',
    slug: 'werewolf-skullball',
    wikiUrl: 'https://runescape.wiki/w/Werewolf_Skullball',
    levelRequirement: 25,
    requirements: ['Creature of Fenkenstrain', 'Ring of charos'],
    lapTimeSeconds: null,
    xpPerLap: null,
    xpPerHour: null,
    notes:
      'Not a lap course — kick a ball through 10 goals into an 11th at the same underground area as the Werewolf Agility ' +
      'Course. Pass timing decides the payout: under 3 minutes pays the higher amount, 3–8 minutes the lower, and the ball ' +
      'despawns for 0 xp past 8 minutes. Figures below are the 2026 early-game-rebalance ones.',
    variants: [
      { label: 'Under 3 minutes ("fast")', xpPerLap: 1200, xpPerHour: 28800 },
      { label: '3–8 minutes ("slow")', xpPerLap: 1000, xpPerHour: 20000 },
    ],
  },
];
