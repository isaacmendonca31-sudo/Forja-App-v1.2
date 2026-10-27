/** Indicadores locais do diário. Os cálculos usam apenas sessões concluídas. */
import { GROUPS } from './data/library.js';
import { isoDate, parseISODate, weekStartISO } from './utils.js';

const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ''))
  && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const shiftDate = (days) => {
  const date = parseISODate(isoDate());
  date.setDate(date.getDate() + days);
  return isoDate(date);
};

function weekDates() {
  const today = parseISODate(isoDate());
  const monday = parseISODate(weekStartISO(today));
  return Array.from({ length: 8 }, (_, index) => {
    const start = new Date(monday);
    start.setDate(start.getDate() - (7 * (7 - index)));
    return { start, label: start.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) };
  });
}

function collect(sessions) {
  const exercises = new Map();
  const muscles = new Map();
  let sets = 0;
  let volume = 0;

  for (const session of sessions) {
    for (const item of session.items ?? []) {
      const group = item.group || 'peito';
      let exercise = exercises.get(item.exerciseId);
      if (!exercise) {
        exercise = { id: item.exerciseId, name: item.name || 'Exercício', volume: 0, sets: 0, bestWeight: 0 };
        exercises.set(item.exerciseId, exercise);
      }
      let muscle = muscles.get(group);
      if (!muscle) {
        muscle = { id: group, name: GROUPS[group] ?? 'Outros', volume: 0, sets: 0 };
        muscles.set(group, muscle);
      }
      for (const set of item.sets ?? []) {
        sets += 1;
        exercise.sets += 1;
        muscle.sets += 1;
        const weight = Number(set.weight) || 0;
        const reps = Number(set.reps) || 0;
        const load = weight > 0 && reps > 0 ? weight * reps : 0;
        volume += load;
        exercise.volume += load;
        muscle.volume += load;
        exercise.bestWeight = Math.max(exercise.bestWeight, weight);
      }
    }
  }
  return { sets, volume, exercises: [...exercises.values()], muscles: [...muscles.values()] };
}

/**
 * Retorna os dados para o resumo interativo. `days` aceita 30, 90 ou null
 * (todo o período); o gráfico semanal sempre exibe as oito semanas recentes.
 */
export function buildTrainingInsights(allSessions, days = 30) {
  const today = isoDate();
  const all = (allSessions ?? []).filter((s) => validDate(s.date) && s.date <= today);
  const first = all.map((s) => s.date).sort()[0] ?? today;
  let from = first;
  if (days) {
    const start = parseISODate(today);
    start.setDate(start.getDate() - days + 1);
    from = isoDate(start);
  }
  const filtered = all.filter((s) => s.date >= from);
  const totals = collect(filtered);
  const allTime = collect(all);
  const weekly = weekDates().map(({ start, label }) => {
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const startISO = isoDate(start);
    const endISO = isoDate(end);
    const inRange = filtered.filter((s) => s.date >= startISO && s.date < endISO);
    const stats = collect(inRange);
    return { label, sessions: inRange.length, volume: Math.round(stats.volume), sets: stats.sets };
  });
  const recentStart = shiftDate(-6);
  const previousStart = shiftDate(-13);
  const recent = all.filter((s) => s.date >= recentStart);
  const recentCount = new Set(recent.map((s) => s.date)).size;
  const previousCount = new Set(all.filter((s) => s.date >= previousStart && s.date < recentStart).map((s) => s.date)).size;
  const recentVolume = collect(all.filter((s) => s.date >= recentStart)).volume;
  const previousVolume = collect(all.filter((s) => s.date >= previousStart && s.date < recentStart)).volume;
  const volumeChange = previousVolume > 0 ? ((recentVolume - previousVolume) / previousVolume) * 100 : null;
  const topExercises = totals.exercises.sort((a, b) => b.volume - a.volume || b.sets - a.sets).slice(0, 5);
  const topMuscles = totals.muscles.sort((a, b) => b.sets - a.sets || b.volume - a.volume).slice(0, 5);
  const records = allTime.exercises.filter((e) => e.bestWeight > 0).sort((a, b) => b.bestWeight - a.bestWeight).slice(0, 3);
  const thisWeek = all.filter((s) => s.date >= weekStartISO() && s.date <= today);

  return {
    from, to: today, days, sessions: filtered.length, trainingDays: new Set(filtered.map((s) => s.date)).size,
    sets: totals.sets, volume: Math.round(totals.volume), averageVolume: filtered.length ? Math.round(totals.volume / filtered.length) : 0,
    weekly, topExercises, topMuscles, records, recentCount, previousCount, volumeChange,
    weekSessions: thisWeek.length,
  };
}

