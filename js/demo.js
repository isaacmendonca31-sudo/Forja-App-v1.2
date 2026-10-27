/**
 * FORJA — Gerador de histórico SIMULADO (modo desenvolvedor).
 *
 * Função pura: recebe a ficha e devolve treinos fictícios dos últimos N semanas
 * para testar gráficos, recordes, estagnação e sugestões. Nada aqui toca o
 * armazenamento — quem guarda e isola esses dados é store.js (chave própria,
 * fora do backup e da sincronização).
 *
 * Modelo: dupla progressão. A pessoa simulada sobe as repetições semana a
 * semana até o topo da faixa; ao completar todas as séries no topo, a carga
 * sobe um degrau e as repetições voltam ao início. Há faltas ocasionais, uma
 * semana mais leve e um exercício que estagna nas últimas semanas.
 */
import { BASE_LIBRARY } from './data/library.js';

/** PRNG determinístico (mulberry32): mesma semente → mesmo histórico. */
export function makeRng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BASE_BY_ID = new Map(BASE_LIBRARY.map((e) => [e.id, e]));

/** Carga inicial plausível (kg) para um exercício, conforme tipo, equipamento e grupo. */
export function startingLoad(ex) {
  if (!ex || !(ex.step > 0)) return 0;
  const compound = { barra: 50, smith: 40, maquina: 55, halter: 20, polia: 35 };
  const isolation = { barra: 25, smith: 20, maquina: 25, halter: 10, polia: 20 };
  let load = (ex.type === 'composto' ? compound : isolation)[ex.equipment] ?? 20;
  if (['quadriceps', 'posterior', 'gluteos'].includes(ex.group)) load *= 1.6;
  if (ex.group === 'panturrilha') load *= 1.5;
  if (ex.group === 'ombros' && ex.type === 'isolador') load *= 0.5;
  if (['biceps', 'triceps'].includes(ex.group) && ex.type === 'isolador') load *= 0.6;
  return load;
}

const roundTo = (n, step) => Math.max(0, Math.round(n / step) * step);
const pad2 = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

/**
 * @param {object} opts
 * @param {object} opts.plan        ficha atual ({ days:[{ id, weekday, title, items:[…] }] })
 * @param {number} [opts.weeks=12]  quantas semanas para trás (1–52)
 * @param {number} [opts.seed]      semente (padrão: aleatória)
 * @param {Date}   [opts.today]     "hoje" (para testes); só gera datas ANTERIORES a hoje
 * @param {(id:string)=>object|null} [opts.getExercise] busca de exercício (inclui personalizados)
 * @returns {{ seed:number, sessions:object[] }} sessões no formato aceito por sanitizeSession
 */
export function generateDemoSessions({
  plan, weeks = 12, seed = Math.floor(Math.random() * 2 ** 31), today = new Date(), getExercise = (id) => BASE_BY_ID.get(id) ?? null,
} = {}) {
  const rnd = makeRng(seed);
  const nWeeks = Math.min(52, Math.max(1, Math.trunc(weeks)));
  const t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const monday = new Date(t0);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  // Exercício que "estagna" nas últimas semanas (para exercitar o alerta de estagnação).
  const planItems = plan.days.flatMap((d) => d.items);
  const appearances = new Map();
  planItems.forEach((i) => appearances.set(i.exerciseId, (appearances.get(i.exerciseId) ?? 0) + 1));
  let compounds = [...appearances.keys()]
    .filter((id) => getExercise(id)?.type === 'composto' && getExercise(id)?.step > 0);
  if (compounds.some((id) => appearances.get(id) > 1)) compounds = compounds.filter((id) => appearances.get(id) > 1); // treinado 2×/semana
  const plateauId = compounds.length ? compounds[Math.floor(rnd() * compounds.length)] : null;
  const plateauFrom = Math.min(3, nWeeks - 1); // semanas atrás em que a estagnação começa

  const state = new Map(); // exerciseId → { weight, target }
  const sessions = [];
  const tag = seed.toString(36).slice(0, 6);

  for (let w = nWeeks - 1; w >= 0; w--) {
    const deload = nWeeks > 6 && w === 3; // uma semana mais leve
    for (const day of plan.days) {
      const date = new Date(monday);
      date.setDate(date.getDate() - 7 * w + ((day.weekday + 6) % 7));
      if (date >= t0) continue; // nunca gera hoje nem o futuro
      if (rnd() < 0.14) continue; // dia faltado

      const items = [];
      for (const pi of day.items) {
        if (rnd() < 0.04) continue; // exercício pulado
        const ex = getExercise(pi.exerciseId);
        if (!ex) continue;
        const step = ex.step > 0 ? ex.step : 0;
        let st = state.get(pi.exerciseId);
        if (!st) {
          st = { weight: roundTo(startingLoad(ex) * (0.8 + rnd() * 0.15), step || 1), target: pi.repMin + Math.floor(rnd() * 2) };
          state.set(pi.exerciseId, st);
        }
        const plateau = pi.exerciseId === plateauId && w < plateauFrom;
        const load = step ? roundTo(st.weight * (deload ? 0.9 : 1), step) : 0;
        const nSets = Math.max(1, pi.sets - (rnd() < 0.08 ? 1 : 0));
        let sets = [];
        // Estagnação: repete exatamente a última sessão real (mesma carga e repetições).
        if (plateau && st.last) sets = st.last.map((x) => ({ ...x }));
        else for (let j = 0; j < nSets; j++) {
          let reps = st.target - (j >= 2 && rnd() < 0.4 ? 1 : 0) - (rnd() < 0.12 ? 1 : 0);
          if (plateau) reps -= rnd() < 0.5 ? 1 : 0;
          sets.push({ weight: load, reps: Math.min(pi.repMax, Math.max(1, reps)) });
        }
        if (!plateau) st.last = sets.map((x) => ({ ...x }));
        items.push({
          exerciseId: pi.exerciseId, name: ex.name, group: ex.group, note: '',
          planned: { sets: pi.sets, repMin: pi.repMin, repMax: pi.repMax }, sets,
        });

        if (!plateau && !deload) {
          // Dupla progressão: primeira série no topo e as demais a no máximo 1 rep dele → sobe a carga.
          const atTop = sets[0].reps >= pi.repMax && sets.every((s) => s.reps >= pi.repMax - 1);
          if (atTop) {
            if (step) { st.weight += step; st.target = Math.max(pi.repMin, pi.repMax - 2); } else st.target = pi.repMax;
          } else if (rnd() < 0.7) st.target = Math.min(pi.repMax, st.target + 1);
        }
      }
      if (!items.length) continue;

      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 17 + Math.floor(rnd() * 3), Math.floor(rnd() * 60));
      const startedAt = start.getTime();
      sessions.push({
        id: `demo-${tag}-${sessions.length.toString(36).padStart(3, '0')}`,
        date: isoOf(date), dayId: day.id, title: day.title,
        startedAt, endedAt: startedAt + (40 + Math.floor(rnd() * 40)) * 60000,
        note: '', items, updatedAt: startedAt,
      });
    }
  }
  return { seed, sessions };
}
