// Testes do gerador de histórico simulado e do isolamento do modo de teste.
import test from 'node:test';
import assert from 'node:assert/strict';
import { generateDemoSessions, makeRng } from '../js/demo.js';
import { buildDefaultPlan } from '../js/data/plan.js';
import { sanitizeSession, isISODate } from '../js/validate.js';
import { exerciseHistory, detectStagnation } from '../js/suggest.js';

const TODAY = new Date(2026, 9, 23); // 23/10/2026 (sexta)
const gen = (opts = {}) => generateDemoSessions({ plan: buildDefaultPlan(), today: TODAY, seed: 1234, ...opts });

test('mesma semente gera o mesmo histórico; semente diferente muda', () => {
  assert.deepEqual(gen(), gen());
  assert.notDeepEqual(gen().sessions.map((s) => s.items[0].sets), gen({ seed: 99 }).sessions.map((s) => s.items[0].sets));
});

test('PRNG fica em [0,1) e é determinístico', () => {
  const a = makeRng(7); const b = makeRng(7);
  for (let i = 0; i < 100; i++) { const v = a(); assert.equal(v, b()); assert.ok(v >= 0 && v < 1); }
});

test('só gera datas anteriores a hoje e dentro do período', () => {
  const { sessions } = gen({ weeks: 8 });
  assert.ok(sessions.length > 10);
  for (const s of sessions) {
    assert.ok(isISODate(s.date));
    assert.ok(s.date < '2026-10-23', `${s.date} não é anterior a hoje`);
    assert.ok(s.date >= '2026-08-31', `${s.date} fora das 8 semanas`);
    assert.ok(s.endedAt > s.startedAt);
  }
});

test('todas as sessões passam pela validação do app e têm ids únicos e marcados', () => {
  const { sessions } = gen({ weeks: 24 });
  const ids = new Set(sessions.map((s) => s.id));
  assert.equal(ids.size, sessions.length);
  for (const s of sessions) {
    assert.ok(s.id.startsWith('demo-'));
    const clean = sanitizeSession(s);
    assert.ok(clean, `inválida: ${s.id}`);
    assert.equal(clean.items.length, s.items.length);
    assert.equal(clean.items.reduce((a, i) => a + i.sets.length, 0), s.items.reduce((a, i) => a + i.sets.length, 0));
  }
});

test('há progressão de carga ao longo das semanas', () => {
  const { sessions } = gen({ weeks: 12 });
  const hist = exerciseHistory(sessions, 'supino-reto-barra');
  assert.ok(hist.length >= 6);
  assert.ok(hist.at(-1).e1rm > hist[0].e1rm, 'o 1RM estimado deveria subir');
});

test('um exercício composto estagna nas últimas semanas (para testar o alerta)', () => {
  const { sessions } = gen({ weeks: 12 });
  const ids = new Set(sessions.flatMap((s) => s.items.map((i) => i.exerciseId)));
  const stagnated = [...ids].filter((id) => detectStagnation(exerciseHistory(sessions, id)).stagnated);
  assert.ok(stagnated.length >= 1, 'esperava ao menos um exercício estagnado');
});

test('limita o período a 1–52 semanas', () => {
  assert.ok(gen({ weeks: 0 }).sessions.length <= 6);
  assert.ok(gen({ weeks: 9999 }).sessions.length <= 52 * 5);
});
