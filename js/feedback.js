/**
 * FORJA — Feedback imediato: tátil, movimento e anúncios para leitores de tela.
 *
 *  • haptic()  só vibra quando o aparelho suporta e o usuário não desligou
 *              "Vibrar" em Ajustes (nada acontece em iOS/desktop).
 *  • motionOK() respeita prefers-reduced-motion (também usado para rolagem suave).
 *  • announce() escreve na região aria-live do index.html (#announcer), sem
 *              abrir toasts — usado para confirmações silenciosas (série salva etc.).
 *  • pulse()   dispara uma animação CSS curta e reiniciável em um elemento.
 */
import { getSettings } from './store.js';

export const motionOK = () => !globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

const PATTERNS = {
  tap: 10,
  done: 16,
  record: [18, 50, 28],
  finish: [28, 60, 28, 60, 48],
};

/** Vibração curta. Retorna true se foi disparada. */
export function haptic(kind = 'tap') {
  try {
    if (typeof navigator.vibrate !== 'function' || !getSettings().vibrate) return false;
    return navigator.vibrate(PATTERNS[kind] ?? PATTERNS.tap);
  } catch { return false; }
}

let announceTimer = 0;
/** Anuncia um texto curto a leitores de tela (educado: não interrompe a fala atual). */
export function announce(text) {
  const el = document.getElementById('announcer');
  if (!el) return;
  clearTimeout(announceTimer);
  el.textContent = '';
  // O intervalo força o leitor a perceber a mudança mesmo com texto repetido.
  announceTimer = setTimeout(() => { el.textContent = text; }, 40);
}

/** Reinicia uma animação CSS (classe) sem depender de timers. */
export function pulse(el, cls) {
  if (!el || !motionOK()) return;
  el.classList.remove(cls);
  void el.offsetWidth; // reflow: permite repetir a mesma animação
  el.classList.add(cls);
  el.addEventListener('animationend', () => el.classList.remove(cls), { once: true });
}

/** Anima a largura de uma barra de progresso de 0 até o valor (só se houver movimento). */
export function growBar(fill, pct) {
  if (!fill) return;
  if (!motionOK()) { fill.style.setProperty('--pct', `${pct}%`); return; }
  fill.style.setProperty('--pct', '0%');
  requestAnimationFrame(() => requestAnimationFrame(() => fill.style.setProperty('--pct', `${pct}%`)));
}

/**
 * Muda suavemente a iluminação do fundo conforme o rank (C/B/A/S/SSS) ou a remove (null).
 * É só decoração (o fundo é aria-hidden); a transição de cor é feita em CSS e some com
 * prefers-reduced-motion (a cor muda sem animar).
 */
export function setAmbientRank(rank) {
  if (rank) document.body.dataset.rank = rank; else delete document.body.dataset.rank;
}
