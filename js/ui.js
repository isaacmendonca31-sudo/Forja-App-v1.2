/**
 * FORJA — Componentes de interface reutilizáveis e acessíveis.
 * Tudo é montado com h() (sem innerHTML).
 */
import { h, icon } from './utils.js';

/**
 * Aviso rápido não bloqueante (anunciado por leitores de tela via aria-live).
 * Com `action`, mostra um botão (ex.: "Desfazer"). timeout 0 = fica até ser fechado.
 */
export function toast(message, { action, onAction, error = false, timeout = 6000 } = {}) {
  const host = document.getElementById('toasts');
  if (!host) return () => {};
  const el = h('div', { class: `toast${error ? ' error' : ''}` },
    h('span', { class: 'msg' }, message));
  const remove = () => el.remove();
  if (action) {
    el.append(h('button', {
      type: 'button',
      onClick: () => { remove(); onAction?.(); },
    }, action));
  } else if (timeout === 0) {
    el.append(h('button', { type: 'button', 'aria-label': 'Fechar aviso', onClick: remove }, 'OK'));
  }
  host.append(el);
  if (timeout > 0) setTimeout(remove, timeout);
  return remove;
}

/**
 * Diálogo modal nativo (<dialog>): foco preso, Esc fecha, foco volta ao botão de origem.
 * actions: [{ label, kind?: 'primary'|'danger'|'ghost', onClick?: () => (false|void|Promise) }]
 *   onClick retornando `false` mantém o diálogo aberto (ex.: validação falhou).
 */
export function modal({ title, body, actions = [], onClose }) {
  const titleId = `dlg-${Math.random().toString(36).slice(2, 9)}`;
  const dialog = h('dialog', { 'aria-labelledby': titleId });
  const close = () => { if (dialog.open) dialog.close(); };

  const buttons = actions.map((a) => h('button', {
    type: 'button',
    class: `btn ${a.kind === 'primary' ? 'primary' : a.kind === 'danger' ? 'danger solid' : 'ghost'}`,
    onClick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        const keep = await a.onClick?.();
        if (keep !== false) close();
      } finally { btn.disabled = false; }
    },
  }, a.label));

  dialog.append(h('div', { class: 'dlg' },
    h('h2', { id: titleId }, title),
    body,
    buttons.length ? h('div', { class: 'dlg-actions' }, buttons) : null));

  // Clique no fundo escurece fecha o diálogo.
  dialog.addEventListener('click', (e) => { if (e.target === dialog) close(); });
  dialog.addEventListener('close', () => { dialog.remove(); onClose?.(); });
  document.body.append(dialog);
  dialog.showModal();
  return { close, dialog };
}

/** Confirmação (ações destrutivas usam danger:true). Resolve true/false. */
export function confirmDialog({ title, message, confirmLabel = 'Confirmar', cancelLabel = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let result = false;
    modal({
      title,
      body: h('p', {}, message),
      actions: [
        { label: cancelLabel, kind: 'ghost' },
        { label: confirmLabel, kind: danger ? 'danger' : 'primary', onClick: () => { result = true; } },
      ],
      onClose: () => resolve(result),
    });
  });
}

/** Cabeçalho de página: h1 + subtítulo + botão voltar e ações opcionais. */
export function pageHead(title, { subtitle, back, actions } = {}) {
  return h('div', { class: 'page-head' },
    back ? h('a', { class: 'btn ghost icon-only', href: back, 'aria-label': 'Voltar' }, icon('back')) : null,
    h('div', { class: 'grow' },
      h('h1', { id: 'page-title', tabindex: '-1' }, title),
      subtitle ? h('p', {}, subtitle) : null),
    actions || null);
}

/** Campo de formulário com rótulo, dica e erro associados (aria-describedby). */
export function field({ label, id, hint, control }) {
  const hintId = hint ? `${id}-hint` : null;
  if (hintId) control.setAttribute('aria-describedby', hintId);
  control.id = id;
  return h('div', { class: 'field' },
    h('label', { for: id }, label),
    control,
    hint ? h('p', { class: 'hint', id: hintId }, hint) : null);
}

export function emptyState(text, ...children) {
  return h('div', { class: 'empty' }, h('p', {}, text), ...children);
}

/**
 * Estado vazio orientador: ícone, título, explicação do que fazer e ações.
 * Use no lugar de uma tela em branco — diga o que falta e qual é o próximo passo.
 */
export function emptyBlock({ iconName = 'dumbbell', title, text, actions = [] }) {
  return h('div', { class: 'empty' },
    h('span', { class: 'empty-icon', 'aria-hidden': 'true' }, icon(iconName)),
    h('h2', {}, title),
    h('p', {}, text),
    actions.length ? h('div', { class: 'row wrap', style: { justifyContent: 'center' } }, actions) : null);
}

/** Banner informativo (kind: '' | 'warn' | 'ok' | 'accent'). */
export function banner(kind, ...children) {
  return h('div', { class: `banner ${kind}`.trim() }, ...children);
}
