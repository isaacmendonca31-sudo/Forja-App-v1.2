// Testes do resumo de treino e dos recordes. Execute: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionStats, findRecords, recordKind, previousBest, fmtDuration, bestOf } from '../js/summary.js';

const sess = (id, date, exerciseId, sets, extra = {}) => ({
  id, date, startedAt: 0, endedAt: 0, items: [{ exerciseId, name: exerciseId, sets }], ...extra,
});
const sets = (w, ...reps) => reps.map((r) => ({ weight: w, reps: r }));

test('sessionStats soma séries, volume e calcula a duração', () => {
  const s = sessionStats({
    startedAt: 0, endedAt: 47 * 60000 + 20000,
    items: [{ sets: sets(40, 10, 8) }, { sets: sets(20, 12) }, { sets: [] }],
  });
  assert.deepEqual(s, { sets: 3, volume: 40 * 10 + 40 * 8 + 20 * 12, minutes: 47, exercises: 2 });
});

test('sessionStats: sem horário final, duração é 0', () => {
  assert.equal(sessionStats({ startedAt: 5, endedAt: 0, items: [] }).minutes, 0);
});

test('primeiro registro de um exercício não é recorde', () => {
  const now = sess('b', '2026-10-10', 'x', sets(40, 10));
  assert.deepEqual(findRecords(now, [now]), []);
});

test('carga máxima maior é recorde de carga', () => {
  const old = sess('a', '2026-10-03', 'x', sets(40, 10, 10));
  const now = sess('b', '2026-10-10', 'x', sets(42.5, 8, 8));
  const r = findRecords(now, [old, now]);
  assert.equal(r.length, 1);
  assert.deepEqual([r[0].kind, r[0].value, r[0].previous], ['carga', 42.5, 40]);
});

test('mesma carga com mais repetições é recorde de 1RM estimado', () => {
  const old = sess('a', '2026-10-03', 'x', sets(40, 8));
  const now = sess('b', '2026-10-10', 'x', sets(40, 10));
  assert.equal(findRecords(now, [old, now])[0].kind, '1rm');
});

test('desempenho igual ou menor não é recorde', () => {
  const old = sess('a', '2026-10-03', 'x', sets(40, 10));
  assert.deepEqual(findRecords(sess('b', '2026-10-10', 'x', sets(40, 10)), [old]), []);
  assert.deepEqual(findRecords(sess('b', '2026-10-10', 'x', sets(37.5, 10)), [old]), []);
});

test('exercício sem carga compara repetições', () => {
  const prev = bestOf(sets(0, 10, 12));
  assert.equal(recordKind(prev, bestOf(sets(0, 13))), 'reps');
  assert.equal(recordKind(prev, bestOf(sets(0, 12))), null);
});

test('previousBest ignora a própria sessão e as excluídas', () => {
  const a = sess('a', '2026-10-03', 'x', sets(50, 5), { deletedAt: 1 });
  const b = sess('b', '2026-10-04', 'x', sets(40, 5));
  const c = sess('c', '2026-10-05', 'x', sets(60, 5));
  assert.equal(previousBest([a, b, c], 'x', 'c').topWeight, 40);
  assert.equal(previousBest([], 'x'), null);
});

test('fmtDuration', () => {
  assert.equal(fmtDuration(0), '—');
  assert.equal(fmtDuration(48), '48 min');
  assert.equal(fmtDuration(65), '1 h 05 min');
});
