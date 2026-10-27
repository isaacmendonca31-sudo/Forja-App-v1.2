/**
 * FORJA — Resumo de treino e recordes (funções puras, sem DOM).
 *
 * Usado na tela de conclusão e para avisar um recorde logo ao registrar a série.
 * Um "recorde" só existe quando já há histórico do exercício: o primeiro registro
 * é uma referência, não um recorde.
 */
import { estimate1RM } from './utils.js';

/** Totais de uma sessão (volume = carga × repetições). */
export function sessionStats(session) {
  let sets = 0;
  let volume = 0;
  for (const it of session.items ?? []) {
    for (const s of it.sets ?? []) {
      sets += 1;
      volume += s.weight * s.reps;
    }
  }
  const minutes = session.endedAt > session.startedAt
    ? Math.max(1, Math.round((session.endedAt - session.startedAt) / 60000)) : 0;
  return { sets, volume: Math.round(volume), minutes, exercises: (session.items ?? []).filter((i) => i.sets?.length).length };
}

export const bestOf = (sets) => ({
  topWeight: Math.max(0, ...sets.map((s) => s.weight)),
  e1rm: Math.max(0, ...sets.map((s) => estimate1RM(s.weight, s.reps))),
  bestReps: Math.max(0, ...sets.map((s) => s.reps)),
});

/** Junta duas marcas, mantendo a maior de cada métrica (a que for null é ignorada). */
export function mergeBest(a, b) {
  if (!a) return b ?? null;
  if (!b) return a;
  return { topWeight: Math.max(a.topWeight, b.topWeight), e1rm: Math.max(a.e1rm, b.e1rm), bestReps: Math.max(a.bestReps, b.bestReps) };
}

/** Melhores marcas anteriores de um exercício (ignora a sessão `exceptId`). */
export function previousBest(sessions, exerciseId, exceptId = '') {
  let best = null;
  for (const s of sessions) {
    if (s.id === exceptId || s.deletedAt) continue;
    for (const it of s.items ?? []) {
      if (it.exerciseId !== exerciseId || !it.sets?.length) continue;
      const b = bestOf(it.sets);
      best = best
        ? { topWeight: Math.max(best.topWeight, b.topWeight), e1rm: Math.max(best.e1rm, b.e1rm), bestReps: Math.max(best.bestReps, b.bestReps) }
        : b;
    }
  }
  return best;
}

/**
 * Compara uma marca com o melhor anterior.
 * Retorna 'carga' | '1rm' | 'reps' | null. Sem histórico → null.
 */
export function recordKind(prev, now) {
  if (!prev) return null;
  if (prev.topWeight > 0 || now.topWeight > 0) {
    if (now.topWeight > prev.topWeight) return 'carga';
    if (now.e1rm > prev.e1rm + 0.005) return '1rm';
    return null;
  }
  return now.bestReps > prev.bestReps ? 'reps' : null;
}

/** Recordes de uma sessão concluída em relação a todas as outras sessões. */
export function findRecords(session, allSessions) {
  const out = [];
  for (const it of session.items ?? []) {
    if (!it.sets?.length) continue;
    const prev = previousBest(allSessions, it.exerciseId, session.id);
    const kind = recordKind(prev, bestOf(it.sets));
    if (!kind) continue;
    const now = bestOf(it.sets);
    out.push({
      exerciseId: it.exerciseId, name: it.name, kind,
      value: kind === 'carga' ? now.topWeight : kind === '1rm' ? Math.round(now.e1rm * 10) / 10 : now.bestReps,
      previous: kind === 'carga' ? prev.topWeight : kind === '1rm' ? Math.round(prev.e1rm * 10) / 10 : prev.bestReps,
    });
  }
  return out;
}

/** Duração legível: "1 h 05 min" / "48 min". */
export function fmtDuration(minutes) {
  if (!minutes) return '—';
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}
