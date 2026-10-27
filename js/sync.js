/**
 * FORJA — Autenticação e sincronização com Supabase (opcional).
 *
 * Sem bibliotecas de terceiros: fala direto com as APIs REST do Supabase
 * (GoTrue /auth/v1 e PostgREST /rest/v1) via fetch.
 *
 * Segurança:
 *   • Só a chave "anon" (pública) é usada; o isolamento entre usuários é feito
 *     no servidor por RLS (supabase/schema.sql). Esta camada não "protege" nada
 *     sozinha — ela apenas respeita o que o servidor permite.
 *   • Tudo que chega da nuvem é re-validado (store.applyRecords → validate.js).
 *   • Não há cadastro público no app: as 2 contas são criadas no painel do
 *     Supabase (e o cadastro aberto deve ser desativado lá).
 *   • Mensagens de erro de login são genéricas (não revelam se o e-mail existe).
 *   • Bloqueio temporário após falhas repetidas (conforto + defesa em camadas;
 *     o limite real de tentativas é imposto pelo Supabase Auth).
 *   • Tokens ficam em localStorage (necessário para funcionar offline/PWA).
 *     Mitigação: CSP estrita sem scripts inline/externos e saneamento de toda
 *     a saída (anti-XSS). Ver docs/SECURITY.md.
 *
 * Sincronização (offline-first):
 *   1) PULL  registros alterados no servidor desde o último cursor;
 *   2) MERGE "last write wins" por registro (updatedAt), exclusões via lápide;
 *   3) PUSH  registros locais pendentes (dirty). O servidor também aplica LWW
 *            (trigger), então um aparelho atrasado não sobrescreve dados novos.
 */
import { CONFIG } from './config.js';
import {
  applyRecords, dirtyRecords, clearDirty, recordKey, markAllDirty, dirtyCount, subscribe,
} from './store.js';

const AUTH_KEY = 'forja:auth:v1';
const CURSOR_KEY = 'forja:sync-cursor:v1';
const MIGRATED_KEY = 'forja:migrated:v1'; // usuário já decidiu sobre enviar dados locais
const PAGE = 500;
const PUSH_CHUNK = 100;

/** Estados: disabled | signed-out | idle | syncing | offline | error */
let status = 'disabled';
let lastError = '';
let lastSyncAt = 0;
let running = false;
let failedLogins = 0;
let lockedUntil = 0;
const listeners = new Set();

// ───────────── Configuração ─────────────
const URL_RE = /^https:\/\/[a-z0-9-]{3,63}\.supabase\.co$/;

export function isConfigured() {
  return URL_RE.test(CONFIG.SUPABASE_URL) && typeof CONFIG.SUPABASE_ANON_KEY === 'string'
    && CONFIG.SUPABASE_ANON_KEY.length > 20;
}

// ───────────── Sessão de autenticação ─────────────
function loadAuth() {
  try {
    const a = JSON.parse(localStorage.getItem(AUTH_KEY) || 'null');
    if (a && typeof a.refresh_token === 'string' && typeof a.access_token === 'string') return a;
  } catch { /* ignora */ }
  return null;
}
let auth = loadAuth();

function saveAuth(a) {
  auth = a;
  try {
    if (a) localStorage.setItem(AUTH_KEY, JSON.stringify(a));
    else localStorage.removeItem(AUTH_KEY);
  } catch { /* ignora */ }
}

export const getUser = () => (auth ? { email: auth.user?.email ?? '', id: auth.user?.id ?? '' } : null);
export const getSyncInfo = () => ({ status, lastError, lastSyncAt, pending: dirtyCount() });
export function onSyncChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function setStatus(s, err = '') {
  status = s; lastError = err;
  listeners.forEach((fn) => fn(getSyncInfo()));
}

// ───────────── HTTP ─────────────
async function http(path, { method = 'GET', body, headers = {}, bearer = true } = {}) {
  const res = await fetch(`${CONFIG.SUPABASE_URL}${path}`, {
    method,
    headers: {
      apikey: CONFIG.SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
      ...(bearer && auth ? { Authorization: `Bearer ${auth.access_token}` } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'omit', // nunca enviar cookies
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  });
  return res;
}

function storeTokens(json) {
  saveAuth({
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: json.expires_at ?? Math.floor(Date.now() / 1000) + (json.expires_in ?? 3600),
    user: { id: json.user?.id ?? '', email: json.user?.email ?? '' },
  });
}

/** Login com e-mail e senha. Lança Error com mensagem amigável e genérica. */
export async function signIn(email, password) {
  if (!isConfigured()) throw new Error('Sincronização não configurada.');
  if (Date.now() < lockedUntil) {
    throw new Error(`Muitas tentativas. Aguarde ${Math.ceil((lockedUntil - Date.now()) / 1000)} s.`);
  }
  let res;
  try {
    res = await http('/auth/v1/token?grant_type=password', {
      method: 'POST', body: { email, password }, bearer: false,
    });
  } catch {
    throw new Error('Sem conexão. Tente novamente quando estiver online.');
  }
  if (!res.ok) {
    failedLogins += 1;
    if (failedLogins >= 5) { lockedUntil = Date.now() + 30_000; failedLogins = 0; }
    throw new Error('E-mail ou senha incorretos.'); // genérico de propósito
  }
  failedLogins = 0;
  storeTokens(await res.json());
  setStatus('idle');
}

/** Encerra a sessão (no servidor, se possível, e localmente). Dados locais permanecem. */
export async function signOut() {
  try {
    if (auth && navigator.onLine) await http('/auth/v1/logout', { method: 'POST' });
  } catch { /* segue mesmo assim */ }
  saveAuth(null);
  try { localStorage.removeItem(CURSOR_KEY); } catch { /* ignora */ }
  setStatus(isConfigured() ? 'signed-out' : 'disabled');
}

async function ensureFreshToken() {
  if (!auth) throw new Error('auth');
  if (auth.expires_at - Math.floor(Date.now() / 1000) > 60) return;
  const res = await http('/auth/v1/token?grant_type=refresh_token', {
    method: 'POST', body: { refresh_token: auth.refresh_token }, bearer: false,
  });
  if (!res.ok) { saveAuth(null); throw new Error('auth'); } // sessão expirada/revogada
  storeTokens(await res.json());
}

// ───────────── Migração (dados locais → conta) ─────────────
export const wasMigrationHandled = () => localStorage.getItem(MIGRATED_KEY) === '1';
export function setMigrationHandled() { try { localStorage.setItem(MIGRATED_KEY, '1'); } catch { /* ignora */ } }

/** Com autorização do usuário: marca todos os dados locais para envio à conta. */
export function queueLocalDataForUpload() { markAllDirty(); setMigrationHandled(); }

// ───────────── Sincronização ─────────────
async function pull() {
  const cursor = localStorage.getItem(CURSOR_KEY) || '1970-01-01T00:00:00Z';
  let offset = 0;
  let maxSeen = cursor;
  for (;;) {
    const qs = new URLSearchParams({
      select: 'kind,id,data,updated_at',
      updated_at: `gte.${cursor}`, // gte + merge idempotente = não perde registros na fronteira
      order: 'updated_at.asc,kind.asc,id.asc',
      limit: String(PAGE),
      offset: String(offset),
    });
    const res = await http(`/rest/v1/forja_records?${qs}`);
    if (res.status === 401) throw new Error('auth');
    if (!res.ok) throw new Error('pull');
    const rows = await res.json();
    if (!Array.isArray(rows)) throw new Error('pull');
    applyRecords(rows); // revalida e aplica LWW
    for (const r of rows) if (typeof r.updated_at === 'string' && r.updated_at > maxSeen) maxSeen = r.updated_at;
    if (rows.length < PAGE) break;
    offset += PAGE;
  }
  try { localStorage.setItem(CURSOR_KEY, maxSeen); } catch { /* ignora */ }
}

async function push() {
  const records = dirtyRecords();
  for (let i = 0; i < records.length; i += PUSH_CHUNK) {
    const chunk = records.slice(i, i + PUSH_CHUNK);
    const body = chunk.map((r) => ({
      kind: r.kind,
      id: r.id,
      data: r.data,
      client_updated_at: r.data.updatedAt,
      deleted: Boolean(r.data.deletedAt),
    }));
    const res = await http('/rest/v1/forja_records?on_conflict=user_id,kind,id', {
      method: 'POST',
      body,
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
    if (res.status === 401) throw new Error('auth');
    if (!res.ok) throw new Error('push');
    clearDirty(chunk.map((r) => recordKey(r.kind, r.id)));
  }
}

/** Executa um ciclo completo de sincronização. Seguro chamar várias vezes. */
export async function syncNow() {
  if (!isConfigured() || !auth || running) return;
  if (!navigator.onLine) { setStatus('offline'); return; }
  running = true;
  setStatus('syncing');
  try {
    await ensureFreshToken();
    await pull();
    await push();
    lastSyncAt = Date.now();
    setStatus('idle');
  } catch (e) {
    if (e.message === 'auth') setStatus('signed-out', 'Sessão expirada. Entre novamente.');
    else if (!navigator.onLine || e instanceof TypeError) setStatus('offline');
    else setStatus('error', 'Não foi possível sincronizar agora. Seus dados continuam salvos no aparelho.');
  } finally {
    running = false;
  }
}

/** Remove da nuvem TODOS os dados da conta atual (direito de exclusão — LGPD). */
export async function deleteCloudData() {
  await ensureFreshToken();
  const res = await http('/rest/v1/forja_records?user_id=not.is.null', {
    method: 'DELETE', headers: { Prefer: 'return=minimal' },
  });
  if (!res.ok) throw new Error('Não foi possível excluir os dados da nuvem.');
  try { localStorage.removeItem(CURSOR_KEY); } catch { /* ignora */ }
}

/** Inicia gatilhos automáticos: ao abrir, ao voltar online, ao focar e após alterações. */
export function startAutoSync() {
  setStatus(!isConfigured() ? 'disabled' : auth ? 'idle' : 'signed-out');
  if (!isConfigured()) return;

  let timer;
  const schedule = (ms) => { clearTimeout(timer); timer = setTimeout(syncNow, ms); };

  window.addEventListener('online', () => schedule(500));
  window.addEventListener('offline', () => { if (auth) setStatus('offline'); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') schedule(1000); });
  // Alterações locais → envia após 4 s de calmaria (agrupa várias edições).
  subscribe((origin) => { if (origin === 'local' && auth && dirtyCount()) schedule(4000); });
  if (auth) schedule(800);
}
