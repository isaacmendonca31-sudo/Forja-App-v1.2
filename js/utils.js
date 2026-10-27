/**
 * FORJA — Utilitários gerais.
 *
 * SEGURANÇA (anti-XSS): toda a interface é construída com `h()`, que cria nós
 * DOM via createElement/textContent. O app NUNCA usa innerHTML, outerHTML ou
 * insertAdjacentHTML — assim, nenhum dado do usuário (nomes, notas, backups
 * importados, dados remotos) é interpretado como HTML.
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Gera um id aleatório (UUID v4) seguro para uso como chave de registro. */
export function uid() {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
}

/** Atributos que podem carregar URLs: só permitimos âncoras locais e https. */
function safeUrl(v) {
  const s = String(v);
  return /^(#|https:\/\/)/.test(s) ? s : '#';
}

/**
 * Criador de elementos DOM seguro.
 *   h('button', { class: 'btn', onClick: fn, 'aria-label': 'x' }, 'Texto', outroNo)
 * - Strings viram nós de texto (nunca HTML).
 * - Atributos `on*` só aceitam funções.
 * - `html`/`innerHTML` são proibidos.
 */
export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, val] of Object.entries(attrs || {})) {
    if (val === undefined || val === null || val === false) continue;
    if (key === 'html' || key === 'innerHTML' || key === 'outerHTML') {
      throw new Error('Uso de HTML bruto é proibido (anti-XSS).');
    }
    if (key === 'class') el.className = val;
    else if (key === 'dataset') Object.assign(el.dataset, val);
    else if (key === 'style' && typeof val === 'object') {
      // CSSOM é permitido pela CSP (diferente do atributo style inline).
      for (const [p, v] of Object.entries(val)) {
        if (p.startsWith('--')) el.style.setProperty(p, v);
        else el.style[p] = v;
      }
    } else if (key.startsWith('on')) {
      if (typeof val === 'function') el.addEventListener(key.slice(2).toLowerCase(), val);
    } else if (key === 'value' || key === 'checked' || key === 'selected') {
      el[key] = val;
    } else if (key === 'href' || key === 'src') {
      el.setAttribute(key, safeUrl(val));
    } else if (val === true) {
      el.setAttribute(key, '');
    } else {
      el.setAttribute(key, String(val));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

/** Ícone SVG a partir do sprite embutido no index.html (<symbol id="i-nome">). */
export function icon(name, cls = 'icon') {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  const use = document.createElementNS(SVG_NS, 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

/** Cria elemento SVG genérico (usado pelo gráfico). */
export function svgEl(tag, attrs = {}, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  }
  appendChildren(el, children);
  return el;
}

// ───────────── Números ─────────────

/**
 * Interpreta números digitados em pt-BR ("42,5" ou "42.5").
 * Retorna NaN quando inválido. Aceita até 2 casas decimais.
 */
export function parseDecimal(text) {
  const s = String(text ?? '').trim();
  if (!/^\d{1,4}([.,]\d{1,2})?$/.test(s)) return NaN;
  return Number(s.replace(',', '.'));
}

/** Formata número no padrão brasileiro (42,5). */
export function fmtNum(n, max = 2) {
  return Number(n).toLocaleString('pt-BR', { maximumFractionDigits: max });
}

export const fmtKg = (n) => `${fmtNum(n)} kg`;

/** Estimativa de 1RM (fórmula de Epley). Repetições limitadas a 15 (fórmula perde precisão acima). */
export function estimate1RM(weight, reps) {
  if (!(weight > 0) || !(reps > 0)) return 0;
  return weight * (1 + Math.min(reps, 15) / 30);
}

export const clamp = (n, min, max) => Math.min(max, Math.max(min, n));

// ───────────── Datas (sempre no fuso local do usuário) ─────────────

const pad = (n) => String(n).padStart(2, '0');

/** Data local em formato AAAA-MM-DD. */
export function isoDate(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** AAAA-MM-DD → Date local (meia-noite), sem deslocamento de fuso. */
export function parseISODate(s) {
  const [y, m, d] = String(s).split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function fmtDateLong(iso) {
  return parseISODate(iso).toLocaleDateString('pt-BR', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function fmtDateShort(iso) {
  return parseISODate(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
}

export function fmtDateFull(iso) {
  return parseISODate(iso).toLocaleDateString('pt-BR', {
    day: '2-digit', month: 'short', year: 'numeric',
  });
}

/** Segunda-feira (AAAA-MM-DD) da semana que contém a data. */
export function weekStartISO(d = new Date()) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = (x.getDay() + 6) % 7; // segunda = 0
  x.setDate(x.getDate() - diff);
  return isoDate(x);
}

/** Segundos → "m:ss". */
export function fmtClock(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  return `${Math.floor(s / 60)}:${pad(s % 60)}`;
}

// ───────────── Funções auxiliares ─────────────

export function debounce(fn, ms) {
  let t;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
  wrapped.flush = (...args) => { clearTimeout(t); fn(...args); };
  wrapped.cancel = () => clearTimeout(t);
  return wrapped;
}

/** Remove acentos e caixa — usado na busca da biblioteca. */
export function normalizeSearch(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** Base64 ⇄ bytes (backup criptografado). */
export function bytesToB64(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
export function b64ToBytes(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}
