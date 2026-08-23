/**
 * Competitive Group Ironman standing for the whole group.
 *
 * There is no JSON API for this leaderboard. The page at rs.runescape.com is a
 * Next.js app that server-renders its data into the RSC flight payload, so this
 * module reassembles that payload and reads the group list out of it.
 *
 * That makes it a scraper, and scrapers break. Every failure path here returns a
 * reason instead of throwing, and the caller keeps the previous value — a
 * markup change on Jagex's side must never take the rest of the site down.
 */

const REQUEST_TIMEOUT_MS = 25000;
const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

/** How many groups either side of ours to keep as rivals. */
const RIVAL_RADIUS = 3;

/**
 * The flight payload arrives as a series of `self.__next_f.push([1,"…"])` calls,
 * each carrying a JSON string literal. Concatenating the decoded strings
 * reconstructs the original payload text.
 */
function reassembleFlightPayload(html) {
  const pattern = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let text = '';

  for (const match of html.matchAll(pattern)) {
    try {
      text += JSON.parse(match[1]);
    } catch {
      // A chunk that will not decode is skipped rather than aborting the parse.
    }
  }
  return text;
}

/** Extracts the balanced JSON object that starts at `openIndex`. */
function sliceJsonObject(text, openIndex) {
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = openIndex; i < text.length; i += 1) {
    const char = text[i];

    if (escaped) {
      escaped = false;
    } else if (char === '\\') {
      escaped = true;
    } else if (char === '"') {
      inString = !inString;
    } else if (!inString) {
      if (char === '{') depth += 1;
      else if (char === '}') {
        depth -= 1;
        if (depth === 0) return text.slice(openIndex, i + 1);
      }
    }
  }
  return null;
}

/** Finds the paginated group list — the object holding both `content` and `totalElements`. */
function findGroupPage(payload) {
  const marker = '{"content":[';
  let from = 0;

  while (from < payload.length) {
    const start = payload.indexOf(marker, from);
    if (start === -1) return null;

    const slice = sliceJsonObject(payload, start);
    if (slice) {
      try {
        const parsed = JSON.parse(slice);
        if (Array.isArray(parsed.content) && Number.isFinite(parsed.totalElements)) return parsed;
      } catch {
        // Not the object we want; keep scanning.
      }
    }
    from = start + marker.length;
  }
  return null;
}

const toRow = (group, rank) => ({
  rank,
  name: String(group.name),
  totalLevel: Number(group.groupTotalLevel) || 0,
  totalXp: Number(group.groupTotalXp) || 0,
  size: Number(group.size) || 0,
  founder: Boolean(group.founder),
});

async function fetchPage(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' },
    });
    if (!response.ok) return { ok: false, error: `HTTP ${response.status}` };
    return { ok: true, html: await response.text() };
  } catch (cause) {
    const reason = cause?.name === 'AbortError' ? `timed out after ${REQUEST_TIMEOUT_MS}ms` : String(cause?.message ?? cause);
    return { ok: false, error: reason };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Pure half of the scrape: HTML in, standing out. Split from the fetch so the
 * parsing rules can be tested without touching the network.
 *
 * @param {string} html  the hiscores page source
 * @param {string} name  the group name to locate within the page
 */
export function parseGroupRank(html, name) {
  const payload = reassembleFlightPayload(html);
  if (!payload) return { ok: false, error: 'could not reassemble the RSC payload' };

  const groupPage = findGroupPage(payload);
  if (!groupPage) return { ok: false, error: 'no group list found in the page payload' };

  // Match on the configured name, never on the server's highlight flag alone:
  // trusting the flag would silently publish another group's numbers if the
  // search ever resolved to something else. The flag only breaks ties between
  // groups sharing a name.
  const wanted = String(name).trim().toLowerCase();
  const named = groupPage.content.filter((group) => String(group?.name).trim().toLowerCase() === wanted);
  if (named.length === 0) return { ok: false, error: `group "${name}" was not on the returned page` };

  const index = groupPage.content.indexOf(named.find((group) => group?.toHighlight === true) ?? named[0]);

  // pageNumber is zero-based; rank is the position across the whole leaderboard.
  const pageNumber = Number(groupPage.pageNumber) || 0;
  const pageSize = Number(groupPage.size) || groupPage.content.length;
  const rankOf = (position) => pageNumber * pageSize + position + 1;

  const group = groupPage.content[index];
  const rivals = groupPage.content
    .map((entry, position) => ({ entry, position }))
    .filter(({ position }) => Math.abs(position - index) <= RIVAL_RADIUS)
    .map(({ entry, position }) => ({ ...toRow(entry, rankOf(position)), isUs: position === index }));

  return {
    ok: true,
    ...toRow(group, rankOf(index)),
    id: Number(group.id) || null,
    competitive: Boolean(group.isCompetitive),
    totalGroups: Number(groupPage.totalElements) || null,
    rivals,
  };
}

/**
 * @param {string} url   the group-ironman hiscores URL, including ?name=
 * @param {string} name  the group name to locate within the page
 */
export async function fetchGroupRank(url, name) {
  if (!url) return { ok: false, error: 'no group hiscores URL configured' };

  const page = await fetchPage(url);
  if (!page.ok) return { ok: false, error: page.error };

  const parsed = parseGroupRank(page.html, name);
  return parsed.ok ? { ...parsed, sourceUrl: url } : parsed;
}
