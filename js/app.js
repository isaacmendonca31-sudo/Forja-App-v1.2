/**
 * FORJA — Ponto de entrada: roteador, service worker, sincronização e tratamento global de erros.
 *
 * Roteamento por hash (#/rota): funciona offline e em qualquer hospedagem estática,
 * sem precisar de configuração de servidor.
 */
import {
  initStore, subscribe, takeStartupNotice, onStorageError, loadDraft, isDemoMode, getDemoInfo,
} from './store.js';
import { initTimer } from './timer.js';
import { startAutoSync, onSyncChange, getSyncInfo } from './sync.js';
import { toast } from './ui.js';
import { h } from './utils.js';
import { announce, setAmbientRank } from './feedback.js';
import { isId } from './validate.js';
import { initInstall, installApp, getInstallState, onInstallStateChange } from './install.js';

import * as today from './views/today.js';
import * as workout from './views/workout.js';
import * as plan from './views/plan.js';
import * as progress from './views/progress.js';
import * as history from './views/history.js';
import * as library from './views/library.js';
import * as settings from './views/settings.js';

// [padrão, item da navegação, módulo da tela]
const ROUTES = [
  ['/', 'treino', today],
  ['/treino/:id', 'treino', workout],
  ['/ficha/:id', 'treino', plan],
  ['/evolucao', 'evolucao', progress],
  ['/evolucao/:id', 'evolucao', progress],
  ['/historico', 'historico', history],
  ['/historico/:id', 'historico', history],
  ['/biblioteca', 'biblioteca', library],
  ['/ajustes', 'ajustes', settings],
];

const main = document.getElementById('main');
let current = null; // { view, params, handle }

// ───────────── Instalação da PWA ─────────────
const installButton = document.getElementById('install-app');
function paintInstallButton() {
  installButton.hidden = getInstallState().installed;
}
installButton.addEventListener('click', async () => {
  const result = await installApp();
  if (result === 'accepted') {
    toast('FORJA instalado com sucesso.');
  } else if (result === 'dismissed') {
    toast('Instalação cancelada. Você pode tentar novamente pelo menu do navegador.');
  } else if (result === 'installed') {
    toast('FORJA já está instalado neste aparelho.');
  } else if (location.protocol === 'file:' || !window.isSecureContext) {
    toast('Para instalar, abra o FORJA por HTTPS ou localhost. O arquivo aberto diretamente não pode ser instalado como PWA.', { error: true, timeout: 0 });
  } else if (/iPhone|iPad|iPod/.test(navigator.userAgent)) {
    toast('No iPhone ou iPad: toque em Compartilhar e escolha “Adicionar à Tela de Início”.', { timeout: 0 });
  } else {
    toast('Abra o menu do navegador e procure “Instalar app” ou “Adicionar à tela inicial”.', { timeout: 0 });
  }
});
initInstall();
onInstallStateChange(paintInstallButton);
paintInstallButton();

/** Casa o caminho com uma rota; valida parâmetros (só ids seguros). */
function match(path) {
  const parts = path.split('/').filter(Boolean);
  for (const [pattern, nav, view] of ROUTES) {
    const pp = pattern.split('/').filter(Boolean);
    if (pp.length !== parts.length) continue;
    const params = {};
    let ok = true;
    pp.forEach((seg, i) => {
      if (seg.startsWith(':')) {
        if (isId(parts[i])) params[seg.slice(1)] = parts[i]; else ok = false;
      } else if (seg !== parts[i]) ok = false;
    });
    if (ok) return { nav, view, params };
  }
  return null;
}

const navigate = (path) => { location.hash = `#${path}`; };

function mount() {
  const path = (location.hash.slice(1) || '/').split('?')[0];
  const found = match(path) || match('/');

  current?.handle?.destroy?.();
  setAmbientRank(null); // telas que exibem um rank (resumo/histórico) o reativam ao montar
  const ctx = { params: found.params, navigate, rerender: mount };
  const handle = found.view.render(ctx);
  current = { ...found, handle };

  main.replaceChildren(handle.el);
  document.title = `${handle.title} · FORJA`;
  main.classList.toggle('has-timer', !document.getElementById('rest-timer').hidden);

  // Navegação: marca a aba ativa (aria-current) para leitores de tela.
  document.querySelectorAll('.bottom-nav a').forEach((a) => {
    if (a.dataset.route === found.nav) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });

  window.scrollTo(0, 0);
  main.focus({ preventScroll: true }); // leitores de tela começam pelo conteúdo novo
}

// ───────────── Aviso do modo de teste (dados simulados) ─────────────
const demoBanner = document.getElementById('demo-banner');
function paintDemoBanner() {
  if (!isDemoMode()) { demoBanner.hidden = true; demoBanner.replaceChildren(); return; }
  const { count } = getDemoInfo();
  demoBanner.hidden = false;
  demoBanner.replaceChildren(
    h('span', { class: 'grow' }, `Modo de teste: ${count} treinos simulados misturados ao histórico. Seus dados reais não foram alterados.`),
    h('a', { href: '#/ajustes' }, 'Gerenciar'));
}

// ───────────── Selo de sincronização ─────────────
const badge = document.getElementById('sync-badge');
const BADGE_TEXT = {
  idle: 'Sincronizado', syncing: 'Sincronizando…', offline: 'Offline',
  error: 'Erro de sincronização', 'signed-out': 'Desconectado',
};
function paintBadge(info) {
  if (info.status === 'disabled') { badge.hidden = true; return; }
  badge.hidden = false;
  badge.dataset.state = info.status;
  const pending = info.pending ? ` · ${info.pending} pendente${info.pending > 1 ? 's' : ''}` : '';
  badge.textContent = `${BADGE_TEXT[info.status] ?? ''}${info.status === 'idle' ? '' : pending}`;
}

// ───────────── Service Worker (PWA offline) ─────────────
function setupServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  let userRequestedUpdate = false;

  const promptUpdate = (worker) => {
    const msg = loadDraft()
      ? 'Nova versão disponível. Seu treino em andamento é salvo automaticamente.'
      : 'Nova versão disponível.';
    toast(msg, { action: 'Atualizar', timeout: 0, onAction: () => { userRequestedUpdate = true; worker.postMessage('SKIP_WAITING'); } });
  };

  navigator.serviceWorker.register('sw.js').then((reg) => {
    if (reg.waiting && navigator.serviceWorker.controller) promptUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => {
        if (w.state === 'installed' && navigator.serviceWorker.controller) promptUpdate(w);
      });
    });
  }).catch(() => { /* sem SW (ex.: http fora de localhost): app segue online-only */ });

  // Só recarrega quando o usuário escolheu atualizar (evita reload na 1ª instalação).
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (userRequestedUpdate) location.reload();
  });
}

// ───────────── Erros globais (mensagem genérica; nada sensível é exibido) ─────────────
let lastErrorToast = 0;
function reportUnexpected() {
  if (Date.now() - lastErrorToast < 10_000) return;
  lastErrorToast = Date.now();
  toast('Algo deu errado. Seus dados salvos estão preservados; se persistir, recarregue o app.', { error: true });
}
window.addEventListener('error', reportUnexpected);
window.addEventListener('unhandledrejection', reportUnexpected);

// ───────────── Inicialização ─────────────
initStore();
onStorageError((m) => toast(m, { error: true, timeout: 0 }));
const notice = takeStartupNotice();
if (notice) toast(notice, { error: true, timeout: 0 });

initTimer(document.getElementById('rest-timer'));
onSyncChange(paintBadge);
subscribe((origin) => {
  // Modo de teste ligado/desligado: atualiza o aviso e a tela (exceto durante um treino).
  if (origin === 'demo') {
    paintDemoBanner();
    announce(isDemoMode() ? 'Modo de teste ligado.' : 'Modo de teste desligado.');
    if (current?.handle.live !== false) mount();
    return;
  }
  // Dados vindos da nuvem: atualiza a tela atual (exceto telas de edição em andamento).
  if (origin === 'remote' && current?.handle.live !== false) mount();
  paintBadge(getSyncInfo());
});

window.addEventListener('hashchange', mount);
paintDemoBanner();
mount();
startAutoSync();
paintBadge(getSyncInfo());
setupServiceWorker();
