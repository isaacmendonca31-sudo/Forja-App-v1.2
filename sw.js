/**
 * FORJA — Service Worker (funcionamento offline).
 *
 * Estratégia:
 *  • Pré-cache de todo o "app shell" na instalação → o app abre sem internet.
 *  • Cache-first para arquivos do próprio app; navegação cai em index.html.
 *  • Requisições para OUTRAS origens (ex.: Supabase) NUNCA passam pelo cache:
 *    dados de usuário e tokens não ficam em cache do service worker.
 *  • Atualização controlada: o novo SW espera (não usa skipWaiting sozinho) até
 *    o usuário aceitar "Atualizar" — assim nunca recarrega no meio de um treino.
 *
 * AO PUBLICAR UMA NOVA VERSÃO: altere VERSION (e confira a lista SHELL;
 * `node scripts/check-precache.mjs` valida que todos os arquivos existem).
 */
const VERSION = '1.3.0';
const CACHE = `forja-shell-${VERSION}`;

const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'js/app.js',
  'js/backup.js',
  'js/chart.js',
  'js/config.js',
  'js/demo.js',
  'js/feedback.js',
  'js/insights.js',
  'js/install.js',
  'js/legacy.js',
  'js/rank.js',
  'js/store.js',
  'js/suggest.js',
  'js/summary.js',
  'js/sync.js',
  'js/timer.js',
  'js/ui.js',
  'js/utils.js',
  'js/validate.js',
  'js/version.js',
  'js/data/library.js',
  'js/data/plan.js',
  'js/views/history.js',
  'js/views/library.js',
  'js/views/plan.js',
  'js/views/progress.js',
  'js/views/settings.js',
  'js/views/today.js',
  'js/views/workout.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(SHELL)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('forja-shell-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// O app pede explicitamente a ativação da nova versão.
self.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Só tratamos GET da mesma origem; o resto vai direto à rede.
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;

  // Navegação (abrir/recarregar o app): serve o shell; rede como reserva.
  if (req.mode === 'navigate') {
    event.respondWith(
      caches.match('index.html').then((hit) => hit || fetch(req)),
    );
    return;
  }

  event.respondWith(
    caches.match(req, { ignoreSearch: true }).then((hit) => hit || fetch(req)),
  );
});
