import { el } from '../dom.js';

/**
 * A sliding-indicator segmented control — the same anatomy as the group
 * page's Day/Week/Month toggle and the Gains section's own Week/Month tabs
 * (leaderboards.js, player-gains.js), generalised so a page-level tab
 * switcher (stats.js) doesn't have to duplicate it a third time.
 *
 * `tabs` is `[value, label][]`; `.tabs-2up` (indicator at 50% width instead
 * of the shared control's default one-third) only makes sense for exactly
 * two tabs, so it's applied automatically rather than left for the caller
 * to remember.
 */
export function tabToggle({ tabs, active, onSelect, previousActive, ariaLabel }) {
  const index = tabs.findIndex(([value]) => value === active);
  const fromIndex = previousActive == null ? index : tabs.findIndex(([value]) => value === previousActive);

  const indicator = el('span', { class: 'tabs-indicator', 'aria-hidden': 'true' });
  indicator.style.transform = `translateX(${fromIndex * 100}%)`;

  if (fromIndex !== index) {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        indicator.style.transform = `translateX(${index * 100}%)`;
      });
    });
  }

  return el('div', { class: `tabs${tabs.length === 2 ? ' tabs-2up' : ''}`, role: 'tablist', 'aria-label': ariaLabel }, [
    indicator,
    ...tabs.map(([value, label]) =>
      el('button', {
        type: 'button',
        class: `tab${active === value ? ' is-active' : ''}`,
        role: 'tab',
        'aria-selected': active === value ? 'true' : 'false',
        onclick: () => onSelect(value),
        text: label,
      }),
    ),
  ]);
}
