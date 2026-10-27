/**
 * FORJA — Instalação da PWA.
 * O navegador só oferece o prompt personalizado quando considera o app instalável.
 */
let deferredPrompt = null;
let initialized = false;
let installed = Boolean(
  window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true,
);
const listeners = new Set();

function emit() {
  const state = getInstallState();
  listeners.forEach((listener) => listener(state));
}

export function getInstallState() {
  return { installed, available: Boolean(deferredPrompt) };
}

export function onInstallStateChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function initInstall() {
  if (initialized) return;
  initialized = true;

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredPrompt = event;
    emit();
  });

  window.addEventListener('appinstalled', () => {
    installed = true;
    deferredPrompt = null;
    emit();
  });
}

export async function installApp() {
  if (installed) return 'installed';
  if (!deferredPrompt) return 'unavailable';

  const promptEvent = deferredPrompt;
  deferredPrompt = null;
  try {
    const promptResult = promptEvent.prompt();
    const choice = await (promptResult?.then ? promptResult : promptEvent.userChoice);
    if (choice?.outcome === 'accepted') installed = true;
    emit();
    return choice?.outcome || 'unavailable';
  } catch {
    emit();
    return 'unavailable';
  }
}
