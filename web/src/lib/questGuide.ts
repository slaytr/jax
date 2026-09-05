/**
 * Shapes one quest's raw quest-guides.json entry (already a real nested
 * structure — a wiki scrape, but a structured one, unlike the flat
 * markdown-ish line list an earlier version of this dataset used) into
 * what QuestQuickGuide.vue/QuestGuideStepList.vue actually render. quest
 * -guides.json is itself a merge of two separate scrapes — the original
 * 175-quest batch has no `screenshots` field on a section at all, the
 * later 108-quest batch does — so that's read as an empty array rather
 * than assumed present; `items_required`'s own `["None"]` sentinel for
 * "nothing to bring" is the only other real transform needed, everything
 * else already has good field names.
 *
 * `rewards` is a later addition to the same dataset (each quest's own
 * "Rewards" heading, re-scraped straight off the wiki's own rendered Quick
 * guide page rather than quest-guides.json's original two batches — that
 * heading's content is a raw `{{Quest rewards page}}` template transclusion
 * in the page's own wikitext, so nothing short of the rendered HTML the
 * wiki itself serves actually has the resolved reward text). Already
 * grouped by wiki subheading (`label`) by the time it lands in
 * quest-guides.json, so no normalizing needed here beyond the `?? []`
 * fallback for the handful of quests that re-scrape found no Rewards
 * heading for at all (a removed/miniquest-style page, mostly).
 *
 * A step's own dialogue-option notation (which chat option(s) to click —
 * "2•✓", "1•~", the odd "[Varies]•3" or "2 or 1") lives baked onto the end
 * of its `text` in the raw data, not as its own field — a handful of
 * quests had it hand-restored later by literally appending "(...)" back
 * onto the right line (see the session that did it). `splitNotation` below
 * pulls it back off `text` into its own `notation` field so
 * QuestGuideStepList.vue can render it as a distinct chip rather than
 * trailing plain text; the anchored `$` and the closed character class are
 * what keep this from also eating a step's own genuine prose parenthetical
 * ("Speak to Grand Vizier Ehsan (Merchant) also...") — only the very last
 * `(...)` counts, and only when everything inside it is drawn from the
 * small set of characters an actual notation is ever made of.
 */
export interface QuestGuideStep {
  text: string;
  notation: string | null;
  substeps: QuestGuideStep[];
  notes: string[];
}

const NOTATION_SUFFIX = /\s*\(((?:\[Varies\]|[\d•✓~]|\s|or)+)\)$/;

export function splitNotation(text: string): { text: string; notation: string | null } {
  const match = text.match(NOTATION_SUFFIX);
  if (!match) return { text, notation: null };
  return { text: text.slice(0, match.index), notation: match[1].trim() };
}

function normalizeStep(raw: any): QuestGuideStep {
  const { text, notation } = splitNotation(raw.text ?? '');
  return { text, notation, notes: raw.notes ?? [], substeps: (raw.substeps ?? []).map(normalizeStep) };
}

export interface QuestGuideScreenshot {
  src: string;
  width: number;
  height: number;
}

export interface QuestGuideSection {
  heading: string;
  needed: string | null;
  recommended: string | null;
  notes: string[];
  steps: QuestGuideStep[];
  screenshots: QuestGuideScreenshot[];
}

/** One reward heading's own group — most quests have just one unlabelled
 * group (the wiki's own bare "Rewards" list); a `label` group is one of its
 * own named subheadings (Lost City's own "Music unlocked", say) instead. */
export interface QuestGuideRewardGroup {
  label: string | null;
  items: string[];
}

export interface QuestGuide {
  itemsRequired: string[];
  rewards: QuestGuideRewardGroup[];
  sections: QuestGuideSection[];
}

/** quest-guides.json's own stand-in for "nothing to bring" is a one-entry
 * `["None"]` list rather than an empty one — read as no items at all, so a
 * viewer never sees a literal "None" bullet under "Items needed". */
function meaningfulItems(raw: string[]): string[] {
  if (raw.length === 1 && raw[0].trim().toLowerCase() === 'none') return [];
  return raw;
}

export function normalizeQuestGuide(raw: any): QuestGuide {
  const sections = (raw.sections ?? []).map((section: any) => ({
    ...section,
    screenshots: section.screenshots ?? [],
    steps: (section.steps ?? []).map(normalizeStep),
  }));
  return { itemsRequired: meaningfulItems(raw.items_required ?? []), rewards: raw.rewards ?? [], sections };
}
