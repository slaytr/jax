#!/usr/bin/env node
/**
 * One-off asset fetch: downloads the RS3 skill icons into assets/icons/.
 *
 * The icons are committed to the repo rather than hotlinked, so the page never
 * depends on a third-party host at render time. Re-run only when the skill list
 * changes (a new skill ships).
 *
 * Source: runescape.wiki (CC BY-NC-SA). Icons remain © Jagex Ltd.
 */

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SKILLS } from '../assets/js/config.js';

const ICON_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'icons');
const BASE = 'https://runescape.wiki/images';

// The wiki sits behind a bot filter that wants a browser-shaped request, and it
// content-negotiates on Accept — advertising webp gets webp back despite the
// .png URL, so ask for PNG only.
const HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'image/png',
  Referer: 'https://runescape.wiki/',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(skill) {
  // Skills follow "<Name>-icon.png"; anything else names its wiki file directly.
  const file = skill.wikiFile ? skill.wikiFile : `${skill.name}-icon`;
  const url = `${BASE}/${encodeURIComponent(file)}.png`;

  try {
    const response = await fetch(url, { headers: HEADERS });
    if (!response.ok) return { skill, ok: false, error: `HTTP ${response.status}` };

    const bytes = Buffer.from(await response.arrayBuffer());
    // A bot-block page is served as HTML with a 200 in some cases; PNGs start
    // with a fixed 8-byte signature, so verify rather than trust the status.
    if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47) {
      return { skill, ok: false, error: `not a PNG (${bytes.length} bytes)` };
    }

    await writeFile(join(ICON_DIR, `${skill.slug}.png`), bytes);
    return { skill, ok: true, bytes: bytes.length };
  } catch (cause) {
    return { skill, ok: false, error: String(cause?.message ?? cause) };
  }
}

/** Not skills, but the page shows them as rows / section headings. */
const EXTRA_ICONS = [
  { name: 'Quest points', slug: 'quest-points', wikiFile: 'Quest_points' },
  { name: 'Total levels', slug: 'stats', wikiFile: 'Skills_icon' },
];

async function main() {
  await mkdir(ICON_DIR, { recursive: true });

  const targets = [...SKILLS.filter((skill) => skill.id !== 0), ...EXTRA_ICONS];
  const failures = [];

  for (const skill of targets) {
    const result = await download(skill);
    console.log(result.ok ? `  ok    ${skill.name.padEnd(15)} ${result.bytes} bytes` : `  FAIL  ${skill.name.padEnd(15)} ${result.error}`);
    if (!result.ok) failures.push(result);
    await sleep(150);
  }

  console.log(`\n${targets.length - failures.length}/${targets.length} icons written to assets/icons/`);
  if (failures.length > 0) {
    console.error(`Missing: ${failures.map((f) => f.skill.name).join(', ')}`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Icon fetch failed: ${error.message}`);
  process.exitCode = 1;
});
