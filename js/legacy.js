/**
 * Conversão dos registros da versão monolítica do FORJA (v1.1.0).
 * Os dados de origem nunca são removidos; este módulo só traduz o formato.
 */
import { BASE_LIBRARY } from './data/library.js';
import { buildDefaultPlan } from './data/plan.js';
import { uid, isoDate } from './utils.js';

export const LEGACY_MIGRATION_KEY = 'forja:legacy-migrated:v1';
export const LEGACY_WORKOUTS_KEY = 'forja-workouts-v1';
export const LEGACY_SESSION_KEY = 'forja-active-session-v1';

const normalize = (value) => String(value ?? '')
  .normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ').trim();

const ALIASES = new Map([
  ['Puxada frontal', 'puxada-frente'],
  ['Puxada com pegada neutra', 'puxada-neutra'],
  ['Remada baixa', 'remada-baixa'],
  ['Peck deck', 'voador'],
  ['Rosca direta', 'rosca-direta-barra'],
  ['Tríceps na corda', 'triceps-corda'],
  ['Tríceps na barra', 'triceps-barra-polia'],
  ['Stiff com barra ou halteres', 'stiff-barra'],
  ['Cadeira flexora', 'cadeira-flexora'],
  ['Panturrilha em pé', 'panturrilha-maquina'],
  ['Pulldown com braços estendidos', 'pulldown-bracos-estendidos'],
].map(([name, id]) => [normalize(name), id]));

const GROUP_BY_LABEL = new Map([
  ['peito', 'peito'], ['costas', 'costas'], ['ombros', 'ombros'],
  ['biceps', 'biceps'], ['triceps', 'triceps'], ['pernas', 'quadriceps'],
  ['panturrilhas', 'panturrilha'],
]);

const EQUIPMENT_BY_LABEL = new Map([
  ['barra', 'barra'], ['barra ez', 'barra'], ['maquina', 'maquina'],
  ['polia', 'polia'], ['halteres', 'halter'], ['peso corporal', 'peso_corporal'],
]);

const asArray = (value) => Array.isArray(value) ? value : [];
const number = (value) => {
  const n = Number(String(value ?? '').trim().replace(',', '.'));
  return Number.isFinite(n) ? n : null;
};
const stamp = (value, fallback = Date.now()) => {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const parsed = Date.parse(String(value ?? ''));
  return Number.isFinite(parsed) ? parsed : fallback;
};
const dateOnly = (value, fallback = isoDate()) => {
  const date = String(value ?? '').slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`))
    ? date : fallback;
};
const safeId = (value, fallback) => /^[A-Za-z0-9_-]{1,64}$/.test(String(value ?? '')) ? String(value) : fallback;

function parsePrescription(value, fallbackSets = 3) {
  const text = String(value ?? '').trim();
  const withSets = text.match(/^(\d{1,2})\s*[×x]\s*(\d{1,3})(?:\s*[-–—]\s*(\d{1,3}))?$/i);
  const repsOnly = text.match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
  if (!withSets && !repsOnly) return { sets: fallbackSets, repMin: 8, repMax: 12 };
  const first = Number(withSets ? withSets[2] : repsOnly[1]);
  const second = Number((withSets ? withSets[3] : repsOnly[2]) || first);
  return {
    sets: Math.min(30, Math.max(1, Number(withSets?.[1]) || fallbackSets)),
    repMin: Math.min(first, second),
    repMax: Math.max(first, second),
  };
}

function planFor(planId, days) {
  return days.find((day) => day.id === planId) ?? null;
}

/** Retorna o exercício atual equivalente, ou cria um exercício local para não perder o histórico. */
function createResolver(customExercises) {
  const byName = new Map(BASE_LIBRARY.map((exercise) => [normalize(exercise.name), exercise]));
  const byId = new Map(BASE_LIBRARY.map((exercise) => [exercise.id, exercise]));
  const customById = new Map();

  return (rawName, oldEquipment = '', oldType = '', oldGroup = '') => {
    const name = String(rawName ?? '').trim().slice(0, 80) || 'Exercício';
    const key = normalize(name);
    const exercise = byName.get(key) ?? byId.get(ALIASES.get(key));
    if (exercise) return exercise;

    const idPart = key.replace(/\s+/g, '-').slice(0, 50) || 'exercicio';
    const id = `legado-${idPart}`;
    if (!customById.has(id)) {
      const group = GROUP_BY_LABEL.get(normalize(oldGroup)) ?? 'peito';
      const equipment = EQUIPMENT_BY_LABEL.get(normalize(oldEquipment)) ?? 'outro';
      const type = normalize(oldType) === 'composto' ? 'composto' : 'isolador';
      const custom = {
        id, name, group, portion: 'geral', equipment, type,
        step: equipment === 'peso_corporal' ? 0 : 2.5,
        how: '', custom: true, updatedAt: Date.now(),
      };
      customById.set(id, custom);
      customExercises.push(custom);
    }
    return customById.get(id);
  };
}

function plannedFor(day, exerciseId, exercise, source, setCount) {
  const item = day?.items.find((candidate) => candidate.exerciseId === exerciseId);
  if (item) return { sets: item.sets, repMin: item.repMin, repMax: item.repMax };
  return parsePrescription(source?.prescription ?? source?.reps, setCount || 3);
}

function convertCompletedSets(rawSets) {
  return asArray(rawSets).filter((set) => set?.done === true).flatMap((set) => {
    const weight = number(set.weight);
    const reps = number(set.reps);
    if (weight === null || weight < 0 || weight > 1000 || reps === null || reps < 1 || reps > 100) return [];
    return [{ weight, reps: Math.trunc(reps) }];
  });
}

function convertWorkout(workout, index, resolve, days) {
  if (!workout || typeof workout !== 'object') return null;
  const planId = String(workout.planId ?? workout.dayId ?? '');
  const day = planFor(planId, days);
  const items = [];
  for (const source of asArray(workout.exercises)) {
    if (!source || typeof source !== 'object') continue;
    const exercise = resolve(source.name, source.equipment, source.type, source.muscle);
    const sets = convertCompletedSets(source.sets);
    const planned = plannedFor(day, exercise.id, exercise, source, sets.length);
    items.push({
      exerciseId: exercise.id,
      name: exercise.name,
      group: exercise.group,
      note: String(source.note ?? ''),
      planned,
      sets,
    });
  }
  const savedAt = stamp(workout.savedAt ?? workout.updatedAt ?? workout.date);
  return {
    id: safeId(workout.id, `legado-${savedAt}-${index}`),
    date: dateOnly(workout.date, new Date(savedAt).toISOString().slice(0, 10)),
    dayId: day?.id ?? '',
    title: String(workout.title ?? day?.title ?? 'Treino'),
    startedAt: stamp(workout.startedAt, savedAt),
    endedAt: savedAt,
    note: String(workout.notes ?? workout.note ?? ''),
    items,
    updatedAt: savedAt,
  };
}

function convertActiveSession(raw, resolve, days) {
  if (!raw || typeof raw !== 'object') return null;
  const day = planFor(String(raw.planId ?? raw.dayId ?? ''), days);
  if (!day) return null;
  const items = asArray(raw.exercises).flatMap((source, index) => {
    if (!source || typeof source !== 'object') return [];
    const exercise = resolve(source.name, source.equipment, source.type, source.muscle);
    const planned = plannedFor(day, exercise.id, exercise, source, asArray(source.sets).length);
    const planItem = day.items.find((item) => item.exerciseId === exercise.id);
    return [{
      key: uid(), planItemId: planItem?.id ?? '', exerciseId: exercise.id,
      name: exercise.name, group: exercise.group, type: exercise.type,
      portion: exercise.portion, equipment: exercise.equipment, planned,
      planNote: '', note: String(source.note ?? ''), skipped: false, doneAt: 0,
      sets: asArray(source.sets).slice(0, 30).map((set) => ({
        weight: String(set?.weight ?? '').slice(0, 8),
        reps: String(set?.reps ?? '').slice(0, 4),
        done: set?.done === true,
      })),
      sort: index,
    }];
  }).map(({ sort, ...item }) => item);
  if (!items.length) return null;
  return {
    id: uid(), dayId: day.id, title: day.title,
    date: dateOnly(raw.date), startedAt: stamp(raw.startedAt),
    note: String(raw.notes ?? raw.note ?? ''), items,
  };
}

/** Converte sessões concluídas e uma sessão ativa da versão antiga. */
export function convertLegacySnapshot(workouts, activeSession) {
  const customExercises = [];
  const resolve = createResolver(customExercises);
  const days = buildDefaultPlan().days;
  const sessions = asArray(workouts).map((workout, index) => convertWorkout(workout, index, resolve, days)).filter(Boolean);
  const draft = convertActiveSession(activeSession, resolve, days);
  return { sessions, customExercises, draft };
}

/** Identifica o backup JSON exportado pela versão antiga do aplicativo. */
export function isLegacyBackup(raw) {
  return raw && typeof raw === 'object' && raw.app === 'FORJA'
    && Array.isArray(raw.workouts);
}

