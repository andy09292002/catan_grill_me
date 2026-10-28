import { el, overlay } from './dom';

export function confirmDialog(title: string, message: string, confirm: string, cancel: string): Promise<boolean> {
  return overlay<boolean>((done) =>
    el(
      'div',
      { class: 'dialog small', role: 'alertdialog', 'aria-label': title },
      el('h2', {}, title),
      el('p', {}, message),
      el(
        'div',
        { class: 'actions' },
        button(cancel, 'secondary', () => done(false)),
        button(confirm, 'danger', () => done(true)),
      ),
    ),
  );
}

function button(label: string, kind: string, onClick: () => void) {
  const b = el('button', { type: 'button', class: `btn ${kind}` }, label);
  b.addEventListener('click', onClick);
  return b;
}
