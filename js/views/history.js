/**
 * FORJA — Histórico de sessões: lista por mês e detalhe com comparação
 * em relação à sessão anterior do mesmo exercício.
 */
import { h, icon, fmtNum, fmtDateFull, fmtDateShort, parseISODate } from '../utils.js';
import { getSessions, getSession, deleteSession, restoreSession, isDemoSession } from '../store.js';
import { exerciseHistory } from '../suggest.js';
import { GROUPS } from '../data/library.js';
import { pageHead, emptyBlock, toast } from '../ui.js';
import { findRecords } from '../summary.js';
import { announce, haptic } from '../feedback.js';

const volumeOf = (session) => session.items.reduce(
  (acc, it) => acc + it.sets.reduce((a, s) => a + s.weight * s.reps, 0), 0);
const setsOf = (session) => session.items.reduce((acc, it) => acc + it.sets.length, 0);

/** Texto + seta para variações (não depende só de cor: ▲/▼ e sinal). */
function delta(value, unit, digits = 2) {
  if (Math.abs(value) < 0.005) return h('span', { class: 'delta' }, `= sem mudança`);
  const up = value > 0;
  return h('span', { class: `delta ${up ? 'up' : 'down'}` },
    `${up ? '▲ +' : '▼ −'}${fmtNum(Math.abs(value), digits)} ${unit}`);
}

export function render({ params, navigate }) {
  return params.id ? renderDetail(params.id, navigate) : renderList();
}

// ───────────── Lista ─────────────
function renderList() {
  const sessions = getSessions();
  const root = h('div', { class: 'view' }, pageHead('Histórico', { subtitle: `${sessions.length} treino${sessions.length === 1 ? '' : 's'} registrado${sessions.length === 1 ? '' : 's'}` }));

  if (!sessions.length) {
    root.append(emptyBlock({
      iconName: 'history', title: 'Seu histórico começa no primeiro treino',
      text: 'Cada treino finalizado aparece aqui, com séries, volume e a comparação com a vez anterior.',
      actions: [h('a', { class: 'btn primary', href: '#/' }, icon('dumbbell'), 'Ir para o treino de hoje')],
    }));
    return { el: root, title: 'Histórico' };
  }

  let currentMonth = '';
  let list = null;
  for (const s of sessions) {
    const month = parseISODate(s.date).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    if (month !== currentMonth) {
      currentMonth = month;
      root.append(h('h2', { class: 'muted' }, month));
      list = h('ul', { class: 'list' });
      root.append(list);
    }
    list.append(h('li', {},
      h('a', { class: 'list-item', href: `#/historico/${s.id}` },
        h('span', { class: 'day-badge', 'aria-hidden': 'true' }, fmtDateShort(s.date)),
        h('span', { class: 'grow' },
          h('span', { class: 'title' }, s.title), h('br'),
          h('span', { class: 'meta' }, `${setsOf(s)} séries · volume ${fmtNum(volumeOf(s), 0)} kg`)),
        isDemoSession(s) ? h('span', { class: 'tag demo' }, 'Teste') : null)));
  }
  return { el: root, title: 'Histórico' };
}

// ───────────── Detalhe ─────────────
function renderDetail(id, navigate) {
  const session = getSession(id);
  if (!session) {
    return {
      title: 'Treino não encontrado',
      el: h('div', { class: 'view' }, pageHead('Treino não encontrado', { back: '#/historico' }),
        h('a', { class: 'btn primary', href: '#/historico' }, 'Voltar ao histórico')),
    };
  }
  const all = getSessions();
  const minutes = session.endedAt > session.startedAt ? Math.round((session.endedAt - session.startedAt) / 60000) : 0;

  const root = h('div', { class: 'view' },
    pageHead(session.title, { subtitle: fmtDateFull(session.date), back: '#/historico' }),
    isDemoSession(session)
      ? h('div', { class: 'banner warn' }, h('strong', {}, 'Treino de teste'),
        h('p', { class: 'muted small' }, 'Dado simulado do modo desenvolvedor. Não faz parte do seu histórico real, não entra no backup e some ao desligar o modo de teste.'))
      : null,
    h('div', { class: 'stat-grid' },
      h('div', { class: 'stat' }, h('div', { class: 'v' }, String(setsOf(session))), h('div', { class: 'k' }, 'séries')),
      h('div', { class: 'stat' }, h('div', { class: 'v' }, `${fmtNum(volumeOf(session), 0)} kg`), h('div', { class: 'k' }, 'volume total')),
      minutes ? h('div', { class: 'stat' }, h('div', { class: 'v' }, `${minutes} min`), h('div', { class: 'k' }, 'duração')) : null));

  const records = findRecords(session, all);
  if (records.length) {
    root.append(h('div', { class: 'banner ok' },
      h('strong', {}, records.length === 1 ? '1 recorde neste treino' : `${records.length} recordes neste treino`),
      h('p', { class: 'muted small' }, records.map((r) => r.name).join(' · '))));
  }

  for (const it of session.items) {
    // Comparação com a sessão anterior deste exercício.
    const hist = exerciseHistory(all, it.exerciseId);
    const idx = hist.findIndex((x) => x.sessionId === session.id);
    const cur = hist[idx];
    const prev = idx > 0 ? hist[idx - 1] : null;

    const card = h('section', { class: 'card', 'aria-label': it.name },
      h('div', { class: 'card-head' }, h('h2', {}, it.name), h('span', { class: 'tag' }, GROUPS[it.group] ?? '')),
      h('ol', { class: 'stack' }, it.sets.map((s, i) => h('li', { class: 'row between' },
        h('span', { class: 'muted' }, `Série ${i + 1}`),
        h('strong', {}, `${fmtNum(s.weight)} kg × ${s.reps}`)))));

    if (prev && cur) {
      card.append(h('div', { class: 'banner' },
        h('p', { class: 'muted small' }, `Comparado a ${fmtDateShort(prev.date)}:`),
        h('div', { class: 'row wrap' },
          cur.topWeight > 0 || prev.topWeight > 0 ? h('span', {}, 'Carga máx.: ', delta(cur.topWeight - prev.topWeight, 'kg')) : null,
          h('span', {}, 'Volume: ', delta(cur.volume - prev.volume, 'kg', 0)))));
    } else {
      card.append(h('p', { class: 'hint' }, 'Primeiro registro deste exercício.'));
    }
    if (it.note) card.append(h('p', {}, h('span', { class: 'muted' }, 'Obs.: '), it.note));
    root.append(card);
  }

  if (session.note) root.append(h('div', { class: 'card' }, h('h2', {}, 'Observações do treino'), h('p', {}, session.note)));

  // Exclusão com "Desfazer" (mais seguro e rápido do que pedir confirmação).
  // Treinos de teste não são excluídos aqui: saem ao desligar o modo de teste em Ajustes.
  if (!isDemoSession(session)) root.append(h('button', {
    type: 'button', class: 'btn danger block',
    onClick: () => {
      deleteSession(session.id);
      haptic('tap');
      announce('Treino excluído. É possível desfazer.');
      navigate('/historico');
      toast('Treino excluído.', {
        action: 'Desfazer', timeout: 8000,
        onAction: () => { restoreSession(session.id); navigate(`/historico/${session.id}`); },
      });
    },
  }, icon('trash'), 'Excluir treino'));

  return { el: root, title: session.title };
}
