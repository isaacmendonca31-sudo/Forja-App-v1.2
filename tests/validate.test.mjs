// Testes de validação/saneamento (segurança de entrada). Execute: node --test tests/
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cleanText, isId, num, sanitizeSession, sanitizeExercise, sanitizePlan, sanitizeState, validateBackup, sanitizeDraft,
} from '../js/validate.js';
import { buildDefaultPlan } from '../js/data/plan.js';
import { BASE_LIBRARY } from '../js/data/library.js';

test('cleanText remove caracteres de controle e limita tamanho', () => {
  assert.equal(cleanText('  oi\u0000\u0007 mundo  ', 50), 'oi mundo');
  assert.equal(cleanText('a'.repeat(500), 10).length, 10);
  assert.equal(cleanText(123, 10), '');
  assert.equal(cleanText('l1\nl2', 50, { multiline: true }), 'l1\nl2');
  assert.equal(cleanText('l1\nl2', 50), 'l1l2');
});

test('isId aceita só caracteres seguros', () => {
  assert.ok(isId('abc-123_X'));
  for (const bad of ['', 'a b', '../x', '<script>', 'a'.repeat(65), null, 5, '__proto__ ']) assert.ok(!isId(bad), String(bad));
});

test('num valida intervalo e arredonda', () => {
  assert.equal(num('42.555', 0, 1000), 42.56);
  assert.equal(num(-1, 0, 10), null);
  assert.equal(num(NaN, 0, 10), null);
  assert.equal(num(Infinity, 0, 10), null);
  assert.equal(num('abc', 0, 10), null);
  assert.equal(num('', 0, 10), null);
});

test('sessão: descarta séries inválidas e não copia campos desconhecidos', () => {
  const s = sanitizeSession({
    id: 'a1', date: '2026-10-21', title: '<img src=x onerror=alert(1)>', evil: 'x', __proto__: { polluted: true },
    items: [{
      exerciseId: 'e1', name: 'Supino', group: 'peito', extra: 1,
      sets: [{ weight: 40, reps: 10 }, { weight: -5, reps: 10 }, { weight: 40, reps: 0 }, { weight: 'x', reps: 5 }, null],
    }],
  });
  assert.equal(s.items[0].sets.length, 1);
  assert.equal('evil' in s, false);
  assert.equal(({}).polluted, undefined);
  // O texto é preservado como TEXTO (a UI nunca usa innerHTML), apenas limpo e limitado.
  assert.equal(typeof s.title, 'string');
});

test('sessão com data ou id inválidos é rejeitada', () => {
  assert.equal(sanitizeSession({ id: 'ok', date: '2026-13-45', items: [] }), null);
  assert.equal(sanitizeSession({ id: '../x', date: '2026-10-21', items: [] }), null);
});

test('exercício: grupo inválido ou chave de protótipo é rejeitado', () => {
  assert.equal(sanitizeExercise({ id: 'x', name: 'N', group: '__proto__' }), null);
  assert.equal(sanitizeExercise({ id: 'x', name: 'N', group: 'constructor' }), null);
  assert.ok(sanitizeExercise({ id: 'x', name: 'N', group: 'peito' }));
});

test('ficha: repMin > repMax é descartado; dias sem itens válidos permanecem', () => {
  const p = sanitizePlan({ days: [{ id: 'd', weekday: 1, name: 'Seg', title: 'T', items: [
    { id: 'i1', exerciseId: 'e', sets: 3, repMin: 12, repMax: 8 },
    { id: 'i2', exerciseId: 'e', sets: 3, repMin: 8, repMax: 12 },
  ] }] });
  assert.equal(p.days[0].items.length, 1);
});

test('ficha padrão referencia apenas exercícios existentes na biblioteca', () => {
  const ids = new Set(BASE_LIBRARY.map((e) => e.id));
  const plan = buildDefaultPlan();
  assert.equal(plan.days.length, 5);
  for (const d of plan.days) for (const it of d.items) assert.ok(ids.has(it.exerciseId), it.exerciseId);
  // Reaplica o saneamento: a ficha padrão deve ser 100% válida.
  const clean = sanitizePlan(plan);
  assert.equal(clean.days.reduce((a, d) => a + d.items.length, 0), plan.days.reduce((a, d) => a + d.items.length, 0));
});

test('backup: rejeita arquivos que não são do FORJA e versões futuras', () => {
  assert.throws(() => validateBackup({ app: 'outro' }, buildDefaultPlan), /não é um backup/);
  assert.throws(() => validateBackup({ app: 'forja', format: 999, data: {} }, buildDefaultPlan), /versão mais nova/);
  assert.throws(() => validateBackup(null, buildDefaultPlan));
});

test('backup válido é normalizado e itens inválidos são contados', () => {
  const { state, dropped } = validateBackup({
    app: 'forja', format: 1,
    data: { sessions: [{ id: 'ok', date: '2026-10-21', items: [] }, { id: 'bad id', date: 'x' }], customExercises: [] },
  }, buildDefaultPlan);
  assert.equal(state.sessions.length, 1);
  assert.equal(dropped, 1);
  assert.equal(state.plan.days.length, 5); // sem ficha no backup → usa a padrão
});

test('estado: sessões duplicadas (mesmo id) são descartadas', () => {
  const s = { id: 'dup', date: '2026-10-21', items: [] };
  const { state, dropped } = sanitizeState({ sessions: [s, s] }, buildDefaultPlan);
  assert.equal(state.sessions.length, 1);
  assert.equal(dropped, 1);
});

test('rascunho inválido é rejeitado', () => {
  assert.equal(sanitizeDraft({ id: 'x' }), null);
  assert.equal(sanitizeDraft('texto'), null);
});
