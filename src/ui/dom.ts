type Attrs = Record<string, string | number | boolean | undefined>;

/** Small element builder: el('button', { class: 'x', type: 'button' }, 'Label', child). */
export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  ...children: (Node | string | null | false)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === false) continue;
    node.setAttribute(k, v === true ? '' : String(v));
  }
  for (const c of children) if (c) node.append(c);
  return node;
}

/** Shows a full-screen overlay and resolves with whatever `build` reports through `done`. */
export function overlay<T>(build: (done: (value: T) => void) => HTMLElement, className = ''): Promise<T> {
  return new Promise((resolve) => {
    const root = el('div', { class: `overlay ${className}`.trim() });
    const done = (value: T) => {
      root.remove();
      resolve(value);
    };
    root.append(build(done));
    document.body.append(root);
  });
}
