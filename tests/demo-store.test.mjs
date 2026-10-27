// O modo de teste NUNCA pode vazar para os dados reais, o backup ou a sincronização.
import test from 'node:test';
import assert from 'node:assert/strict';

// localStorage falso: os itens guardados são propriedades próprias (Object.keys funciona, como no navegador).
class FakeStorage {
  getItem(k) { return Object.hasOwn(this, k) ? this[k] : null; }
  setItem(k, v) { this[k] = String(v); }
  removeItem(k) { delete this[k]; }
}
const ls = new FakeStorage();
globalThis.localStorage = ls;
const mem = {
  has: (k) => ls.getItem(k) !== null,
  get: (k) => ls.getItem(k),
  set: (k, v) => ls.setItem(k, v),
  keys: () => Object.keys(ls),
};

const store = await import('../js/store.js');
const { buildBackup } = await import('../js/backup.js');
const { validateBackup } = await import('../js/validate.js');
const { buildDefaultPlan } = await import('../js/data/plan.js');

const realSession = () => ({
  date: '2026-10-01', dayId: 'seg', title: 'Real', startedAt: 1, endedAt: 2, note: '',
  items: [{ exerciseId: 'supino-reto-barra', name: 'Supino', group: 'peito', sets: [{ weight: 60, reps: 8 }] }],
});

test('ligar o modo de teste mistura dados só na leitura', () => {
  store.initStore();
  const real = store.addSession(realSession());
  assert.equal(store.getSessions().length, 1);

  assert.equal(store.enableDemoMode({ weeks: 6 }), true);
  assert.ok(store.isDemoMode());
  const all = store.getSessions();
  assert.ok(all.length > 5);
  assert.ok(all.some((s) => s.id === real.id && !s.demo));
  assert.ok(all.filter((s) => s.demo).every((s) => store.isDemoSession(s)));
  assert.ok(store.getSession(all.find((s) => s.demo).id));
});

test('dados simulados não entram no estado real, no backup, na sincronização nem no armazenamento principal', () => {
  const state = store.getState();
  assert.equal(state.sessions.length, 1);
  assert.ok(state.sessions.every((s) => !s.demo && !s.id.startsWith('demo-')));
  assert.ok(buildBackup(state).data.sessions.every((s) => !s.id.startsWith('demo-')));
  assert.ok(store.listRecords().every((r) => !String(r.id).startsWith('demo-')));
  assert.ok(store.dirtyRecords().every((r) => !String(r.id).startsWith('demo-')));
  assert.ok(!mem.get('forja:v1').includes('demo-'));
  assert.ok(!(mem.get('forja:dirty:v1') ?? '').includes('demo-'));
});

test('excluir um id simulado não afeta nada e o export de teste não é um backup importável', () => {
  const demoId = store.getSessions().find((s) => s.demo).id;
  store.deleteSession(demoId);
  assert.ok(store.getSessions().some((s) => s.id === demoId), 'treino de teste não deve ser excluível pelo fluxo real');
  const exp = store.buildDemoExport();
  assert.equal(exp.app, 'forja-demo');
  assert.throws(() => validateBackup(exp, buildDefaultPlan), /não é um backup do FORJA/);
});

test('novos treinos reais feitos com o modo ligado continuam reais', () => {
  const s = store.addSession({ ...realSession(), date: '2026-10-02', title: 'Real 2' });
  assert.ok(!s.demo);
  assert.equal(store.getState().sessions.length, 2);
});

test('o estado de teste sobrevive a recarregar (initStore) e só fica ligado se houver dados', () => {
  store.initStore();
  assert.ok(store.isDemoMode());
  assert.ok(store.getSessions().some((s) => s.demo));
});

test('desligar remove só os dados simulados e preserva os reais', () => {
  store.disableDemoMode();
  assert.equal(store.isDemoMode(), false);
  assert.deepEqual(store.getSessions().map((s) => s.title).sort(), ['Real', 'Real 2']);
  assert.ok(!mem.has('forja:demo:v1') && !mem.has('forja:demo-mode:v1'));
});

test('dados de teste adulterados no armazenamento são saneados', () => {
  mem.set('forja:demo-mode:v1', '1');
  mem.set('forja:demo:v1', JSON.stringify({ sessions: [{ id: '<x>', date: 'x' }, { id: 'demo-ok', date: '2026-10-01', items: [] }] }));
  store.initStore();
  assert.deepEqual(store.getSessions().filter((s) => s.demo).map((s) => s.id), ['demo-ok']);
  store.disableDemoMode();
});

test('apagar dados do aparelho também apaga o modo de teste', () => {
  store.enableDemoMode({ weeks: 4 });
  store.wipeLocalData();
  assert.equal(store.isDemoMode(), false);
  assert.ok(!mem.has('forja:demo-mode:v1'));
  assert.ok(!mem.has('forja:demo:v1'));
});
