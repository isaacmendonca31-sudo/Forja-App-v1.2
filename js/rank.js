/**
 * FORJA — Sistema de ranks por exercício e por treino (funções puras, sem DOM).
 *
 * Ranks: C (amarelo) < B (azul) < A (verde) < S (roxo) < SSS (arco-íris).
 *
 * Princípios:
 *  • Cada exercício é comparado COM O PRÓPRIO HISTÓRICO (nunca com outras pessoas).
 *  • Manter o desempenho já é uma boa nota (A). Subir carga ou repetições vale mais (S);
 *    SSS é reservado a evolução expressiva sobre a melhor marca.
 *  • Nada é punitivo: o pior resultado é C, e a primeira vez que um exercício aparece
 *    recebe B (é uma referência, não um teste). Semana leve ou dia ruim não "quebram" nada.
 *  • O rank é só informação: não altera a ficha nem sugere aumento de carga.
 *  • É calculado na hora a partir do histórico — nada novo é gravado no aparelho.
 */
import { exerciseHistory } from './suggest.js';
import { estimate1RM } from './utils.js';

export const RANKS = Object.freeze(['C', 'B', 'A', 'S', 'SSS']);
export const RANK_VALUE = Object.freeze({ C: 1, B: 2, A: 3, S: 4, SSS: 5 });
export const RANK_NAME = Object.freeze({
  C: 'amarelo', B: 'azul', A: 'verde', S: 'roxo', SSS: 'arco-íris',
});

/** Limiares (frações). Ficam aqui, juntos, para ajustar o "peso" do sistema com facilidade. */
export const THRESHOLDS = Object.freeze({
  sssOverBest: 0.08,    // ≥ +8% sobre a melhor marca anterior → SSS (um degrau de 2,5 kg num supino de 40 kg é ~+6%: vale S)
  sssOverLast: 0.1,     // ≥ +10% sobre o último treino, estando ≥ +3% acima da melhor marca → SSS
  sOverBest: 0.005,     // bateu a melhor marca → S
  sOverLast: 0.025,     // ≥ +2,5% sobre o último treino → S
  keep: -0.02,          // até −2% ainda é "manteve" → A
  slightlyBelow: -0.08, // até −8% → B; abaixo disso → C
  minSetsShare: 0.6,    // com menos de 60% das séries previstas, a nota não passa de A
});

const clampRank = (v) => RANKS[Math.min(5, Math.max(1, Math.round(v))) - 1];

/** Pontuação de um conjunto de séries: 1RM estimado ou, sem carga, melhor repetição. */
export function scoreOfSets(sets) {
  const e1 = Math.max(0, ...sets.map((s) => estimate1RM(s.weight, s.reps)));
  return e1 > 0 ? e1 : Math.max(0, ...sets.map((s) => s.reps));
}

/**
 * Nota de UM exercício num treino.
 * @param item           { exerciseId, sets:[{weight,reps}], planned?:{sets} } (só séries concluídas)
 * @param priorSessions  sessões ANTERIORES a este treino (ativas, sem lápides)
 * @returns {{ rank, reason, delta, first }|null}  null se não houver séries
 */
export function gradeExercise(item, priorSessions) {
  const sets = (item.sets ?? []).filter((s) => s.weight >= 0 && s.reps > 0);
  if (!sets.length) return null;
  const hist = exerciseHistory(priorSessions, item.exerciseId);
  if (!hist.length) {
    return { rank: 'B', reason: 'Primeira referência deste exercício.', delta: null, first: true };
  }
  const T = THRESHOLDS;
  const now = scoreOfSets(sets);
  const last = hist.at(-1).score;
  const best = Math.max(...hist.map((x) => x.score));
  const delta = last > 0 ? now / last - 1 : 0;
  const vsBest = best > 0 ? now / best - 1 : 0;

  let rank;
  let reason;
  if (vsBest >= T.sssOverBest || (delta >= T.sssOverLast && vsBest >= 0.03)) {
    rank = 'SSS'; reason = 'Evolução expressiva sobre a sua melhor marca.';
  } else if (vsBest > T.sOverBest) {
    rank = 'S'; reason = 'Nova melhor marca neste exercício.';
  } else if (delta >= T.sOverLast && vsBest >= -0.02) {
    rank = 'S'; reason = 'Evolução clara sobre o último treino.';
  } else if (delta >= T.keep) {
    rank = 'A'; reason = delta > 0.005 ? 'Pequena evolução sobre o último treino.' : 'Desempenho mantido — boa consistência.';
  } else if (delta >= T.slightlyBelow) {
    rank = 'B'; reason = 'Um pouco abaixo do último treino. Acontece.';
  } else {
    rank = 'C'; reason = 'Abaixo do último treino. Sono, fadiga ou semana leve influenciam; siga o plano.';
  }

  const planned = item.planned?.sets || sets.length;
  if (sets.length < Math.ceil(planned * T.minSetsShare) && RANK_VALUE[rank] > RANK_VALUE.A) {
    rank = 'A'; reason = 'Boa marca, mas com poucas séries para pontuar mais alto.';
  }
  return { rank, reason, delta, first: false };
}

/** Sessões que aconteceram ANTES de `session` (por data e horário), sem excluídas. */
export function priorSessionsOf(session, allSessions) {
  return allSessions.filter((s) => s.id !== session.id && !s.deletedAt
    && (s.date < session.date || (s.date === session.date && (s.startedAt ?? 0) < (session.startedAt ?? 0))));
}

/**
 * Combina as notas dos exercícios no rank do treino.
 *  • Muitas notas altas elevam o resultado: S ou melhor em ≥ N exercícios → SSS;
 *    A ou melhor em ≥ N → S, com N = max(3, 40% dos exercícios).
 *  • Sem atingir essas quantidades, vale a média ponderada (mais séries e exercícios
 *    compostos pesam mais). O resultado nunca fica abaixo da média.
 * @param grades  [{ rank, sets?:number, compound?:boolean }]
 */
export function gradeSession(grades) {
  const g = grades.filter((x) => x && RANK_VALUE[x.rank]);
  if (!g.length) return null;
  const need = Math.max(3, Math.ceil(g.length * 0.4));
  const atLeast = (r) => g.filter((x) => RANK_VALUE[x.rank] >= RANK_VALUE[r]).length;

  let totalW = 0;
  let sum = 0;
  for (const x of g) {
    const w = Math.min(5, Math.max(1, x.sets ?? 1)) * (x.compound ? 1.5 : 1);
    totalW += w; sum += RANK_VALUE[x.rank] * w;
  }
  const average = sum / totalW;
  let byCount = 1;
  if (atLeast('S') >= need) byCount = 5;
  else if (atLeast('A') >= need) byCount = 4;

  const value = Math.max(byCount, Math.round(average));
  return {
    rank: clampRank(value), average: Math.round(average * 100) / 100, via: byCount >= Math.round(average) && byCount > 1 ? 'quantidade' : 'média',
    counts: Object.fromEntries(RANKS.map((r) => [r, g.filter((x) => x.rank === r).length])), need, n: g.length,
  };
}

/**
 * Ranks de um treino já salvo (ou recém-concluído).
 * @param session      sessão { items:[{ exerciseId, name, sets, planned }] }
 * @param allSessions  todas as sessões ativas (a própria é ignorada no histórico)
 * @param isCompound   (exerciseId) => boolean, opcional
 */
export function rankSession(session, allSessions, isCompound = () => false) {
  const prior = priorSessionsOf(session, allSessions);
  const items = [];
  for (const it of session.items ?? []) {
    const grade = gradeExercise(it, prior);
    if (grade) items.push({ exerciseId: it.exerciseId, name: it.name, grade, sets: it.sets.length, compound: isCompound(it.exerciseId) });
  }
  const overall = gradeSession(items.map((x) => ({ rank: x.grade.rank, sets: x.sets, compound: x.compound })));
  return { overall, items };
}
