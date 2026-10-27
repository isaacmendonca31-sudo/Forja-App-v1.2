// Testes do motor de sugestões e da validação. Execute: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  exerciseHistory, suggestProgression, detectStagnation, rankAlternatives, suggestBusy,
} from '../js/suggest.js';
import { BASE_LIBRARY } from '../js/data/library.js';

const session = (date, exerciseId, sets, startedAt = 0) => ({
  id: `s-${date}-${exerciseId}`, date, startedAt, items: [{ exerciseId, sets }],
});
const sets = (w, ...reps) => reps.map((r) => ({ weight: w, reps: r }));

test('histórico é cronológico e calcula carga máxima e volume', () => {
  const h = exerciseHistory([
    session('2026-10-10', 'x', sets(40, 10, 9)),
    session('2026-10-03', 'x', sets(37.5, 10, 10)),
  ], 'x');
  assert.deepEqual(h.map((e) => e.date), ['2026-10-03', '2026-10-10']);
  assert.equal(h[1].topWeight, 40);
  assert.equal(h[1].volume, 40 * 10 + 40 * 9);
});

test('sugere aumento quando todas as séries atingem o topo das repetições', () => {
  const last = exerciseHistory([session('2026-10-10', 'x', sets(40, 12, 12, 12))], 'x')[0];
  const r = suggestProgression({ sets: 3, repMin: 8, repMax: 12 }, last, 2.5);
  assert.equal(r.type, 'increase');
  assert.equal(r.to, 42.5);
});

test('não sugere aumento se alguma série ficou abaixo do topo', () => {
  const last = exerciseHistory([session('2026-10-10', 'x', sets(40, 12, 11, 12))], 'x')[0];
  assert.equal(suggestProgression({ sets: 3, repMin: 8, repMax: 12 }, last, 2.5).type, 'maintain');
});

test('não sugere aumento se faltaram séries', () => {
  const last = exerciseHistory([session('2026-10-10', 'x', sets(40, 12, 12))], 'x')[0];
  assert.equal(suggestProgression({ sets: 3, repMin: 8, repMax: 12 }, last, 2.5), null);
});

test('exercício sem carga externa (step 0) não recebe aumento em kg', () => {
  const last = exerciseHistory([session('2026-10-10', 'x', sets(0, 12, 12, 12))], 'x')[0];
  assert.equal(suggestProgression({ sets: 3, repMin: 8, repMax: 12 }, last, 0).type, 'harder');
});

test('detecta estagnação após 3 sessões sem melhora', () => {
  const mk = (d, w, r) => session(d, 'x', sets(w, r, r));
  const h = exerciseHistory([
    mk('2026-09-01', 40, 10), mk('2026-09-08', 40, 10), mk('2026-09-15', 40, 10), mk('2026-09-22', 40, 10),
  ], 'x');
  assert.equal(detectStagnation(h).stagnated, true);
});

test('não detecta estagnação quando há progresso', () => {
  const mk = (d, w, r) => session(d, 'x', sets(w, r, r));
  const h = exerciseHistory([
    mk('2026-09-01', 40, 10), mk('2026-09-08', 40, 10), mk('2026-09-15', 42.5, 10), mk('2026-09-22', 42.5, 11),
  ], 'x');
  assert.equal(detectStagnation(h).stagnated, false);
});

test('histórico curto não é considerado estagnação', () => {
  const h = exerciseHistory([session('2026-09-01', 'x', sets(40, 10)), session('2026-09-08', 'x', sets(40, 10))], 'x');
  assert.equal(detectStagnation(h).stagnated, false);
});

test('alternativas: mesma porção primeiro e respeita equipamento indisponível', () => {
  const target = { exerciseId: 'supino-inclinado-barra', group: 'peito', portion: 'superior', type: 'composto', equipment: 'barra' };
  const alts = rankAlternatives(target, BASE_LIBRARY, { unavailable: new Set(['halter']) });
  assert.ok(alts.length > 0);
  assert.equal(alts[0].exercise.portion, 'superior');
  assert.ok(alts.every((a) => a.exercise.equipment !== 'halter'));
  assert.ok(alts.every((a) => a.exercise.group === 'peito' && a.exercise.id !== target.exerciseId));
});

test('alternativas excluem exercícios já usados no treino', () => {
  const target = { exerciseId: 'supino-reto-barra', group: 'peito', portion: 'médio', type: 'composto', equipment: 'barra' };
  const alts = rankAlternatives(target, BASE_LIBRARY, { exclude: new Set(['supino-reto-maquina']) });
  assert.ok(!alts.some((a) => a.exercise.id === 'supino-reto-maquina'));
});

const item = (key, group, extra = {}) => ({
  key, group, skipped: false, doneAt: 0, sets: [{ done: false }], ...extra,
});

test('máquina ocupada: alterna para o grupo antagonista e dá descanso ao último músculo', () => {
  const items = [
    item('a', 'peito', { sets: [{ done: true }], doneAt: 100 }), // último trabalhado: peito
    item('b', 'peito'), // ocupado
    item('c', 'peito'),
    item('d', 'costas'),
  ];
  const { next } = suggestBusy(items, 1);
  assert.equal(next.item.key, 'd');
  assert.match(next.reason, /descansa/);
});

test('máquina ocupada: ignora exercícios concluídos ou pulados', () => {
  const items = [
    item('a', 'peito'), // ocupado
    item('b', 'costas', { skipped: true }),
    item('c', 'costas', { sets: [{ done: true }], doneAt: 5 }),
    item('d', 'peito'),
  ];
  assert.equal(suggestBusy(items, 0).next.item.key, 'd');
});

test('máquina ocupada: sem candidatos retorna null', () => {
  assert.equal(suggestBusy([item('a', 'peito')], 0).next, null);
});

test('biblioteca base: ids únicos e porções preenchidas', () => {
  const ids = new Set(BASE_LIBRARY.map((e) => e.id));
  assert.equal(ids.size, BASE_LIBRARY.length);
  assert.ok(BASE_LIBRARY.every((e) => e.portion && e.how && e.name));
});
