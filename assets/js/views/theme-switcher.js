/**
 * The light/dark toggle — mounted independently in .header-row alongside
 * auth-widget.js/refresh-button.js, same self-contained reasoning as both:
 * it has nothing to do with either page's own render() state.
 */

import { el, replaceChildren } from '../dom.js';
import { getTheme, setTheme } from '../theme.js';

const LABEL = { dark: ['☾', 'Dark'], light: ['☀', 'Light'] };

export function mountThemeSwitcher(container) {
  function render() {
    const theme = getTheme();
    const [glyph, label] = LABEL[theme];
    replaceChildren(
      container,
      el(
        'button',
        {
          class: 'theme-toggle',
          type: 'button',
          'aria-label': `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
          title: `Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`,
          onClick: () => {
            setTheme(theme === 'dark' ? 'light' : 'dark');
            render();
          },
        },
        [el('span', { 'aria-hidden': 'true', text: glyph }), el('span', { text: label })],
      ),
    );
  }

  render();
}
