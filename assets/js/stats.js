/**
 * Per-player stats page entry point — the /stats/<slug>/ counterpart to
 * app.js. Each generated shell (scripts/build-stats-pages.mjs) bakes its
 * slug into `<body data-player>`, so this never has to parse
 * location.pathname (which would otherwise have to account for GitHub
 * Pages' trailing-slash redirect and the local dev server's lack of one —
 * see the build script's own notes).
 */

import { loadGroupData } from './data.js';
import { CALENDAR_DAY, computeLevelGains } from './compute.js';
import { SKILLS } from './config.js';
import { el, replaceChildren } from './dom.js';
import { renderPlayerMasthead } from './views/player-masthead.js';
import { renderPlayerGains } from './views/player-gains.js';
import { renderPlayerSkills } from './views/player-skills.js';

const dom = {
  masthead: document.getElementById('masthead'),
  panel: document.getElementById('panel'),
  footer: document.getElementById('footer-meta'),
};

function renderNotFound(slug, groupName) {
  replaceChildren(
    dom.panel,
    el('div', { class: 'empty empty-error' }, [
      el('p', { class: 'empty-title', text: 'No such player' }),
      el('p', { class: 'empty-body', text: `"${slug}" isn't in ${groupName}'s current roster.` }),
      el('p', { class: 'empty-body' }, [el('a', { href: '../../' }, [`Back to ${groupName}`])]),
    ]),
  );
}

/** Flips one slug's membership in a Set, in place — the shared shape behind
 * both hiddenSlugs (playerToggle) and emphasizedSlugs (click-to-pin bars). */
function toggleMembership(set, slug) {
  if (set.has(slug)) set.delete(slug);
  else set.add(slug);
}

function renderFatal(message) {
  replaceChildren(
    dom.panel,
    el('div', { class: 'empty empty-error' }, [
      el('p', { class: 'empty-title', text: 'Could not load hiscore data' }),
      el('p', { class: 'empty-body', text: message }),
    ]),
  );
}

async function boot() {
  const slug = document.body.dataset.player;

  try {
    const data = await loadGroupData();
    const player = data.players.find((candidate) => candidate.slug === slug);

    document.title = `${player ? player.name : slug} · ${data.group.name} stats`;
    replaceChildren(
      dom.footer,
      el('span', { text: `Data from the RuneScape 3 hiscores, refreshed by GitHub Actions. Last fetch ${new Date(data.fetchedAt).toUTCString()}.` }),
    );

    if (!player) {
      renderNotFound(slug, data.group.name);
      return;
    }

    // The skill grid's per-cell "+N today" chips need this result's
    // per-skill breakdown, not just a rolled-up total — same source the
    // group matrix reads for the same purpose (see matrix.js's `gainFor`).
    const todayLevelGains = computeLevelGains(data.snapshots, data.players, CALENDAR_DAY);

    renderPlayerMasthead(dom.masthead, {
      player,
      groupName: data.group.name,
      fetchedAt: data.fetchedAt,
    });

    // Only the Gains section is interactive on this page (the Week/Month
    // toggle, which chart is the big active one, which players show in its
    // comparison chart, and now which single skill everything is filtered
    // to) — everything else renders once. `previousGainsWindow` mirrors
    // app.js's own previous-period tracking, driving the tab indicator's
    // slide on a click without replaying it on the very first render.
    let gainsWindow = 'week';
    let previousGainsWindow = null;
    let activeMetric = 'xp';
    let selectedSkillId = null;
    const hiddenSlugs = new Set();
    const emphasizedSlugs = new Set();

    function render() {
      // Resolved fresh each render (not cached in the outer state) since
      // it's derived purely from selectedSkillId — one fewer thing that
      // could drift out of sync with it.
      const selectedSkill = selectedSkillId === null ? null : SKILLS.find((skill) => skill.id === selectedSkillId);

      replaceChildren(
        dom.panel,
        el('div', { class: 'player-row' }, [
          renderPlayerSkills(player, todayLevelGains, selectedSkillId, (skillId) => {
            // Clicking the already-selected cell reverts to every skill
            // combined — the same click-to-toggle shape as playerToggle and
            // the comparison chart's click-to-pin, just with only one skill
            // ever "on" at a time instead of a Set.
            selectedSkillId = selectedSkillId === skillId ? null : skillId;
            render();
          }),
          renderPlayerGains({
            player,
            players: data.players,
            snapshots: data.snapshots,
            window: gainsWindow,
            onSelectWindow: (window) => {
              previousGainsWindow = gainsWindow;
              gainsWindow = window;
              render();
            },
            previousWindow: previousGainsWindow,
            activeMetric,
            onSelectMetric: (metric) => {
              activeMetric = metric;
              render();
            },
            hiddenSlugs,
            onToggleHidden: (slug) => {
              toggleMembership(hiddenSlugs, slug);
              render();
            },
            emphasizedSlugs,
            onToggleEmphasis: (slug) => {
              toggleMembership(emphasizedSlugs, slug);
              render();
            },
            selectedSkill,
          }),
        ]),
      );
    }

    render();
  } catch (error) {
    console.error(error);
    renderFatal(error.message);
  } finally {
    document.body.dataset.ready = 'true';
  }
}

boot();
