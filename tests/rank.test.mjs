// Testes do sistema de ranks. Execute: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeExercise, gradeSession, rankSession, priorSessionsOf, RANKS } from '../js/rank.js';

const sess = (id, date, exerciseId, sets, startedAt = 0) => ({ id, date, startedAt, items: [{ exerciseId, name: exerciseId, sets, planned: { sets: sets.length } }] });
const S = (w, ...reps) => reps.map((r) => ({ weight: w, reps: r }));
const hist = [sess('a', '2026-09-01', 'x', S(40, 10, 10, 10)), sess('b', '2026-09-08', 'x', S(40, 10, 10, 10))];
const grade = (sets, planned = 3, prior = hist) => gradeExercise({ exerciseId: 'x', sets, planned: { sets: planned } }, prior);

test('primeira vez de um exercício é B (referência, nunca punitiva)', () => {
  const g = grade(S(40, 10, 10, 10), 3, []);
  assert.equal(g.rank, 'B');
  assert.ok(g.first);
});

test('manter o desempenho é A', () => {
  assert.equal(grade(S(40, 10, 10, 10)).rank, 'A');
  assert.equal(grade(S(40, 10, 10, 9)).rank, 'A'); // dentro de −2%
});

test('subir carga ou repetições vale S; evolução expressiva vale SSS', () => {
  assert.equal(grade(S(42.5, 10, 10, 10)).rank, 'S');   // +6,3% (um degrau de carga comum)
  assert.equal(grade(S(40, 12, 12, 12)).rank, 'S');     // +5% por repetições
  assert.equal(grade(S(40, 14, 14, 14)).rank, 'SSS');   // +10%
  assert.equal(grade(S(45, 10, 10, 10)).rank, 'SSS');   // +12,5%
});

test('queda leve é B e queda grande é C — mas nunca abaixo de C', () => {
  assert.equal(grade(S(40, 9, 9, 9)).rank, 'B');
  assert.equal(grade(S(30, 10, 10, 10)).rank, 'C');
  assert.ok(RANKS.includes(grade(S(1, 1)).rank));
});

test('poucas séries limitam a nota a A, mesmo com marca alta', () => {
  assert.equal(grade(S(50, 10), 4).rank, 'A');
  assert.equal(grade(S(50, 10, 10, 10), 4).rank, 'SSS');
});

test('voltar de uma semana leve não vira SSS só pelo salto sobre o último treino', () => {
  const prior = [sess('a', '2026-09-01', 'x', S(40, 10, 10, 10)), sess('b', '2026-09-08', 'x', S(32, 10, 10, 10))]; // semana leve
  const g = grade(S(40, 10, 10, 10), 3, prior);
  assert.notEqual(g.rank, 'SSS');
  assert.ok(['A', 'S'].includes(g.rank));
});

test('exercício sem carga compara repetições', () => {
  const prior = [sess('a', '2026-09-01', 'x', S(0, 10, 10)), sess('b', '2026-09-08', 'x', S(0, 10, 10))];
  assert.equal(grade(S(0, 10, 10), 2, prior).rank, 'A');
  assert.equal(grade(S(0, 14, 14), 2, prior).rank, 'SSS');
});

test('sem séries não há nota', () => {
  assert.equal(grade([]), null);
});

const g = (...ranks) => ranks.map((rank) => ({ rank, sets: 3 }));

test('três S garantem SSS; três A garantem S', () => {
  assert.equal(gradeSession(g('S', 'S', 'S', 'C', 'C', 'C')).rank, 'SSS');
  assert.equal(gradeSession(g('A', 'A', 'A', 'B', 'C', 'C')).rank, 'S');
  assert.equal(gradeSession(g('SSS', 'S', 'A', 'S')).rank, 'SSS');
});

test('a quantidade exigida cresce com o número de exercícios (40%)', () => {
  const r = gradeSession(g('A', 'A', 'A', 'C', 'C', 'C', 'C', 'C', 'C', 'C')); // 3 de 10: precisa de 4
  assert.notEqual(r.rank, 'S');
});

test('sem atingir a quantidade, vale a média ponderada', () => {
  assert.equal(gradeSession(g('B', 'B', 'B')).rank, 'B');
  assert.equal(gradeSession(g('A', 'B', 'C')).rank, 'B');
  assert.equal(gradeSession(g('C', 'C')).rank, 'C');
  assert.equal(gradeSession(g('S', 'A')).rank, 'S'); // média 3,5 → S
  assert.equal(gradeSession([]), null);
});

test('exercícios compostos e com mais séries pesam mais na média', () => {
  const heavy = gradeSession([{ rank: 'S', sets: 4, compound: true }, { rank: 'C', sets: 1 }]);
  assert.ok(['S', 'A'].includes(heavy.rank));
});

test('manter tudo já rende nota boa (A) no treino', () => {
  const sessions = [sess('a', '2026-09-01', 'x', S(40, 10, 10, 10)), sess('b', '2026-09-08', 'x', S(40, 10, 10, 10)), sess('c', '2026-09-15', 'x', S(40, 10, 10, 10))];
  const r = rankSession(sessions[2], sessions);
  assert.equal(r.overall.rank, 'A');
  assert.equal(r.items.length, 1);
});

test('priorSessionsOf considera só treinos anteriores e ativos', () => {
  const s1 = sess('a', '2026-09-01', 'x', S(40, 10));
  const s2 = { ...sess('b', '2026-09-01', 'x', S(40, 10), 5), deletedAt: 1 };
  const cur = sess('c', '2026-09-01', 'x', S(40, 10), 10);
  assert.deepEqual(priorSessionsOf(cur, [s1, s2, cur]).map((s) => s.id), ['a']);
});
