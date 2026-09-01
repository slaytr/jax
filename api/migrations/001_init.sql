-- Initial schema for the Postgres-backed Jax API.
--
-- Replaces data/players.json + data/latest.json + data/history/**  +
-- quest-data/quests.json as the canonical store — see the plan for the
-- reasoning behind each table. Applied by api/migrate.mjs, which tracks
-- filenames in schema_migrations so this only ever runs once per database.

-- ---------------------------------------------------------------------
-- Identity and roster
-- ---------------------------------------------------------------------

create table groups (
  id             int primary key default 1 check (id = 1),
  name           text not null,
  tagline        text not null default '',
  hiscores_url   text not null,
  tracking_since timestamptz not null default now()
);

create table players (
  slug          text primary key,
  name          text not null,
  hiscore_table text not null default 'main'
                  check (hiscore_table in ('main', 'ironman', 'hardcore')),
  -- Roster order: display order today, and the fallback index
  -- SERIES_COLOURS cycles through for a slug with no PLAYER_COLOURS entry.
  position      int  not null,
  -- One Discord account per slug — the whole ownership model. Null means
  -- unclaimed; claiming is a one-way write enforced at the API layer, not
  -- here, since "already owns a different slug" needs a cross-row check.
  discord_id    text unique,
  created_at    timestamptz not null default now()
);

create table users (
  discord_id   text primary key,
  username     text not null,
  avatar       text,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create table sessions (
  id         text primary key, -- 32 random bytes, base64url; the cookie value
  discord_id text not null references users (discord_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null
);
create index sessions_expires_at_idx on sessions (expires_at);

-- ---------------------------------------------------------------------
-- Current state — what data/latest.json holds today
-- ---------------------------------------------------------------------

create table group_state (
  id           int primary key default 1 check (id = 1),
  rank         int,
  total_level  int,
  total_xp     bigint,
  size         int,
  founder      boolean,
  external_id  int, -- groupRank.id from the ladder
  competitive  boolean,
  total_groups int,
  rivals       jsonb not null default '[]',
  source_url   text,
  stale        boolean not null default false,
  error        text,
  checked_at   timestamptz
);

create table player_state (
  player_slug     text primary key references players (slug) on delete cascade,
  fetched_at      timestamptz not null,
  stale           boolean not null default false,
  error           text,
  total_level     int    not null,
  total_xp        bigint not null,
  total_rank      int, -- null = unranked
  quest_points    int,
  quests_complete int,
  quests_stale    boolean not null default false,
  -- [{id,level,xp,rank}] x 30, verbatim from the feed. Kept as JSONB rather
  -- than normalised: rank is display-only and never queried, so a join buys
  -- nothing here.
  skills          jsonb not null,
  activities      jsonb not null default '[]'
);

-- Relational (unlike skills/activities above) because the server needs to
-- join this against goals.quest_name to decide quest-goal completion.
create table player_quest_status (
  player_slug text not null references players (slug) on delete cascade,
  quest_name  text not null,
  status      text not null check (status in ('completed', 'started')),
  primary key (player_slug, quest_name)
);

-- ---------------------------------------------------------------------
-- History
-- ---------------------------------------------------------------------

create table snapshots (
  id         bigserial primary key,
  taken_at   timestamptz not null unique,
  group_rank int
);
create index snapshots_taken_at_idx on snapshots (taken_at desc);

-- One row per player per snapshot, not one row per skill: the 30-wide
-- vector is a fixed-width unit that's always read whole (exactly the p/l
-- shape compute.js already consumes), so arrays keep this at 5 rows per
-- snapshot instead of 150.
create table player_snapshots (
  snapshot_id  bigint not null references snapshots (id) on delete cascade,
  player_slug  text   not null references players (slug) on delete cascade,
  xp           bigint[] not null, -- 30 entries, indexed by skill id
  -- 30 entries; stored, not derived (elite xp curves). Nullable, not
  -- zero-filled: the earliest snapshots predate this field entirely, and
  -- compute.js's computeLevelGains() explicitly tests `snapshot.l &&
  -- typeof snapshot.l === 'object'` to exclude them from level-gain maths —
  -- a fabricated all-zero vector would be read as a real (and catastrophic)
  -- level drop instead of "no data".
  levels       int[],
  quest_points int,
  primary key (snapshot_id, player_slug)
);

-- ---------------------------------------------------------------------
-- Quests (was quest-data/quests.json)
-- ---------------------------------------------------------------------

create table quests (
  name            text primary key,
  slug            text not null unique,
  wiki_url        text,
  quest_type      text, -- quest | miniquest | subquest
  subquest_of     text,
  difficulty      text,
  length          text,
  members         boolean,
  series          text,
  series_position int,
  age             int,
  start_area      text,
  combat_level    text,
  release_date    text,
  removal_date    text,
  misc_requirements            jsonb not null default '[]',
  full_completion_requirements jsonb not null default '[]'
);

-- level is part of the key, not just skill: a handful of quests (e.g.
-- "Desert Slayer Dungeon (miniquest)") list the same skill at several
-- levels — successive tiers/floors, not a scrape duplicate. `position`
-- preserves the source array's order (the wiki page's own listing order,
-- which quest-dependency-graph.js and player-goals.js's quest-goal drafts
-- both display in) — it's not part of the key, just an ORDER BY column.
create table quest_skill_requirements (
  quest_name text not null references quests (name) on delete cascade,
  skill      text not null,
  level      int  not null,
  position   int  not null default 0,
  primary key (quest_name, skill, level)
);

create table quest_prerequisites (
  quest_name  text not null references quests (name) on delete cascade,
  requires    text not null,
  -- questRequirements rows carry required/partial/full_completion; a
  -- recommendedQuests entry (quests[].recommendedQuests) has no relation of
  -- its own in the source data, so it's stored as 'recommended' here rather
  -- than left nullable — relation is part of the primary key.
  relation    text not null check (relation in ('required', 'partial', 'full_completion', 'recommended')),
  -- Ordinal within its own source array (questRequirements and
  -- recommendedQuests are numbered independently — see backfill.mjs).
  position    int  not null default 0,
  primary key (quest_name, requires, relation)
);

-- ---------------------------------------------------------------------
-- Goals
-- ---------------------------------------------------------------------

create table goals (
  id              uuid primary key, -- client-generated crypto.randomUUID(), kept as-is
  player_slug     text not null references players (slug) on delete cascade,
  kind            text not null check (kind in ('skill', 'quest')),
  skill_id        int,
  target_type     text check (target_type in ('level', 'xp')),
  target_value    bigint,
  start_level     int,
  start_xp        bigint,
  completed_level int,
  completed_xp    bigint,
  quest_name      text,
  -- Quest name for quest-derived requirement siblings, else null — a group
  -- exists exactly as long as a goal references it, same as today.
  goal_group      text,
  -- Names only, not a join table: goal-labels-storage.js is explicit that a
  -- label's colour belongs to the label, and a label must survive with zero
  -- goals using it — see goal_labels below.
  labels          text[] not null default '{}',
  started_at      timestamptz not null default now(),
  completed_at    timestamptz,
  created_by      text references users (discord_id),
  updated_at      timestamptz not null default now(),
  deleted_at      timestamptz,
  constraint skill_goal_fields check (
    kind <> 'skill' or (skill_id is not null and target_type is not null and target_value is not null)
  ),
  constraint quest_goal_fields check (kind <> 'quest' or quest_name is not null)
);
create index goals_player_idx on goals (player_slug) where deleted_at is null;

create table goal_labels (
  player_slug text not null references players (slug) on delete cascade,
  name        text not null,
  colour      text not null,
  primary key (player_slug, name)
);

-- ---------------------------------------------------------------------
-- Refresh runs — backs the on-demand update endpoints and their dedup
-- ---------------------------------------------------------------------

create table refresh_runs (
  id           uuid primary key,
  scope        text not null check (scope in ('group', 'player')),
  player_slug  text references players (slug),
  requested_by text references users (discord_id),
  status       text not null default 'running' check (status in ('running', 'ok', 'failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  error        text,
  detail       jsonb
);
