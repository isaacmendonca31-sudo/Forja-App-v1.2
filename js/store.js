/**
 * FORJA — Armazenamento local (offline-first).
 *
 * Fonte da verdade no aparelho: localStorage, em uma única chave versionada.
 * Todos os dados lidos passam por validate.js (nunca confiamos no que foi
 * gravado, pois pode ter sido corrompido ou adulterado).
 *
 * Modelo de sincronização (ver sync.js):
 *   • Cada entidade é um "registro" { kind, id, data } com `updatedAt` (ms).
 *   • Exclusões são "lápides" (deletedAt) — assim a exclusão também sincroniza.
 *   • Conflitos: vence o registro com maior `updatedAt` ("last write wins").
 *   • Registros alterados localmente entram no conjunto `dirty` (persistido)
 *     até serem enviados com sucesso.
 *
 * Tipos de registro: 'plan' (id 'main'), 'settings' (id 'main'),
 *                    'exercise' (personalizado) e 'session' (treino concluído).
 */
import { BASE_LIBRARY } from './data/library.js';
import { buildDefaultPlan } from './data/plan.js';
import {
  sanitizeState, sanitizeRecordData, sanitizeDraft, sanitizeSession, sanitizeExercise,
  sanitizePlan, sanitizeSettings, DEFAULT_SETTINGS, FORMAT_VERSION,
} from './validate.js';
import { uid } from './utils.js';
import { generateDemoSessions } from './demo.js';
import {
  convertLegacySnapshot, LEGACY_MIGRATION_KEY,
  LEGACY_SESSION_KEY, LEGACY_WORKOUTS_KEY,
} from './legacy.js';

const KEY = 'forja:v1';
const DRAFT_KEY = 'forja:draft:v1';
const DIRTY_KEY = 'forja:dirty:v1';
const SAFETY_KEY = 'forja:safety-backup:v1'; // cópia automática antes de importar/substituir
const CORRUPT_KEY = 'forja:corrupt:v1'; // cópia de dados ilegíveis (para recuperação manual)

// Modo desenvolvedor: histórico SIMULADO, guardado em chaves próprias. Nunca entra em
// `state`, no backup, na lista de sincronização nem no conjunto `dirty`.
const DEMO_KEY = 'forja:demo:v1';
const DEMO_MODE_KEY = 'forja:demo-mode:v1';
const UI_KEY = 'forja:ui:v1'; // preferências de interface sem dado pessoal (ex.: dica dispensada)

const BASE_BY_ID = new Map(BASE_LIBRARY.map((e) => [e.id, e]));

let state = null;
let dirty = new Set();
let startupNotice = '';
let demo = { on: false, seed: 0, weeks: 12, createdAt: 0, sessions: [] };
const listeners = new Set();
const errorListeners = new Set();

// ───────────── Acesso seguro ao localStorage ─────────────
function lsGet(key) {
  try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch { /* ignora */ }
}

function persist() {
  if (!lsSet(KEY, JSON.stringify(state))) {
    errorListeners.forEach((fn) => fn('Não foi possível salvar neste aparelho (armazenamento cheio ou bloqueado). Exporte um backup.'));
  }
}
function persistDirty() {
  lsSet(DIRTY_KEY, JSON.stringify([...dirty]));
}

// ───────────── Inicialização ─────────────
export function newState() {
  return {
    schemaVersion: FORMAT_VERSION,
    plan: buildDefaultPlan(),
    customExercises: [],
    sessions: [],
    settings: { ...DEFAULT_SETTINGS },
  };
}

export function initStore() {
  const raw = lsGet(KEY);
  if (raw) {
    try {
      state = sanitizeState(JSON.parse(raw), buildDefaultPlan).state;
    } catch {
      // Dados ilegíveis: preservamos uma cópia para recuperação e recomeçamos.
      lsSet(CORRUPT_KEY, raw);
      startupNotice = 'Os dados locais estavam corrompidos. Uma cópia foi preservada e o app foi reiniciado. Se tiver um backup, importe-o em Ajustes.';
      state = newState();
    }
  } else {
    state = newState();
  }
  try {
    const d = JSON.parse(lsGet(DIRTY_KEY) || '[]');
    dirty = new Set(Array.isArray(d) ? d.filter((k) => typeof k === 'string' && k.length < 100) : []);
  } catch { dirty = new Set(); }
  migrateLegacyStorage();
  loadDemo();
  persist();
  // Pede ao navegador que não apague os dados em situações de pouco espaço.
  navigator.storage?.persist?.().catch(() => {});
}

/** Importa a versão monolítica uma única vez e mantém as chaves antigas intactas. */
function migrateLegacyStorage() {
  if (lsGet(LEGACY_MIGRATION_KEY)) return;
  const rawWorkouts = lsGet(LEGACY_WORKOUTS_KEY);
  const rawSession = lsGet(LEGACY_SESSION_KEY);
  if (rawWorkouts === null && rawSession === null) {
    lsSet(LEGACY_MIGRATION_KEY, 'done');
    return;
  }

  let workouts = [];
  let activeSession = null;
  try {
    workouts = rawWorkouts ? JSON.parse(rawWorkouts) : [];
    activeSession = rawSession ? JSON.parse(rawSession) : null;
    if (!Array.isArray(workouts)) throw new Error('formato');
  } catch {
    startupNotice = 'Não foi possível converter os dados da versão anterior. Exporte um backup no app antigo e importe em Ajustes.';
    lsSet(LEGACY_MIGRATION_KEY, 'invalid');
    return;
  }

  const converted = convertLegacySnapshot(workouts, activeSession);
  const existingSessionIds = new Set(state.sessions.map((s) => s.id));
  const importedSessions = converted.sessions
    .map((s) => sanitizeSession(s))
    .filter((s) => s && !existingSessionIds.has(s.id));
  const existingExerciseIds = new Set(state.customExercises.map((e) => e.id));
  const importedExercises = converted.customExercises
    .map((e) => sanitizeExercise(e))
    .filter((e) => e && !existingExerciseIds.has(e.id));

  state.sessions.push(...importedSessions);
  state.customExercises.push(...importedExercises);
  importedSessions.forEach((s) => dirty.add(rk('session', s.id)));
  importedExercises.forEach((e) => dirty.add(rk('exercise', e.id)));

  let restoredDraft = false;
  if (converted.draft && !loadDraft()) {
    saveDraft(converted.draft);
    restoredDraft = true;
  }
  persist();
  persistDirty();
  lsSet(LEGACY_MIGRATION_KEY, 'done');

  if (importedSessions.length || importedExercises.length || restoredDraft) {
    const parts = [];
    if (importedSessions.length) parts.push(`${importedSessions.length} treino(s) do app anterior`);
    if (restoredDraft) parts.push('um treino em andamento');
    startupNotice = `Importamos ${parts.join(' e ')}. A cópia original foi mantida neste aparelho.`;
  }
}

export const takeStartupNotice = () => { const n = startupNotice; startupNotice = ''; return n; };
export const getState = () => state;

/** Assina mudanças. fn(origin) — origin: 'local' | 'remote'. */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
export function onStorageError(fn) { errorListeners.add(fn); return () => errorListeners.delete(fn); }

function commit(keys = [], origin = 'local') {
  persist();
  if (origin === 'local') {
    keys.forEach((k) => dirty.add(k));
    persistDirty();
  }
  listeners.forEach((fn) => fn(origin));
}

const now = () => Date.now();
const rk = (kind, id) => `${kind}:${id}`;

// ───────────── Leituras ─────────────
export function getSessions() {
  // Com o modo de teste ligado, os treinos simulados aparecem junto (marcados com `demo: true`).
  const source = demo.on ? [...state.sessions, ...demo.sessions] : state.sessions;
  return source
    .filter((s) => !s.deletedAt)
    .sort((a, b) => (a.date === b.date ? b.startedAt - a.startedAt : a.date < b.date ? 1 : -1));
}
export const getSession = (id) => getSessions().find((s) => s.id === id) || null;

/** Exercício por id (inclui personalizados já excluídos, para o histórico continuar legível). */
export function getExercise(id) {
  return state.customExercises.find((e) => e.id === id) || BASE_BY_ID.get(id) || null;
}
export function getAllExercises() {
  return [...BASE_LIBRARY, ...state.customExercises.filter((e) => !e.deletedAt)];
}
export const getPlan = () => state.plan;
export const getSettings = () => state.settings;

// ───────────── Escritas ─────────────
export function addSession(raw) {
  const s = sanitizeSession({ ...raw, id: raw.id || uid(), updatedAt: now() });
  if (!s) throw new Error('Treino inválido.');
  state.sessions.push(s);
  commit([rk('session', s.id)]);
  return s;
}

/** Exclusão lógica (permite "Desfazer" e sincronizar a exclusão). */
export function deleteSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  s.deletedAt = now();
  s.updatedAt = s.deletedAt;
  commit([rk('session', id)]);
}
export function restoreSession(id) {
  const s = state.sessions.find((x) => x.id === id);
  if (!s) return;
  delete s.deletedAt;
  s.updatedAt = now();
  commit([rk('session', id)]);
}

export function savePlan(plan) {
  const clean = sanitizePlan({ ...plan, updatedAt: now() });
  if (!clean) throw new Error('Ficha inválida.');
  state.plan = clean;
  commit([rk('plan', 'main')]);
}
export function resetPlan() {
  const p = buildDefaultPlan();
  p.updatedAt = now();
  state.plan = p;
  commit([rk('plan', 'main')]);
}

export function saveExercise(raw) {
  const clean = sanitizeExercise({ ...raw, id: raw.id || uid(), updatedAt: now() });
  if (!clean) throw new Error('Exercício inválido.');
  const i = state.customExercises.findIndex((e) => e.id === clean.id);
  if (i >= 0) state.customExercises[i] = clean; else state.customExercises.push(clean);
  commit([rk('exercise', clean.id)]);
  return clean;
}
export function deleteExercise(id) {
  const e = state.customExercises.find((x) => x.id === id);
  if (!e) return;
  e.deletedAt = now();
  e.updatedAt = e.deletedAt;
  commit([rk('exercise', id)]);
}
export function restoreExercise(id) {
  const e = state.customExercises.find((x) => x.id === id);
  if (!e) return;
  delete e.deletedAt;
  e.updatedAt = now();
  commit([rk('exercise', id)]);
}

export function updateSettings(patch) {
  state.settings = sanitizeSettings({ ...state.settings, ...patch, updatedAt: now() });
  commit([rk('settings', 'main')]);
}


// ───────────── Modo desenvolvedor (dados de teste isolados) ─────────────
function loadDemo() {
  demo = { on: false, seed: 0, weeks: 12, createdAt: 0, sessions: [] };
  if (lsGet(DEMO_MODE_KEY) !== '1') return;
  try {
    const raw = JSON.parse(lsGet(DEMO_KEY) || 'null');
    const list = Array.isArray(raw?.sessions) ? raw.sessions : [];
    demo.sessions = list.map((x) => sanitizeSession(x)).filter(Boolean).map((x) => ({ ...x, demo: true }));
    demo.seed = Number.isInteger(raw?.seed) ? raw.seed : 0;
    demo.weeks = Number.isInteger(raw?.weeks) ? raw.weeks : 12;
    demo.createdAt = Number.isFinite(raw?.createdAt) ? raw.createdAt : 0;
    demo.on = demo.sessions.length > 0;
  } catch { demo.on = false; }
  if (!demo.on) lsRemove(DEMO_MODE_KEY);
}

function buildDemo(weeks) {
  const { seed, sessions } = generateDemoSessions({ plan: state.plan, weeks, getExercise });
  demo = {
    on: true, seed, weeks, createdAt: now(),
    sessions: sessions.map((x) => sanitizeSession(x)).filter(Boolean).map((x) => ({ ...x, demo: true })),
  };
  const saved = lsSet(DEMO_KEY, JSON.stringify({
    seed, weeks, createdAt: demo.createdAt,
    sessions: demo.sessions.map(({ demo: _flag, ...rest }) => rest),
  }));
  if (saved) lsSet(DEMO_MODE_KEY, '1');
  return saved;
}

/** Liga o modo de teste (gera um histórico simulado). Retorna false se não coube no armazenamento. */
export function enableDemoMode({ weeks = 12 } = {}) {
  const ok = buildDemo(Math.min(52, Math.max(1, Math.trunc(weeks))));
  if (!ok) { demo.on = false; demo.sessions = []; return false; }
  listeners.forEach((fn) => fn('demo'));
  return true;
}
/** Desliga o modo de teste e apaga os dados simulados. Os dados reais não são tocados. */
export function disableDemoMode() {
  demo = { on: false, seed: 0, weeks: 12, createdAt: 0, sessions: [] };
  lsRemove(DEMO_KEY); lsRemove(DEMO_MODE_KEY);
  listeners.forEach((fn) => fn('demo'));
}
export const isDemoMode = () => demo.on;
export const isDemoSession = (s) => s?.demo === true;
export const getDemoInfo = () => ({ on: demo.on, count: demo.sessions.length, weeks: demo.weeks, seed: demo.seed, createdAt: demo.createdAt });
/** Arquivo para estudo em Python. `app` diferente de 'forja': o importador do app o recusa. */
export function buildDemoExport() {
  return {
    app: 'forja-demo', format: 1, exportedAt: new Date().toISOString(),
    data: { sessions: demo.sessions.map(({ demo: _flag, ...rest }) => rest) },
  };
}

// ───────────── Preferências de interface (sem dado pessoal) ─────────────
export function getUiFlag(name) {
  try { return JSON.parse(lsGet(UI_KEY) || '{}')[name] === true; } catch { return false; }
}
export function setUiFlag(name, value = true) {
  let cur = {};
  try { cur = JSON.parse(lsGet(UI_KEY) || '{}'); } catch { /* recomeça */ }
  if (typeof cur !== 'object' || cur === null) cur = {};
  cur[String(name).slice(0, 40)] = value === true;
  lsSet(UI_KEY, JSON.stringify(cur));
}

// ───────────── Rascunho do treino em andamento (local, não sincroniza) ─────────────
export function loadDraft() {
  try { return sanitizeDraft(JSON.parse(lsGet(DRAFT_KEY) || 'null')); } catch { return null; }
}
export function saveDraft(draft) { lsSet(DRAFT_KEY, JSON.stringify(draft)); }
export function clearDraft() { lsRemove(DRAFT_KEY); }

// ───────────── Registros para sincronização ─────────────
export function listRecords() {
  const out = [
    { kind: 'plan', id: 'main', data: state.plan },
    { kind: 'settings', id: 'main', data: state.settings },
  ];
  state.customExercises.forEach((e) => out.push({ kind: 'exercise', id: e.id, data: e }));
  state.sessions.forEach((s) => out.push({ kind: 'session', id: s.id, data: s }));
  return out;
}
export const dirtyRecords = () => listRecords().filter((r) => dirty.has(rk(r.kind, r.id)));
export const dirtyCount = () => dirty.size;
export function clearDirty(keys) { keys.forEach((k) => dirty.delete(k)); persistDirty(); }
export function markAllDirty() {
  listRecords().forEach((r) => dirty.add(rk(r.kind, r.id)));
  persistDirty();
}
export const recordKey = rk;

/**
 * Aplica registros externos (nuvem ou importação) com "last write wins".
 * Os dados são re-saneados — nunca confiamos no que vem de fora.
 * Retorna quantos registros foram efetivamente aplicados.
 */
export function applyRecords(rows, { markDirty = false } = {}) {
  let applied = 0;
  const touched = [];
  for (const row of rows) {
    if (!row || typeof row.kind !== 'string') continue;
    const data = sanitizeRecordData(row.kind, row.data);
    if (!data) continue;

    if (row.kind === 'plan' || row.kind === 'settings') {
      const field = row.kind === 'plan' ? 'plan' : 'settings';
      if (data.updatedAt > state[field].updatedAt) {
        state[field] = data;
        applied++; touched.push(rk(row.kind, 'main'));
      }
    } else {
      const list = row.kind === 'session' ? state.sessions : state.customExercises;
      const i = list.findIndex((x) => x.id === data.id);
      if (i < 0) { list.push(data); applied++; touched.push(rk(row.kind, data.id)); }
      else if (data.updatedAt > list[i].updatedAt) { list[i] = data; applied++; touched.push(rk(row.kind, data.id)); }
    }
  }
  if (applied) commit(markDirty ? touched : [], markDirty ? 'local' : 'remote');
  return applied;
}

// ───────────── Backup: importar / apagar ─────────────

/** Guarda uma cópia de segurança interna antes de operações destrutivas. */
export function saveSafetyBackup() {
  return lsSet(SAFETY_KEY, JSON.stringify({ at: now(), state }));
}

/** Mescla um estado importado ao atual (o mais recente de cada registro prevalece). */
export function importMerge(clean) {
  saveSafetyBackup();
  const rows = [
    { kind: 'plan', data: clean.plan },
    { kind: 'settings', data: clean.settings },
    ...clean.customExercises.map((e) => ({ kind: 'exercise', data: e })),
    ...clean.sessions.map((s) => ({ kind: 'session', data: s })),
  ];
  return applyRecords(rows, { markDirty: true });
}

/**
 * Substitui os dados atuais pelo backup. Itens locais ausentes do backup viram
 * lápides (para que a exclusão também chegue à nuvem, quando houver sincronização).
 */
export function importReplace(clean) {
  saveSafetyBackup();
  const t = now();
  const keep = new Set(clean.sessions.map((s) => s.id));
  const keepEx = new Set(clean.customExercises.map((e) => e.id));
  const touched = [];

  for (const s of state.sessions) {
    if (!keep.has(s.id) && !s.deletedAt) { s.deletedAt = t; s.updatedAt = t; touched.push(rk('session', s.id)); }
  }
  for (const e of state.customExercises) {
    if (!keepEx.has(e.id) && !e.deletedAt) { e.deletedAt = t; e.updatedAt = t; touched.push(rk('exercise', e.id)); }
  }
  // Itens do backup recebem carimbo novo para prevalecerem sobre a nuvem.
  const stamp = (o) => { const c = { ...o, updatedAt: t }; delete c.deletedAt; return c; };
  const replaceIn = (list, items, kind) => {
    for (const it of items) {
      const c = stamp(it);
      const i = list.findIndex((x) => x.id === c.id);
      if (i >= 0) list[i] = c; else list.push(c);
      touched.push(rk(kind, c.id));
    }
  };
  replaceIn(state.sessions, clean.sessions, 'session');
  replaceIn(state.customExercises, clean.customExercises, 'exercise');
  state.plan = { ...clean.plan, updatedAt: t }; touched.push(rk('plan', 'main'));
  state.settings = { ...clean.settings, updatedAt: t }; touched.push(rk('settings', 'main'));
  commit(touched);
}

/** Apaga TODOS os dados do FORJA neste aparelho (inclui sessão de login e rascunho). */
export function wipeLocalData() {
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('forja:') || k.startsWith('forja-')).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignora */ }
  // Evita trazer de volta dados antigos logo depois da ação explícita de apagar tudo.
  lsSet(LEGACY_MIGRATION_KEY, 'done');
  state = newState();
  dirty = new Set();
  demo = { on: false, seed: 0, weeks: 12, createdAt: 0, sessions: [] };
}
