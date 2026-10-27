/**
 * FORJA — Validação e saneamento de dados (lista de permissão / "allow-list").
 *
 * Princípio: NENHUM dado externo é confiável — backups importados, dados
 * vindos da nuvem, e até o que já está no localStorage (pode ter sido
 * adulterado ou corrompido). Tudo passa por estas funções, que:
 *   • aceitam apenas campos conhecidos (não copiam objetos "no cego" →
 *     evita poluição de protótipo);
 *   • limitam tipos, tamanhos e intervalos;
 *   • retornam objetos NOVOS e limpos.
 */
import { GROUPS, EQUIPMENT, TYPES } from './data/library.js';

export const LIMITS = Object.freeze({
  maxSessions: 20000,
  maxCustomExercises: 500,
  maxDays: 7,
  maxItemsPerDay: 30,
  maxItemsPerSession: 40,
  maxSetsPerItem: 30,
  maxBackupBytes: 5 * 1024 * 1024, // 5 MB
  name: 80,
  note: 500,
  how: 600,
});

export const FORMAT_VERSION = 1;

const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
const isObj = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const asArray = (v) => (Array.isArray(v) ? v : []);

/** Texto limpo: sem caracteres de controle, normalizado (NFC) e truncado. */
export function cleanText(v, max, { multiline = false } = {}) {
  if (typeof v !== 'string') return '';
  // eslint-disable-next-line no-control-regex
  const re = multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g;
  return v.normalize('NFC').replace(re, '').trim().slice(0, max);
}

/** id seguro: letras, números, hífen e sublinhado (até 64 chars). */
export const isId = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v);

export const isISODate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00Z`));

/** Número finito dentro de [min,max] arredondado a `dec` casas; ou null. */
export function num(v, min, max, dec = 2) {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isFinite(n) || n < min || n > max) return null;
  const f = 10 ** dec;
  return Math.round(n * f) / f;
}

const intIn = (v, min, max) => {
  const n = num(v, min, max, 0);
  return n === null ? null : Math.trunc(n);
};

const timestamp = (v) => intIn(v, 0, 4102444800000) ?? 0; // até o ano 2100

// ───────────── Exercício personalizado ─────────────
export function sanitizeExercise(raw) {
  if (!isObj(raw) || !isId(raw.id)) return null;
  const name = cleanText(raw.name, LIMITS.name);
  if (!name || !has(GROUPS, raw.group)) return null;
  const out = {
    id: raw.id,
    name,
    group: raw.group,
    portion: cleanText(raw.portion, 40) || 'geral',
    equipment: has(EQUIPMENT, raw.equipment) ? raw.equipment : 'outro',
    type: has(TYPES, raw.type) ? raw.type : 'isolador',
    step: num(raw.step, 0, 50) ?? 2.5,
    how: cleanText(raw.how, LIMITS.how, { multiline: true }),
    custom: true,
    updatedAt: timestamp(raw.updatedAt),
  };
  const d = timestamp(raw.deletedAt);
  if (d) out.deletedAt = d;
  return out;
}

// ───────────── Ficha ─────────────
export function sanitizePlan(raw) {
  if (!isObj(raw)) return null;
  const days = [];
  for (const d of asArray(raw.days).slice(0, LIMITS.maxDays)) {
    if (!isObj(d) || !isId(d.id)) continue;
    const items = [];
    for (const it of asArray(d.items).slice(0, LIMITS.maxItemsPerDay)) {
      if (!isObj(it) || !isId(it.id) || !isId(it.exerciseId)) continue;
      const sets = intIn(it.sets, 1, LIMITS.maxSetsPerItem);
      const repMin = intIn(it.repMin, 1, 100);
      const repMax = intIn(it.repMax, 1, 100);
      if (sets === null || repMin === null || repMax === null || repMin > repMax) continue;
      items.push({
        id: it.id, exerciseId: it.exerciseId, sets, repMin, repMax,
        note: cleanText(it.note, 120),
      });
    }
    days.push({
      id: d.id,
      weekday: intIn(d.weekday, 0, 6) ?? 1,
      name: cleanText(d.name, 30) || 'Dia',
      title: cleanText(d.title, LIMITS.name) || 'Treino',
      items,
    });
  }
  if (!days.length) return null;
  return { days, updatedAt: timestamp(raw.updatedAt) };
}

// ───────────── Configurações ─────────────
export const DEFAULT_SETTINGS = Object.freeze({
  restCompound: 150,
  restIsolation: 90,
  keepAwake: true,
  vibrate: true,
  sound: false,
  unavailableEquipment: [],
  updatedAt: 0,
});

export function sanitizeSettings(raw) {
  const r = isObj(raw) ? raw : {};
  return {
    restCompound: intIn(r.restCompound, 15, 900) ?? DEFAULT_SETTINGS.restCompound,
    restIsolation: intIn(r.restIsolation, 15, 900) ?? DEFAULT_SETTINGS.restIsolation,
    keepAwake: typeof r.keepAwake === 'boolean' ? r.keepAwake : DEFAULT_SETTINGS.keepAwake,
    vibrate: typeof r.vibrate === 'boolean' ? r.vibrate : DEFAULT_SETTINGS.vibrate,
    sound: typeof r.sound === 'boolean' ? r.sound : DEFAULT_SETTINGS.sound,
    unavailableEquipment: [...new Set(asArray(r.unavailableEquipment).filter((k) => typeof k === 'string' && has(EQUIPMENT, k)))],
    updatedAt: timestamp(r.updatedAt),
  };
}

// ───────────── Sessão (treino concluído) ─────────────
export function sanitizeSession(raw) {
  if (!isObj(raw) || !isId(raw.id) || !isISODate(raw.date)) return null;
  const items = [];
  for (const it of asArray(raw.items).slice(0, LIMITS.maxItemsPerSession)) {
    if (!isObj(it) || !isId(it.exerciseId)) continue;
    const sets = [];
    for (const s of asArray(it.sets).slice(0, LIMITS.maxSetsPerItem)) {
      if (!isObj(s)) continue;
      const weight = num(s.weight, 0, 1000);
      const reps = intIn(s.reps, 1, 100);
      if (weight !== null && reps !== null) sets.push({ weight, reps });
    }
    const p = isObj(it.planned) ? it.planned : {};
    items.push({
      exerciseId: it.exerciseId,
      name: cleanText(it.name, LIMITS.name) || 'Exercício',
      group: has(GROUPS, it.group) ? it.group : 'peito',
      note: cleanText(it.note, LIMITS.note, { multiline: true }),
      planned: {
        sets: intIn(p.sets, 1, LIMITS.maxSetsPerItem) ?? sets.length,
        repMin: intIn(p.repMin, 1, 100) ?? 1,
        repMax: intIn(p.repMax, 1, 100) ?? 100,
      },
      sets,
    });
  }
  const out = {
    id: raw.id,
    date: raw.date,
    dayId: isId(raw.dayId) ? raw.dayId : '',
    title: cleanText(raw.title, LIMITS.name) || 'Treino',
    startedAt: timestamp(raw.startedAt),
    endedAt: timestamp(raw.endedAt),
    note: cleanText(raw.note, LIMITS.note, { multiline: true }),
    items,
    updatedAt: timestamp(raw.updatedAt),
  };
  const d = timestamp(raw.deletedAt);
  if (d) out.deletedAt = d;
  return out;
}

/** Saneia um registro de sincronização conforme o tipo. Retorna null se inválido. */
export function sanitizeRecordData(kind, data) {
  switch (kind) {
    case 'plan': return sanitizePlan(data);
    case 'settings': return sanitizeSettings(data);
    case 'exercise': return sanitizeExercise(data);
    case 'session': return sanitizeSession(data);
    default: return null;
  }
}

// ───────────── Estado completo / backup ─────────────

/**
 * Valida e normaliza um estado completo (do localStorage ou de backup).
 * Itens inválidos são descartados individualmente; retorna contagem de descartes.
 */
export function sanitizeState(raw, defaultPlanFactory) {
  if (!isObj(raw)) throw new Error('Arquivo inválido.');
  let dropped = 0;

  const plan = sanitizePlan(raw.plan) ?? defaultPlanFactory();

  const customExercises = [];
  for (const e of asArray(raw.customExercises).slice(0, LIMITS.maxCustomExercises)) {
    const c = sanitizeExercise(e);
    if (c) customExercises.push(c); else dropped++;
  }

  const sessions = [];
  const seen = new Set();
  for (const s of asArray(raw.sessions).slice(0, LIMITS.maxSessions)) {
    const c = sanitizeSession(s);
    if (c && !seen.has(c.id)) { seen.add(c.id); sessions.push(c); } else dropped++;
  }

  return {
    state: {
      schemaVersion: FORMAT_VERSION,
      plan,
      customExercises,
      sessions,
      settings: sanitizeSettings(raw.settings),
    },
    dropped,
  };
}

/** Valida o envelope de um arquivo de backup (já descriptografado). */
export function validateBackup(raw, defaultPlanFactory) {
  if (!isObj(raw) || raw.app !== 'forja') throw new Error('Este arquivo não é um backup do FORJA.');
  if (!Number.isInteger(raw.format) || raw.format > FORMAT_VERSION) {
    throw new Error('Backup criado por uma versão mais nova do app. Atualize o FORJA e tente novamente.');
  }
  return sanitizeState(raw.data, defaultPlanFactory);
}

// ───────────── Rascunho do treino em andamento ─────────────
export function sanitizeDraft(raw) {
  if (!isObj(raw) || !isId(raw.id) || !isId(raw.dayId) || !isISODate(raw.date)) return null;
  const items = [];
  for (const it of asArray(raw.items).slice(0, LIMITS.maxItemsPerSession)) {
    if (!isObj(it) || !isId(it.key) || !isId(it.exerciseId)) continue;
    const p = isObj(it.planned) ? it.planned : {};
    const sets = asArray(it.sets).slice(0, LIMITS.maxSetsPerItem).map((s) => ({
      weight: cleanText(String(s?.weight ?? ''), 8),
      reps: cleanText(String(s?.reps ?? ''), 4),
      done: s?.done === true,
    }));
    items.push({
      key: it.key,
      planItemId: isId(it.planItemId) ? it.planItemId : '',
      exerciseId: it.exerciseId,
      name: cleanText(it.name, LIMITS.name) || 'Exercício',
      group: has(GROUPS, it.group) ? it.group : 'peito',
      type: has(TYPES, it.type) ? it.type : 'isolador',
      portion: cleanText(it.portion, 40),
      equipment: has(EQUIPMENT, it.equipment) ? it.equipment : 'outro',
      planned: {
        sets: intIn(p.sets, 1, LIMITS.maxSetsPerItem) ?? sets.length,
        repMin: intIn(p.repMin, 1, 100) ?? 1,
        repMax: intIn(p.repMax, 1, 100) ?? 100,
      },
      planNote: cleanText(it.planNote, 120),
      note: cleanText(it.note, LIMITS.note, { multiline: true }),
      skipped: it.skipped === true,
      doneAt: timestamp(it.doneAt),
      sets,
    });
  }
  if (!items.length) return null;
  return {
    id: raw.id,
    dayId: raw.dayId,
    title: cleanText(raw.title, LIMITS.name) || 'Treino',
    date: raw.date,
    startedAt: timestamp(raw.startedAt),
    note: cleanText(raw.note, LIMITS.note, { multiline: true }),
    items,
  };
}
