/**
 * FORJA — Motor de sugestões (funções puras, sem DOM e sem efeitos colaterais).
 *
 * IMPORTANTE (regra do produto): tudo aqui apenas PROPÕE. Nenhuma função
 * altera a ficha ou o treino; quem decide e aplica é sempre o usuário, na
 * interface, com confirmação.
 *
 * Por serem puras, estas funções são cobertas por testes automatizados
 * (tests/suggest.test.mjs).
 */
import { ANTAGONIST, GROUPS, EQUIPMENT } from './data/library.js';
import { estimate1RM } from './utils.js';

/** Quantidade de sessões sem melhora que caracteriza possível estagnação. */
export const STAGNATION_WINDOW = 3;

// ───────────── Histórico por exercício ─────────────

/**
 * Histórico cronológico (antigo → recente) de um exercício.
 * @param sessions sessões ativas (sem lápides)
 * @returns [{ date, sessionId, sets, topWeight, e1rm, bestReps, volume, score }]
 */
export function exerciseHistory(sessions, exerciseId) {
  const out = [];
  for (const s of sessions) {
    const item = s.items.find((i) => i.exerciseId === exerciseId && i.sets.length);
    if (!item) continue;
    const sets = item.sets;
    const topWeight = Math.max(...sets.map((x) => x.weight));
    const e1rm = Math.max(...sets.map((x) => estimate1RM(x.weight, x.reps)));
    const bestReps = Math.max(...sets.map((x) => x.reps));
    const volume = sets.reduce((acc, x) => acc + x.weight * x.reps, 0);
    out.push({
      date: s.date,
      startedAt: s.startedAt,
      sessionId: s.id,
      sets,
      topWeight,
      e1rm,
      bestReps,
      volume,
      // Exercícios sem carga (peso corporal) são comparados por repetições.
      score: e1rm > 0 ? e1rm : bestReps,
    });
  }
  return out.sort((a, b) => (a.date === b.date ? a.startedAt - b.startedAt : a.date < b.date ? -1 : 1));
}

// ───────────── Progressão de carga ─────────────

/**
 * Sugere aumento de carga quando TODAS as séries previstas foram feitas no
 * limite superior de repetições (critério da ficha).
 * @param planned { sets, repMin, repMax }
 * @param last    última entrada do histórico (ou null)
 * @param step    salto de carga em kg (0 = exercício sem carga externa)
 */
export function suggestProgression(planned, last, step) {
  if (!last) return null;
  const doneAll = last.sets.length >= planned.sets;
  const allAtTop = doneAll && last.sets.every((s) => s.reps >= planned.repMax);

  if (allAtTop) {
    if (step > 0 && last.topWeight > 0) {
      return {
        type: 'increase',
        from: last.topWeight,
        to: Math.round((last.topWeight + step) * 100) / 100,
        message: `Você completou ${planned.sets}×${planned.repMax} com ${last.topWeight} kg. Se a técnica estiver boa, tente ${Math.round((last.topWeight + step) * 100) / 100} kg.`,
      };
    }
    return {
      type: 'harder',
      message: 'Você atingiu o topo das repetições. Considere adicionar carga externa ou uma variação mais difícil.',
    };
  }
  if (doneAll && last.topWeight > 0) {
    return {
      type: 'maintain',
      from: last.topWeight,
      message: `Mantenha ${last.topWeight} kg e busque ${planned.repMax} repetições em todas as séries.`,
    };
  }
  return null;
}

// ───────────── Estagnação ─────────────

/**
 * Detecta possível estagnação: nas últimas `window` sessões nenhuma superou
 * (em mais de 1%) a sessão imediatamente anterior a essa janela.
 * Limitação conhecida: usa a melhor série (1RM estimado) — não considera volume.
 */
export function detectStagnation(history, window = STAGNATION_WINDOW) {
  if (history.length < window + 1) return { stagnated: false };
  const baseline = history[history.length - window - 1].score;
  const recent = history.slice(-window).map((h) => h.score);
  if (!(baseline > 0)) return { stagnated: false };
  const stagnated = Math.max(...recent) <= baseline * 1.01;
  return {
    stagnated,
    sessions: window,
    message: stagnated
      ? `Sem melhora nas últimas ${window} sessões. Vale revisar técnica, descanso e recuperação — ou testar uma variação.`
      : '',
  };
}

// ───────────── Alternativas (trocar exercício) ─────────────

/**
 * Ranqueia exercícios que trabalham o mesmo músculo.
 * Prioridade: mesma porção muscular > mesmo tipo (composto/isolador) >
 * equipamento disponível. Equipamentos marcados como indisponíveis são excluídos.
 *
 * @param target  { exerciseId, group, portion, type, equipment }
 * @param library todos os exercícios (base + personalizados ativos)
 * @param opts    { exclude:Set<id>, unavailable:Set<equip>, avoidSameEquipment:boolean, limit:number }
 * @returns [{ exercise, score, reasons[] }]
 */
export function rankAlternatives(target, library, opts = {}) {
  const exclude = opts.exclude ?? new Set();
  const unavailable = opts.unavailable ?? new Set();
  const limit = opts.limit ?? 8;

  return library
    .filter((e) => e.id !== target.exerciseId
      && !exclude.has(e.id)
      && e.group === target.group
      && !unavailable.has(e.equipment))
    .map((e) => {
      let score = 0;
      const reasons = [];
      if (e.portion && e.portion === target.portion) {
        score += 4;
        reasons.push(`Mesma porção (${e.portion})`);
      } else {
        reasons.push(`Mesmo grupo: ${GROUPS[e.group]}`);
      }
      if (e.type === target.type) score += 1;
      if (e.equipment !== target.equipment) {
        // Em "máquina ocupada", outro equipamento evita disputar o mesmo aparelho.
        score += opts.avoidSameEquipment ? 1.5 : 0.25;
        reasons.push(`Equipamento: ${EQUIPMENT[e.equipment] ?? e.equipment}`);
      }
      return { exercise: e, score, reasons };
    })
    .sort((a, b) => b.score - a.score || a.exercise.name.localeCompare(b.exercise.name, 'pt-BR'))
    .slice(0, limit);
}

// ───────────── "Máquina ocupada" ─────────────

/**
 * Sugere qual exercício fazer agora quando o aparelho do exercício atual está ocupado,
 * sem sobrecarregar o músculo e mantendo o ritmo do treino:
 *   +3  músculo diferente do último trabalhado (dá descanso a ele)
 *   +2  grupo antagonista do exercício ocupado (ex.: peito ↔ costas) — mantém o ritmo
 *   desempate: ordem original da ficha
 *
 * @param items    itens do treino em andamento (com group, skipped, sets[].done, doneAt)
 * @param busyIdx  índice do exercício cujo aparelho está ocupado
 * @returns { next: { index, item, reason } | null, lastGroup }
 */
export function suggestBusy(items, busyIdx) {
  const busy = items[busyIdx];
  const finished = (it) => it.skipped || (it.sets.length > 0 && it.sets.every((s) => s.done));

  // Último músculo trabalhado = exercício com série concluída mais recentemente.
  let lastGroup = null;
  let lastAt = 0;
  for (const it of items) {
    if (it.doneAt > lastAt) { lastAt = it.doneAt; lastGroup = it.group; }
  }

  const candidates = items
    .map((item, index) => ({ item, index }))
    .filter(({ item, index }) => index !== busyIdx && !finished(item));

  if (!candidates.length) return { next: null, lastGroup };

  const scored = candidates.map(({ item, index }) => {
    let score = -index * 0.01; // desempate: ordem da ficha
    const why = [];
    if (lastGroup && item.group !== lastGroup) {
      score += 3;
      why.push(`${GROUPS[lastGroup]} descansa (último músculo trabalhado)`);
    }
    if (ANTAGONIST[busy.group] === item.group) {
      score += 2;
      why.push(`alterna com ${GROUPS[item.group]}, mantendo o ritmo`);
    }
    return { index, item, score, reason: why.length ? why.join('; ') : 'Próximo exercício da ficha' };
  }).sort((a, b) => b.score - a.score);

  const best = scored[0];
  return { next: { index: best.index, item: best.item, reason: best.reason }, lastGroup };
}
