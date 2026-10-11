-- Which player was FIRST in the group to reach level 99 / level 120 in each
-- skill. The green (99) and blue (120) stars are awarded only to that one
-- player per skill per tier, not to everyone who has since reached the level.
--
-- One row per (skill, tier): the primary key is what makes "first" stick —
-- the update job inserts with `on conflict do nothing`, so a later player
-- reaching the same level can never displace the original holder.
--
-- skill_id 0 (Overall) is never a milestone — total level is always >= 99.
create table skill_milestones (
  skill_id    int         not null check (skill_id between 1 and 29),
  tier        int         not null check (tier in (99, 120)),
  player_slug text        not null references players (slug) on delete cascade,
  reached_at  timestamptz not null,
  primary key (skill_id, tier)
);

-- Backfill from recorded history: for each skill and tier, the earliest
-- snapshot in which anyone's stored level is at or past the tier. If several
-- players first show up in the same snapshot (snapshots are roughly hourly,
-- so they can't be told apart by time), the one with the most xp in that
-- skill is treated as first, then slug as a last, deterministic tiebreak.
--
-- Snapshots from before `levels` was stored (levels is null) are skipped, so a
-- milestone already reached before that point is attributed to the earliest
-- snapshot that does carry levels.
--
-- Postgres arrays are 1-indexed, hence skill_id + 1.
insert into skill_milestones (skill_id, tier, player_slug, reached_at)
select distinct on (g.skill_id, t.tier)
       g.skill_id, t.tier, ps.player_slug, s.taken_at
from snapshots s
join player_snapshots ps on ps.snapshot_id = s.id and ps.levels is not null
cross join generate_series(1, 29) as g(skill_id)
cross join (values (99), (120)) as t(tier)
where ps.levels[g.skill_id + 1] >= t.tier
order by g.skill_id, t.tier, s.taken_at asc, ps.xp[g.skill_id + 1] desc, ps.player_slug asc
on conflict do nothing;
