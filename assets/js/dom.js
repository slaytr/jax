/** Minimal element builder. Text always goes through textContent — never innerHTML. */

/**
 * Custom properties must go through setProperty: assigning them onto a
 * CSSStyleDeclaration (e.g. via Object.assign) is silently dropped, which would
 * leave every `var(--accent)` and `var(--swatch)` falling back instead of
 * taking the player's colour.
 */
function applyStyle(node, style) {
  for (const [property, value] of Object.entries(style)) {
    if (value === null || value === undefined) continue;
    if (property.startsWith('--')) node.style.setProperty(property, String(value));
    else node.style[property] = value;
  }
}

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined || value === false) continue;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = String(value);
    else if (key === 'style') applyStyle(node, value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value === true ? '' : String(value));
  }

  for (const child of [children].flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }

  return node;
}

/** Namespaced builder for the sparkline. */
export function svgEl(tag, props = {}) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === null || value === undefined) continue;
    node.setAttribute(key, String(value));
  }
  return node;
}

export function replaceChildren(container, ...nodes) {
  container.replaceChildren(...nodes.flat(Infinity).filter(Boolean));
  return container;
}

/** Coloured identity dot — the mark that carries a player's series colour. */
export const swatch = (colour) => el('span', { class: 'swatch', style: { '--swatch': colour }, 'aria-hidden': 'true' });
