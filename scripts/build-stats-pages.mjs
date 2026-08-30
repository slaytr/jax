#!/usr/bin/env node
/**
 * Generates one static shell page per roster player at stats/<slug>/index.html.
 *
 * GitHub Pages has no server-side routing, so a clean /stats/<slug>/ URL needs
 * a real file at that path rather than a client-side router. Each shell is a
 * near-copy of index.html: same head, same #masthead/#panel/#footer-meta
 * skeleton, loaded by a different script (assets/js/stats.js instead of
 * app.js). Two things differ from index.html on purpose:
 *
 *  - asset hrefs are "../../assets/…" rather than "assets/…", since the page
 *    now sits two directories deeper (this is a project-page site served
 *    under /jax/, not domain root — never emit a root-absolute path here);
 *  - <body data-player="<slug>"> bakes the slug in, so stats.js never has to
 *    parse location.pathname. That matters because GitHub Pages 301-redirects
 *    a bare /stats/foo to /stats/foo/ while the local dev server (serve.mjs)
 *    does not, and parsing the two would disagree about the current depth.
 *
 * Run via `npm run stats`; wired into CI as a drift check (regenerating must
 * produce no diff) rather than into the hourly hiscore-update workflow, since
 * these shells depend only on the roster (data/players.json), not on hourly
 * hiscore data.
 *
 * Exports are plain functions with no top-level side effects, so tests can
 * import this module without it touching the filesystem — main() only runs
 * when the file is executed directly (see the guard at the bottom), unlike
 * update.mjs's unconditional `main().catch(...)`, which nothing ever imports.
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Identical to index.html's inline favicon — one "J" mark for the whole site. */
const FAVICON =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%230c0a09'/%3E%3Ctext x='16' y='23' font-family='Georgia,serif' font-size='20' font-weight='700' fill='%23d95926' text-anchor='middle'%3EJ%3C/text%3E%3C/svg%3E";

export function renderStatsShell(player, group) {
  const title = `${player.name} · ${group.name} stats`;
  const description = `Personal RuneScape 3 hiscore stats for ${player.name}, part of the ${group.name} group ironman team.`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <meta name="description" content="${description}" />
    <meta name="theme-color" content="#0c0a09" />

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;700&family=IBM+Plex+Mono:wght@400;500&family=Spectral:wght@300;400;600&display=swap"
      rel="stylesheet"
    />
    <link rel="stylesheet" href="../../assets/css/styles.css" />
    <link rel="icon" href="${FAVICON}" />
  </head>
  <body data-player="${player.slug}">
    <div class="shell">
      <header class="masthead" id="masthead"></header>

      <main id="panel" aria-label="${player.name}'s stats">
        <p class="loading">Reading the ledger…</p>
      </main>

      <footer class="site-footer">
        <span id="footer-meta"></span>
        <span>
          Not affiliated with Jagex ·
          <a href="https://github.com/slaytr/jax">source on GitHub</a>
        </span>
      </footer>
    </div>

    <script type="module" src="../../assets/js/stats.js"></script>
    <noscript>
      <p class="loading">
        This page renders the committed hiscore snapshot in the browser and needs JavaScript enabled.
        The underlying data is readable directly at <code>../../data/latest.json</code>.
      </p>
    </noscript>
  </body>
</html>
`;
}

export async function writeStatsPages(rootDir, roster) {
  const written = [];
  for (const player of roster.players) {
    const dir = join(rootDir, 'stats', player.slug);
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'index.html'), renderStatsShell(player, roster.group ?? { name: 'Group' }), 'utf8');
    written.push(player.slug);
  }
  return written;
}

async function main() {
  const roster = JSON.parse(await readFile(join(ROOT, 'data', 'players.json'), 'utf8'));
  const written = await writeStatsPages(ROOT, roster);
  console.log(`Wrote ${written.length} stats page${written.length === 1 ? '' : 's'}: ${written.join(', ')}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(`\nbuild-stats-pages failed: ${error.message}`);
    process.exitCode = 1;
  });
}
