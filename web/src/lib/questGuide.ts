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
 */
export interface QuestGuideStep {
  text: string;
  substeps: QuestGuideStep[];
  notes: string[];
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

export interface QuestGuide {
  itemsRequired: string[];
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
  const sections = (raw.sections ?? []).map((section: any) => ({ ...section, screenshots: section.screenshots ?? [] }));
  return { itemsRequired: meaningfulItems(raw.items_required ?? []), sections };
}
