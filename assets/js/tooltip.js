/**
 * One shared tooltip element, positioned against the hovered mark.
 * Bound elements describe themselves via a callback so nothing is recomputed
 * until the pointer actually lands.
 */

import { el, replaceChildren } from './dom.js';

let tip = null;

function ensureTip() {
  if (!tip) {
    tip = el('div', { class: 'tooltip', role: 'tooltip', 'aria-hidden': 'true' });
    document.body.append(tip);
  }
  return tip;
}

function place(target) {
  const node = ensureTip();
  const mark = target.getBoundingClientRect();
  const box = node.getBoundingClientRect();
  const margin = 10;

  const left = Math.min(
    Math.max(margin, mark.left + mark.width / 2 - box.width / 2),
    window.innerWidth - box.width - margin,
  );
  const above = mark.top - box.height - margin;
  const top = above > margin ? above : mark.bottom + margin;

  node.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
}

function show(target, build) {
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

/**
 * @param {HTMLElement} target
 * @param {() => Node|null} build content factory
 */
export function bindTooltip(target, build) {
  const open = () => show(target, build);
  target.addEventListener('pointerenter', open);
  target.addEventListener('focus', open);
  target.addEventListener('pointerleave', hide);
  target.addEventListener('blur', hide);
  return target;
}

window.addEventListener('scroll', hide, { passive: true, capture: true });
window.addEventListener('keydown', (event) => event.key === 'Escape' && hide());

/**
 * Standard tooltip body: a title line plus label/value rows.
 *
 * A row value may be a string or a Node, so a row can carry an icon. `extra` is
 * appended below the rows for richer content such as a per-skill breakdown.
 */
export function tooltipContent(title, rows, accent, extra) {
  return el('div', { class: 'tooltip-body' }, [
    el('p', { class: 'tooltip-title' }, [
      accent ? el('span', { class: 'swatch', style: { '--swatch': accent } }) : null,
      el('span', { text: title }),
    ]),
    el(
      'dl',
      { class: 'tooltip-rows' },
      rows.flatMap(([label, value]) => [
        el('dt', { text: label }),
        value instanceof Node ? el('dd', {}, [value]) : el('dd', { text: value }),
      ]),
    ),
    extra,
  ]);
}
