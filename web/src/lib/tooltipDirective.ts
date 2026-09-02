import type { Directive } from 'vue';

import { replaceChildren } from '@shared/dom.js';

export { tooltipContent } from '@shared/tooltip.js';

/**
 * A Vue directive wrapping the same shared, singleton tooltip element the
 * old tooltip.js used (one positioned <div class="tooltip"> reused across
 * every hover, rather than one per row) — re-implemented rather than
 * imported directly because tooltip.js's own bindTooltip() closes over its
 * `build` callback once at bind time. A v-for row's callback closes over
 * that row's reactive data (a gain value, say), and Vue reuses the same DOM
 * node across re-renders when a :key matches — so a directive needs to
 * refresh the callback on every update, not just on first mount, or a
 * tooltip would keep showing stale data after a refresh. Content shape
 * (tooltipContent, re-exported above) is still the original module's,
 * unchanged — only this positioning/singleton half is re-implemented.
 */

let tip: HTMLElement | null = null;

function ensureTip(): HTMLElement {
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.setAttribute('aria-hidden', 'true');
    document.body.append(tip);
  }
  return tip;
}

function place(target: Element) {
  const node = ensureTip();
  const mark = target.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const margin = 10;

  const left = Math.min(Math.max(margin, mark.left + mark.width / 2 - box.width / 2), window.innerWidth - box.width - margin);
  const above = mark.top - box.height - margin;
  const top = above > margin ? above : mark.bottom + margin;

  node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function show(target: Element & { __ttBuild?: () => Node | null }) {
  const build = target.__ttBuild;
  if (!build) return;
  const node = ensureTip();
  const content = build();
  if (!content) return;

  replaceChildren(node, content);
  node.dataset.visible = 'true';
  node.setAttribute('aria-hidden', 'false');
  place(target);
}

function hide() {
  if (!tip) return;
  delete tip.dataset.visible;
  tip.setAttribute('aria-hidden', 'true');
}

window.addEventListener('scroll', hide, { passive: true, capture: true });
window.addEventListener('keydown', (event) => event.key === 'Escape' && hide());

type TooltipEl = HTMLElement & { __ttBuild?: () => Node | null; __ttBound?: boolean };

/** `v-tooltip="() => tooltipContent(...)"` — the callback is re-read fresh
 * on every hover, so it always reflects whatever the element's current
 * props/data are at that moment. */
export const vTooltip: Directive<TooltipEl, () => Node | null> = {
  mounted(el, binding) {
    el.__ttBuild = binding.value;
    el.addEventListener('pointerenter', () => show(el));
    el.addEventListener('focus', () => show(el));
    el.addEventListener('pointerleave', hide);
    el.addEventListener('blur', hide);
  },
  updated(el, binding) {
    el.__ttBuild = binding.value;
  },
};
