#!/usr/bin/env node
/**
 * One-off asset fetch: downloads the Loot tab's boss portraits and per-drop
 * item icons into assets/icons/bosses/ and assets/icons/items/ — same
 * "committed locally, not hotlinked" reasoning as fetch-icons.mjs.
 *
 * Boss portraits are saved under each boss's own slug; item icons are saved
 * under slugify(item.name) so config.js's itemIconFor can find them from the
 * display name alone, deduplicated across every boss's sections (Coins,
 * Godsword shards, charms etc. repeat across several bosses but are only
 * fetched once). `item.wikiFile` overrides the source filename when it
 * differs from the display name (Coins' own icon is tiered by amount;
 * Warpriest pieces are named "<piece> (75)" for the fully-charged version;
 * furniture plans use "- " where the display name has ": ") — see
 * boss-loot-tables.js's own items for which ones need it.
 *
 * Source: runescape.wiki (CC BY-NC-SA). Icons remain © Jagex Ltd.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { slugify } from '../assets/js/config.js';
import { BOSS_LOOT_TABLES } from '../assets/js/boss-loot-tables.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
const BOSS_DIR = join(ROOT, 'bosses');
const ITEM_DIR = join(ROOT, 'items');
const BASE = 'https://runescape.wiki/images';

// Same bot-filter workaround as fetch-icons.mjs.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'image/png',
  Referer: 'https://runescape.wiki/',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** `thumbWidth` fetches MediaWiki's own downscaled rendition (thumb/<file>/
 * <width>px-<file>) instead of the full-resolution original — the boss
 * portraits are full character renders (500-1500px, 300-600KB each) for a
 * detail pane that only ever shows one at 120px wide; the per-drop item
 * icons are already inventory-icon-sized (~31px) and fetched at their
 * native resolution as-is. */
async function download(wikiFile, destPath, thumbWidth) {
  const file = `${wikiFile.replace(/ /g, '_')}.png`;
  const url = thumbWidth ? `${BASE}/thumb/${encodeURIComponent(file)}/${thumbWidth}px-${encodeURIComponent(file)}` : `${BASE}/${encodeURIComponent(file)}`;
  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };

    const bytes = Buffer.from(await response.arrayBuffer());
    // A bot-block page is served as HTML with a 200 in some cases; PNGs start
    // with a fixed 8-byte signature, so verify rather than trust the status.
    if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) {
      return { ok: false, error: `not a PNG (${bytes.length} bytes)` };
    }

    await writeFile(destPath, bytes);
    return { ok: true, bytes: bytes.length };
  } catch (cause) {
    return { ok: false, error: String(cause?.message ?? cause) };
  }
}

async function main() {
  await mkdir(BOSS_DIR, { recursive: true });
  await mkdir(ITEM_DIR, { recursive: true });

  const failures = [];
  let count = 0;

  for (const boss of BOSS_LOOT_TABLES) {
    const wikiFile = boss.image.replace(/\.png$/i, '');
    const result = await download(wikiFile, join(BOSS_DIR, `${boss.slug}.png`), 200);
    count += 1;
    console.log(result.ok ? `  ok    ${boss.name.padEnd(24)} ${result.bytes} bytes` : `  FAIL  ${boss.name.padEnd(24)} ${result.error}`);
    if (!result.ok) failures.push({ label: boss.name, error: result.error });
    await sleep(150);
  }

  // Dedup by slug so a repeated item (Coins, Godsword shards, charms...)
  // across several bosses is only fetched once.
  const items = new Map();
  for (const boss of BOSS_LOOT_TABLES) {
    for (const section of boss.sections) {
      for (const item of section.items) {
        if (item.noIcon) continue;
        const slug = slugify(item.name);
        if (!items.has(slug)) items.set(slug, item.wikiFile ?? item.name);
      }
    }
  }

  for (const [slug, wikiFile] of items) {
    const result = await download(wikiFile, join(ITEM_DIR, `${slug}.png`));
    count += 1;
    console.log(result.ok ? `  ok    ${slug.padEnd(40)} ${result.bytes} bytes` : `  FAIL  ${slug.padEnd(40)} ${result.error}`);
    if (!result.ok) failures.push({ label: slug, error: result.error });
    await sleep(150);
  }

  console.log(`\n${count - failures.length}/${count} icons written to assets/icons/{bosses,items}/`);
  if (failures.length > 0) {
    console.error(`Missing: ${failures.map((f) => f.label).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Boss icon fetch failed: ${error.message}`);
  process.exitCode = 1;
});
