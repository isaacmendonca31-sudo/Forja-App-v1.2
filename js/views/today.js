/**
 * FORJA — Tela "Treino" (início).
 *
 * Prioridade de leitura (de cima para baixo):
 *   1. treino em andamento (se houver) → continuar;
 *   2. o treino de HOJE, com o que vem nele e um único botão grande para começar;
 *   3. o ritmo da semana (secundário);
 *   4. os demais treinos da divisão, para quem quiser trocar de dia.
 */
import { h, icon, fmtNum, fmtDateLong, fmtDateShort, weekStartISO, isoDate, parseISODate } from '../utils.js';
import {
  getPlan, getSessions, getExercise, getSettings, loadDraft, clearDraft, getUiFlag, setUiFlag,
} from '../store.js';
import { GROUPS } from '../data/library.js';
import { pageHead, confirmDialog, toast, rankBadge } from '../ui.js';
import { rankSession } from '../rank.js';
import { growBar, announce } from '../feedback.js';
import { sessionStats, findRecords, fmtDuration } from '../summary.js';

/** Resumo dos grupos musculares do dia (ex.: "Peito, Costas"). */
function groupsOf(day) {
  const set = new Set();
  day.items.forEach((it) => {
    const g = getExercise(it.exerciseId)?.group;
    if (g) set.add(GROUPS[g]);
  });
  return [...set].join(', ');
}

/** Estimativa de duração (min): execução ≈ 40 s por série + descanso configurado. */
export function estimateMinutes(day, settings) {
  const seconds = day.items.reduce((acc, it) => {
    const rest = getExercise(it.exerciseId)?.type === 'composto' ? settings.restCompound : settings.restIsolation;
    return acc + it.sets * (40 + rest);
  }, 0);
  return Math.max(5, Math.round(seconds / 60 / 5) * 5);
}

const countSets = (day) => day.items.reduce((acc, it) => acc + it.sets, 0);

function draftProgress(draft) {
  const all = draft.items.filter((i) => !i.skipped).flatMap((i) => i.sets);
  return { total: all.length, done: all.filter((s) => s.done).length };
}

export function render({ rerender }) {
  const plan = getPlan();
  const sessions = getSessions();
  const draft = loadDraft();
  const settings = getSettings();
  const todayISO = isoDate();
  const dow = new Date().getDay();
  const todayDay = plan.days.find((d) => d.weekday === dow);

  const root = h('div', { class: 'view' },
    pageHead('Treino', { subtitle: fmtDateLong(todayISO) }));

  // ───── 1. Treino em andamento ─────
  if (draft) {
    const { total, done } = draftProgress(draft);
    const bar = h('span');
    root.append(h('div', { class: 'banner accent', role: 'region', 'aria-label': 'Treino em andamento' },
      h('div', {},
        h('strong', {}, 'Treino em andamento'),
        h('span', { class: 'muted' }, `${draft.title} · ${done} de ${total} séries · iniciado em ${fmtDateShort(draft.date)}`)),
      h('div', {
        class: 'progress', role: 'progressbar', 'aria-label': 'Séries do treino em andamento',
        'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(done),
      }, bar),
      h('div', { class: 'row wrap' },
        h('a', { class: 'btn primary cta', href: `#/treino/${draft.dayId}` }, icon('play'), 'Continuar'),
        h('button', {
          type: 'button', class: 'btn danger',
          onClick: async () => {
            const ok = await confirmDialog({
              title: 'Descartar treino em andamento?',
              message: 'As séries registradas neste treino serão perdidas.',
              confirmLabel: 'Descartar', danger: true,
            });
            if (ok) { clearDraft(); toast('Treino descartado.'); announce('Treino descartado.'); rerender(); }
          },
        }, 'Descartar'))));
    growBar(bar, total ? (done / total) * 100 : 0);
  }

  // ───── 2. Treino de hoje ─────
  if (todayDay) {
    const doneToday = sessions.some((s) => s.date === todayISO && s.dayId === todayDay.id);
    const resuming = draft?.dayId === todayDay.id;
    const names = todayDay.items.map((it) => getExercise(it.exerciseId)?.name ?? 'Exercício');
    const shown = names.slice(0, 4);
    root.append(h('section', { class: 'card hero', 'aria-labelledby': 'hoje-titulo' },
      h('div', { class: 'hero-top' },
        h('span', { class: 'kicker' }, doneToday ? 'Treino de hoje' : 'Próximo treino'),
        h('span', { class: 'tag accent' }, 'Hoje'),
        doneToday ? h('span', { class: 'tag ok' }, '✓ Concluído') : null),
      h('h2', { id: 'hoje-titulo' }, todayDay.title),
      h('p', { class: 'hero-meta' },
        `${todayDay.items.length} exercícios · ${countSets(todayDay)} séries · ~${estimateMinutes(todayDay, settings)} min · ${groupsOf(todayDay)}`),
      h('ol', { class: 'hero-list', 'aria-label': 'Exercícios do treino' },
        shown.map((n) => h('li', {}, n)),
        names.length > shown.length ? h('li', { class: 'more' }, `e mais ${names.length - shown.length}`) : null),
      h('a', { class: `btn ${doneToday && !resuming ? '' : 'primary'} block cta`, href: `#/treino/${todayDay.id}` },
        icon(resuming ? 'play' : 'dumbbell'),
        resuming ? 'Continuar treino' : doneToday ? 'Treinar novamente' : 'Iniciar treino')));
  } else {
    const next = plan.days.find((d) => d.weekday > dow) ?? plan.days[0];
    root.append(h('section', { class: 'card hero', 'aria-labelledby': 'hoje-titulo' },
      h('div', { class: 'hero-top' }, h('span', { class: 'kicker' }, 'Descanso'), h('span', { class: 'tag' }, 'Hoje')),
      h('h2', { id: 'hoje-titulo' }, 'Dia de descanso'),
      h('p', { class: 'hero-meta' }, 'A recuperação também faz parte da hipertrofia. Se quiser, dá para adiantar o próximo treino.'),
      next ? h('a', { class: 'btn primary block cta', href: `#/treino/${next.id}` },
        icon('dumbbell'), `Adiantar: ${next.name} — ${next.title}`) : null));
  }

  // Primeira vez: três passos curtos (dispensável; guarda só um sinalizador de interface).
  if (!sessions.length && !draft && !getUiFlag('tips-dismissed')) {
    root.append(h('section', { class: 'card tip-card', 'aria-labelledby': 'tips-titulo' },
      h('h2', { id: 'tips-titulo' }, 'Como o FORJA funciona'),
      h('ol', { class: 'tip-steps' },
        h('li', {}, h('span', {}, h('strong', {}, 'Abra o treino do dia. '), 'As séries já vêm com a carga e as repetições da última vez como sugestão.')),
        h('li', {}, h('span', {}, h('strong', {}, 'Toque em ✓ a cada série. '), 'O descanso começa sozinho e o foco passa para a próxima série.')),
        h('li', {}, h('span', {}, h('strong', {}, 'Finalize e veja o resumo. '), 'Recordes, volume e a evolução dos exercícios aparecem em Evolução.'))),
      h('button', {
        type: 'button', class: 'link-btn',
        onClick: () => { setUiFlag('tips-dismissed'); rerender(); },
      }, 'Entendi, ocultar')));
  }

  // ───── 3. Ritmo da semana (secundário) ─────
  const weekStart = weekStartISO();
  const doneDays = new Set(sessions.filter((s) => s.date >= weekStart).map((s) => s.dayId));
  const planned = plan.days.length;
  const doneCount = plan.days.filter((d) => doneDays.has(d.id)).length;
  const monday = parseISODate(weekStart);
  const weekDayLabels = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
  const weekDayNumbers = [1, 2, 3, 4, 5, 6, 0];
  const weekStrip = h('div', { class: 'week-strip', role: 'group', 'aria-label': 'Treinos desta semana' });
  weekDayNumbers.forEach((weekday, index) => {
    const date = new Date(monday);
    date.setDate(date.getDate() + index);
    const dateKey = isoDate(date);
    const day = plan.days.find((item) => item.weekday === weekday);
    const completed = sessions.some((session) => session.date === dateKey);
    const isToday = dateKey === todayISO;
    const state = completed ? 'Treino concluído' : day ? 'Treino planejado' : 'Descanso';
    const content = [
      h('span', { class: 'week-day-label' }, weekDayLabels[index]),
      h('span', { class: 'week-day-letter', 'aria-hidden': 'true' }, completed ? '✓' : day ? day.name.slice(0, 1) : '·'),
      h('span', { class: 'week-day-date' }, String(date.getDate()).padStart(2, '0')),
    ];
    weekStrip.append(day
      ? h('a', {
        class: `week-day${completed ? ' complete' : ''}${isToday ? ' today' : ''}`,
        href: `#/treino/${day.id}`,
        'aria-label': `${weekDayLabels[index]} ${date.getDate()}, ${day.title}, ${state}${isToday ? ', hoje' : ''}`,
        'aria-current': isToday ? 'date' : null,
      }, ...content)
      : h('div', {
        class: `week-day rest${isToday ? ' today' : ''}`,
        'aria-label': `${weekDayLabels[index]} ${date.getDate()}, descanso${isToday ? ', hoje' : ''}`,
      }, ...content));
  });
  const weekFill = h('span');
  root.append(h('section', { class: 'card week-card', 'aria-labelledby': 'semana-titulo' },
    h('div', { class: 'row between' },
      h('h2', { id: 'semana-titulo' }, 'Seu ritmo na semana'),
      h('span', { class: `tag ${doneCount >= planned && planned ? 'ok' : 'accent'}` }, `${doneCount}/${planned} treinos`)),
    h('div', {
      class: 'progress', role: 'progressbar', 'aria-label': 'Treinos concluídos na semana',
      'aria-valuemin': '0', 'aria-valuemax': String(planned), 'aria-valuenow': String(doneCount),
    }, weekFill),
    weekStrip,
    h('p', { class: 'muted small' }, doneCount >= planned && planned
      ? 'Semana completa. Bom trabalho!'
      : 'Toque em um dia para abrir o treino planejado.')));
  growBar(weekFill, planned ? (doneCount / planned) * 100 : 0);

  // ───── Resumo do último treino ─────
  const lastSession = sessions[0];
  if (lastSession) {
    const st = sessionStats(lastSession);
    const recs = findRecords(lastSession, sessions);
    const lastRank = rankSession(lastSession, sessions, (id) => getExercise(id)?.type === 'composto').overall;
    root.append(h('a', { class: 'card last-workout', href: `#/historico/${lastSession.id}`, 'aria-label': `Último treino: ${lastSession.title}, ${fmtDateShort(lastSession.date)}. Abrir detalhes.` },
      h('div', { class: 'row between' },
        h('div', {}, h('span', { class: 'kicker' }, 'Último treino'), h('h2', {}, lastSession.title)),
        h('div', { class: 'row' }, lastRank ? rankBadge(lastRank.rank) : null, h('span', { class: 'muted small' }, fmtDateShort(lastSession.date)))),
      h('div', { class: 'mini-stats' },
        h('div', { class: 'stat' }, h('div', { class: 'v' }, `${fmtNum(st.volume, 0)} kg`), h('div', { class: 'k' }, 'volume')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, String(st.sets)), h('div', { class: 'k' }, 'séries')),
        h('div', { class: 'stat' }, h('div', { class: 'v' }, fmtDuration(st.minutes)), h('div', { class: 'k' }, 'duração'))),
      recs.length ? h('p', { class: 'small' }, h('span', { class: 'pr-badge' }, icon('trophy'), recs.length === 1 ? '1 recorde' : `${recs.length} recordes`)) : null));
  }

  // ───── 4. Outros treinos ─────
  root.append(h('div', { class: 'section-title' }, h('h2', {}, 'Divisão semanal')));
  const list = h('ul', { class: 'list' });
  for (const d of plan.days) {
    const last = sessions.find((s) => s.dayId === d.id);
    list.append(h('li', {},
      h('a', { class: 'list-item', href: `#/treino/${d.id}` },
        h('span', { class: `day-badge${d.weekday === dow ? ' today' : ''}`, 'aria-hidden': 'true' }, d.name.slice(0, 3)),
        h('span', { class: 'grow' },
          h('span', { class: 'title' }, `${d.name} — ${d.title}`), h('br'),
          h('span', { class: 'meta' }, `${d.items.length} exercícios · ${last ? `último: ${fmtDateShort(last.date)}` : 'ainda não registrado'}`)))));
  }
  root.append(list);

  root.append(h('a', { class: 'btn', href: `#/ficha/${(todayDay ?? plan.days[0]).id}` }, icon('edit'), 'Editar ficha'));

  return { el: root, title: 'Treino' };
}
